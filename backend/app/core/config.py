from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ClearCut"
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    data_dir: Path = Path("./data")
    upload_dir: Path = Path("./uploads")
    output_dir: Path = Path("./outputs")
    models_dir: Path = Path("./models")
    rembg_models_dir: Path = Path("./models/rembg")
    logs_dir: Path = Path("./logs")
    provider_settings_encrypt: bool = False
    provider_settings_key: str = ""
    host_output_dir: str = "./outputs"
    host_upload_dir: str = "./uploads"
    log_level: str = "INFO"
    use_only_local: bool = False
    running_in_docker: bool = False
    running_in_tauri: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
