"""End-to-end smoke test: one real batch per workspace mode.

There is no test suite, and typechecking the frontend proves nothing about the
pipeline. This drives the running backend over HTTP exactly as the app does -
ingest paths, create a job, poll to a terminal state - then asserts each mode
produced what it promises: format, transparency, and the 2x factor measured
against the cutout rather than the source, since trimming runs first.

    python backend/run.py                       # in another shell, from backend/
    python backend/scripts/smoke_batch.py http://127.0.0.1:8000 sample-images

Exits non-zero on the first mismatch. Needs the cutout models installed in
whatever models dir the backend resolved - see the note about relative paths
in AGENTS.md.
"""
import json, sys, time, urllib.request
from pathlib import Path
from PIL import Image

API = sys.argv[1]
SRC = Path(sys.argv[2])

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read() or "null")

BASE = {
    "workflow_mode": "cutout_only", "processing_order": "cutout_then_enhance",
    "preset": "quick_cutout", "provider_priority": ["rembg_local"],
    "remove_background": True, "cutout_engine": "rembg", "cutout_model_id": "u2netp",
    "local_model": "u2netp", "local_quality_preset": "balanced", "enhance_level": "off",
    "enhance_engine": "realesrgan", "enhance_model": None, "preprocess_denoise": False,
    "preprocess_color_normalization": False, "preprocess_sharpening": False,
    "fallback_to_api": False, "trim_transparent_bounds": True, "padding": 0,
    "resize_mode": "keep", "resize_max_width": None, "resize_max_height": None,
    "aspect_ratio": "keep", "background_mode": "transparent", "background_color": "#ffffff",
    "output_dir_override": None, "output_format": "png", "quality": 90,
    "strip_metadata": True, "naming_mode": "pattern",
    "filename_pattern": "{original_name}_{preset}_{engine}", "naming_regex_find": "",
    "naming_regex_replace": "", "ocr_language": "eng", "ocr_max_length": 48,
    "alpha_threshold": 10, "edge_feather_radius": 1, "white_halo_cleanup": 35,
    "save_alpha_mask": False,
}

# Mirrors WORKFLOW_MODES in frontend/src/features/jobs/workflow-modes.ts
MODES = [
    ("Remove background", {"workflow_mode": "cutout_only", "remove_background": True,
                           "enhance_level": "off", "output_format": "png",
                           "background_mode": "transparent"}),
    ("Optimize images",   {"workflow_mode": "enhance_only", "remove_background": False,
                           "enhance_level": "off", "output_format": "webp",
                           "background_mode": "transparent"}),
    ("Remove and upscale",{"workflow_mode": "cutout_enhance", "remove_background": True,
                           "enhance_level": "2x", "output_format": "png",
                           "background_mode": "transparent"}),
]

paths = [str(p.resolve()) for p in sorted(SRC.iterdir())
         if p.suffix.lower() in {".webp", ".jpg", ".jpeg", ".png"}]
if not paths:
    sys.exit(f"no images in {SRC}")
uploads = call("POST", "/jobs/ingest-paths", {"paths": paths})
print(f"ingeridas {len(uploads)} imagens: {[Path(u['path']).name for u in uploads]}")
sizes = {Path(u["path"]).name: Image.open(u["path"]).size for u in uploads}
print(f"tamanhos de origem: {sizes}\n")

failures = []
cutout_sizes = {}   # baseline for the upscale check
for label, overrides in MODES:
    opts = {**BASE, **overrides}
    started = time.perf_counter()
    job_id = call("POST", "/jobs", {"upload_ids": [u["upload_id"] for u in uploads],
                                    "options": opts})["job_id"]
    while True:
        job = call("GET", f"/jobs/{job_id}")
        if job["state"] in ("done", "failed", "canceled"):
            break
        time.sleep(0.4)
    elapsed = time.perf_counter() - started

    print(f"-- {label}: {job['state']} em {elapsed:.1f}s, progresso {job['progress']}%")
    for f in job["files"]:
        name = Path(f["input_path"]).name
        if f["state"] != "done":
            failures.append(f"{label}/{name}: {f['state']} {f.get('error_message')}")
            print(f"   {name}: FALHOU {f.get('error_message')}")
            continue
        out = Path(f["output_path"])
        img = Image.open(out)
        alpha = img.convert("RGBA").getchannel("A")
        transparent = alpha.getextrema()[0] < 255
        src_w, src_h = sizes[name]
        scale = img.width / src_w
        print(f"   {name}: {out.name}  {img.format} {img.size} "
              f"escala={scale:.2f}x alpha={'sim' if transparent else 'nao'} "
              f"{out.stat().st_size/1024:.0f}KB  [{f['engine_used']}]")

        fmt = "PNG" if overrides["output_format"] == "png" else "WEBP"
        if img.format != fmt:
            failures.append(f"{label}/{name}: formato {img.format}, esperado {fmt}")
        if overrides["remove_background"] and not transparent:
            failures.append(f"{label}/{name}: sem transparencia apesar do recorte")
        if not overrides["remove_background"] and img.size != (src_w, src_h):
            failures.append(f"{label}/{name}: redimensionou sem pedir ({img.size} vs {(src_w, src_h)})")
        if overrides["workflow_mode"] == "cutout_only":
            cutout_sizes[name] = img.size
        if overrides["enhance_level"] == "2x":
            # Compare against the cutout, not the source: trimming transparent
            # bounds runs first, so the 2x applies to a much smaller canvas.
            base_w = cutout_sizes.get(name, (src_w, src_h))[0]
            factor = img.width / base_w
            print(f"      -> {factor:.2f}x sobre o recorte de {base_w}px")
            if not (1.8 <= factor <= 2.2):
                failures.append(f"{label}/{name}: upscale {factor:.2f}x, esperado ~2x")
    print()

print("=" * 60)
print("TUDO OK" if not failures else "FALHAS:\n  " + "\n  ".join(failures))
sys.exit(1 if failures else 0)
