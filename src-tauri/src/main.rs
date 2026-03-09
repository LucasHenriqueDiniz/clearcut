#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
struct DesktopRuntime {
    backend_url: String,
    data_dir: String,
    upload_dir: String,
    output_dir: String,
    models_dir: String,
    logs_dir: String,
    is_tauri: bool,
}

#[derive(Clone)]
struct RuntimePaths {
    data_dir: PathBuf,
    upload_dir: PathBuf,
    output_dir: PathBuf,
    models_dir: PathBuf,
    logs_dir: PathBuf,
}

struct BackendRuntimeState {
    child: Mutex<Option<Child>>,
    runtime: Mutex<Option<DesktopRuntime>>,
}

impl Default for BackendRuntimeState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            runtime: Mutex::new(None),
        }
    }
}

fn is_supported_image(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()),
        Some(ext)
            if matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif" | "tif" | "tiff" | "heic" | "heif" | "avif"
            )
    )
}

fn runtime_paths(app: &AppHandle) -> Result<RuntimePaths, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?;

    let paths = RuntimePaths {
        data_dir: app_data.join("data"),
        upload_dir: app_data.join("uploads"),
        output_dir: app_data.join("outputs"),
        models_dir: app_data.join("models"),
        logs_dir: app_data.join("logs"),
    };

    for path in [
        &paths.data_dir,
        &paths.upload_dir,
        &paths.output_dir,
        &paths.models_dir,
        &paths.logs_dir,
    ] {
        fs::create_dir_all(path).map_err(|err| err.to_string())?;
    }

    Ok(paths)
}

fn allocate_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| err.to_string())?;
    listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|err| err.to_string())
}

fn dev_backend_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri parent")
        .join("backend")
}

fn build_dev_command(backend_root: &Path, port: u16, paths: &RuntimePaths) -> Result<Command, String> {
    let venv_windows = backend_root.join(".venv").join("Scripts").join("python.exe");
    let venv_unix = backend_root.join(".venv").join("bin").join("python");
    let interpreter = if venv_windows.is_file() {
        venv_windows
    } else if venv_unix.is_file() {
        venv_unix
    } else {
        return Err(format!(
            "Backend virtualenv not found. Expected {} or {}",
            venv_windows.display(),
            venv_unix.display()
        ));
    };

    let import_check = Command::new(&interpreter)
        .arg("-c")
        .arg("import uvicorn")
        .output()
        .map_err(|err| format!("Failed to verify backend Python environment: {err}"))?;
    if !import_check.status.success() {
        let stderr = String::from_utf8_lossy(&import_check.stderr);
        return Err(format!(
            "Backend Python environment is missing dependencies (uvicorn). \
Run backend dependency install first: `cd backend && .venv\\\\Scripts\\\\python.exe -m pip install -r requirements.txt`.\nDetails: {stderr}"
        ));
    }

    let script_path = backend_root.join("desktop_entry.py");
    let mut command = Command::new(interpreter);
    command.arg(script_path);
    command.current_dir(backend_root);
    apply_backend_env(&mut command, port, paths);
    Ok(command)
}

fn build_packaged_command(app: &AppHandle, port: u16, paths: &RuntimePaths) -> Result<Command, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|err| err.to_string())?;

    let exe_name = if cfg!(target_os = "windows") {
        "ipu-backend.exe"
    } else {
        "ipu-backend"
    };

    let backend_executable = resource_dir.join("backend").join(exe_name);
    if !backend_executable.exists() {
        return Err(format!(
            "Packaged backend sidecar not found at {}",
            backend_executable.display()
        ));
    }

    let mut command = Command::new(backend_executable);
    apply_backend_env(&mut command, port, paths);
    Ok(command)
}

fn apply_backend_env(command: &mut Command, port: u16, paths: &RuntimePaths) {
    command.env("BACKEND_HOST", "127.0.0.1");
    command.env("BACKEND_PORT", port.to_string());
    command.env("DATA_DIR", &paths.data_dir);
    command.env("UPLOAD_DIR", &paths.upload_dir);
    command.env("OUTPUT_DIR", &paths.output_dir);
    command.env("MODELS_DIR", &paths.models_dir);
    command.env("LOGS_DIR", &paths.logs_dir);
    command.env("RUNNING_IN_TAURI", "true");
    command.env("RUNNING_IN_DOCKER", "false");
    command.env("HOST_OUTPUT_DIR", &paths.output_dir);
    command.env("HOST_UPLOAD_DIR", &paths.upload_dir);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
}

fn wait_for_health(url: &str, child: &mut Child, sidecar_log_path: &Path) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|err| err.to_string())?;

    let health_url = format!("{url}/health");
    for _ in 0..80 {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "Backend exited before health check (status: {status}). Check log: {}",
                sidecar_log_path.display()
            ));
        }
        match client.get(&health_url).send() {
            Ok(response) if response.status().is_success() => return Ok(()),
            _ => thread::sleep(Duration::from_millis(250)),
        }
    }

    Err(format!(
        "Backend did not become healthy at {health_url}. Check log: {}",
        sidecar_log_path.display()
    ))
}

fn read_log_tail(path: &Path, max_lines: usize) -> String {
    let Ok(raw) = fs::read_to_string(path) else {
        return String::new();
    };
    let lines = raw.lines().collect::<Vec<_>>();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

fn ensure_backend(app: &AppHandle, state: &BackendRuntimeState) -> Result<DesktopRuntime, String> {
    if let Some(runtime) = state.runtime.lock().map_err(|err| err.to_string())?.clone() {
        return Ok(runtime);
    }

    let paths = runtime_paths(app)?;
    let port = allocate_port()?;
    let backend_url = format!("http://127.0.0.1:{port}");

    let mut command = if cfg!(debug_assertions) {
        build_dev_command(&dev_backend_root(), port, &paths)?
    } else {
        build_packaged_command(app, port, &paths)?
    };

    let sidecar_log_path = paths.logs_dir.join("backend-sidecar.log");
    let sidecar_log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&sidecar_log_path)
        .map_err(|err| format!("Could not open sidecar log file: {err}"))?;
    let sidecar_log_err = sidecar_log
        .try_clone()
        .map_err(|err| format!("Could not clone sidecar log handle: {err}"))?;
    command.stdout(Stdio::from(sidecar_log));
    command.stderr(Stdio::from(sidecar_log_err));

    let mut child = command
        .spawn()
        .map_err(|err| format!("Failed to start backend: {err}"))?;

    if let Err(error) = wait_for_health(&backend_url, &mut child, &sidecar_log_path) {
        let log_tail = read_log_tail(&sidecar_log_path, 30);
        let _ = child.kill();
        let _ = child.wait();
        if log_tail.is_empty() {
            return Err(error);
        }
        return Err(format!("{error}\n\nLast backend log lines:\n{log_tail}"));
    }

    let runtime = DesktopRuntime {
        backend_url,
        data_dir: paths.data_dir.to_string_lossy().to_string(),
        upload_dir: paths.upload_dir.to_string_lossy().to_string(),
        output_dir: paths.output_dir.to_string_lossy().to_string(),
        models_dir: paths.models_dir.to_string_lossy().to_string(),
        logs_dir: paths.logs_dir.to_string_lossy().to_string(),
        is_tauri: true,
    };

    *state.child.lock().map_err(|err| err.to_string())? = Some(child);
    *state.runtime.lock().map_err(|err| err.to_string())? = Some(runtime.clone());

    Ok(runtime)
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }
}

fn reveal_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path.to_string_lossy()])
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = path.parent().ok_or_else(|| "Path has no parent".to_string())?;
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }
}

#[tauri::command]
fn bootstrap_backend(app: AppHandle, state: State<BackendRuntimeState>) -> Result<DesktopRuntime, String> {
    ensure_backend(&app, &state)
}

#[tauri::command]
fn list_supported_images_in_directory(directory: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(directory);
    if !path.exists() {
        return Err("Selected directory does not exist".to_string());
    }

    let mut files = WalkDir::new(path)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file() && is_supported_image(entry.path()))
        .map(|entry| entry.path().to_string_lossy().to_string())
        .collect::<Vec<_>>();

    files.sort();
    Ok(files)
}

#[tauri::command]
fn copy_files_to_directory(paths: Vec<String>, target_dir: String) -> Result<usize, String> {
    let target = PathBuf::from(&target_dir);
    fs::create_dir_all(&target).map_err(|err| err.to_string())?;

    let mut copied = 0usize;
    for source in paths {
        let source_path = PathBuf::from(&source);
        if !source_path.exists() {
            continue;
        }
        let file_name = source_path
            .file_name()
            .ok_or_else(|| format!("Invalid source file: {}", source_path.display()))?;
        fs::copy(&source_path, target.join(file_name)).map_err(|err| err.to_string())?;
        copied += 1;
    }

    Ok(copied)
}

#[tauri::command]
fn open_path_in_os(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let target = match path {
        Some(value) => PathBuf::from(value),
        None => runtime_paths(&app)?.output_dir,
    };

    open_path(&target)
}

#[tauri::command]
fn reveal_file_in_os(path: String) -> Result<(), String> {
    reveal_path(Path::new(&path))
}

fn shutdown_backend(state: &BackendRuntimeState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }
}

fn main() {
    let state = BackendRuntimeState::default();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            bootstrap_backend,
            list_supported_images_in_directory,
            copy_files_to_directory,
            open_path_in_os,
            reveal_file_in_os
        ])
        .build(tauri::generate_context!())
        .expect("failed to build tauri app");

    let app_handle = app.handle().clone();
    app.run(move |_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<BackendRuntimeState>();
            shutdown_backend(&state);
        }
    });
}
