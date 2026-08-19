"""Render the before/after thumbnails the options panel shows.

Each tile runs the real pipeline twice - once with the option off, once on,
everything else held equal - so a preview cannot drift from what the option
actually does. Re-run after changing pipelines/steps.py:

    python backend/scripts/generate_option_previews.py         <source-images-dir> frontend/public/option-previews <scratch-dir>

Only options with a legible effect at thumbnail size are listed. Edge
refinements that move a handful of pixels (alpha threshold, halo cleanup) are
deliberately absent: magnified enough to see, they stop looking like the
option and start looking like noise. Those get wording instead.
"""
import shutil, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

REPO = Path("E:/Repositories/remove-bgs-app")
sys.path.insert(0, str(REPO / "backend"))

from app.core.config import settings
home = Path.home() / ".u2net"
models = Path(settings.rembg_models_dir).expanduser().resolve()
models.mkdir(parents=True, exist_ok=True)
for f in home.glob("*.onnx"):
    if not (models / f.name).exists():
        shutil.copy2(f, models / f.name)

from app.pipelines.engine import processing_engine
from app.schemas.jobs import ProcessingOptions, JobExecutionConfig

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
WORK = Path(sys.argv[3]); WORK.mkdir(parents=True, exist_ok=True)

TILE = (320, 240)          # 2x for crisp rendering at 160x120
PANEL = (16, 16, 19)       # matches --bg of the settings panel

BASE = dict(
    cutout_model_id="birefnet-general-lite",
    local_quality_preset="balanced",
    fallback_to_api=False,
    provider_priority=["rembg_local"],
    output_format="png",
    remove_background=True,
    # Off. Trimming to the alpha bbox makes the two runs different sizes, and
    # then they cannot be diffed pixel for pixel.
    trim_transparent_bounds=False,
)

# (slug, source, shared overrides, OFF state, ON state, zoom)
# Both runs share everything except the single option under test - otherwise
# the tile shows a difference the option did not cause.
FULL, EDGE, MICRO = "full", "edge", "micro"
CASES = [
    ("cutout-quality",  "2.webp", {}, dict(local_quality_preset="balanced"), dict(local_quality_preset="hq"), MICRO),
    ("edge-feather",    "2.webp", {}, dict(edge_feather_radius=0), dict(edge_feather_radius=4), MICRO),
    # u2netp leaves a much softer alpha than birefnet, which is the situation
    # these two options exist for.
    ("trim-bounds",     "3.webp", {}, dict(trim_transparent_bounds=False), dict(trim_transparent_bounds=True), FULL),
    ("solid-bg",        "3.webp", {}, dict(background_mode="transparent"), dict(background_mode="solid", background_color="#ffffff"), FULL),
    ("denoise",         "1.webp", dict(remove_background=False), dict(preprocess_denoise=False), dict(preprocess_denoise=True), EDGE),
    ("sharpen",         "2.webp", dict(remove_background=False), dict(preprocess_sharpening=False), dict(preprocess_sharpening=True), EDGE),
]


def run(src: Path, overrides: dict, tag: str) -> Image.Image:
    opts = ProcessingOptions(**{**BASE, **overrides})
    cfg = JobExecutionConfig(output_dir_override=str(WORK / tag))
    res = processing_engine.process_file(src, opts, execution_config=cfg)
    return Image.open(res["output_path"]).convert("RGBA")


def flatten(img: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", img.size, PANEL + (255,))
    return Image.alpha_composite(bg, img).convert("RGB")


def focus_box(a: Image.Image, b: Image.Image, zoom: str) -> tuple:
    """Window the crop on the region the option actually changes.

    Edge effects (matting, feather, halo) move a handful of pixels along a
    silhouette. Shown across a whole subject they are invisible, so those cases
    get a small window placed where the difference is densest.
    """
    ar = TILE[0] / TILE[1]
    if zoom == FULL or a.size != b.size:
        w = min(a.width, a.height * ar); h = w / ar
        return (int((a.width - w) / 2), int((a.height - h) / 2),
                int((a.width + w) / 2), int((a.height + h) / 2))

    # a/b arrive already flattened: feather, threshold and halo cleanup only
    # move the alpha channel, and converting RGBA->RGB would discard exactly
    # the difference we are looking for.
    diff = ImageChops.difference(a, b).convert("L")
    # Blur-free density scan: shrink, find the brightest cell, map back.
    # MICRO magnifies ~8x: a soft edge is a handful of pixels wide and only
    # reads as "soft" once it fills a visible part of the tile.
    win_w = 40 if zoom == MICRO else max(56, a.width // 7)
    win_h = win_w / ar
    cells = (max(1, int(a.width / (win_w / 2))), max(1, int(a.height / (win_h / 2))))
    small = diff.resize(cells, Image.Resampling.BOX)
    data = list(small.getdata())
    peak = max(range(len(data)), key=lambda i: data[i])
    if data[peak] < 2:
        raise SystemExit(f"no visible difference for this option ({data[peak]})")
    cx = (peak % cells[0] + 0.5) * a.width / cells[0]
    cy = (peak // cells[0] + 0.5) * a.height / cells[1]
    x = min(max(cx - win_w / 2, 0), a.width - win_w)
    y = min(max(cy - win_h / 2, 0), a.height - win_h)
    return (int(x), int(y), int(x + win_w), int(y + win_h))


def diagonal_split(before: Image.Image, after: Image.Image) -> Image.Image:
    """Before in the top-left triangle, after in the bottom-right."""
    tile = Image.new("RGB", TILE, PANEL)
    b = before.resize(TILE, Image.Resampling.LANCZOS)
    a = after.resize(TILE, Image.Resampling.LANCZOS)
    mask = Image.new("L", TILE, 0)
    ImageDraw.Draw(mask).polygon([(0, 0), (TILE[0], 0), (0, TILE[1])], fill=255)
    tile.paste(a, (0, 0))
    tile.paste(b, (0, 0), mask)
    # Hairline so the two halves read as a comparison, not one odd image.
    ImageDraw.Draw(tile).line([(TILE[0], 0), (0, TILE[1])], fill=(255, 255, 255), width=2)
    return tile


for slug, name, shared, off_state, on_state, zoom in CASES:
    src = SRC / name
    off_flat = flatten(run(src, {**shared, **off_state}, f"{slug}-off"))
    on_flat = flatten(run(src, {**shared, **on_state}, f"{slug}-on"))
    off, on = off_flat, on_flat
    try:
        box = focus_box(off_flat, on_flat, zoom)
    except SystemExit as exc:
        print(f"{slug:16s} SKIPPED - {exc}")
        continue
    on_box = box if on.size == off.size else focus_box(on, on, FULL)
    tile = diagonal_split(off_flat.crop(box), on_flat.crop(on_box))
    dest = OUT / f"{slug}.webp"
    tile.save(dest, format="WEBP", quality=88, method=6)
    print(f"{slug:16s} {name}  crop={box}  {dest.stat().st_size/1024:.1f} KB")
