import io
from dataclasses import dataclass
from pathlib import Path
import numpy as np
from PIL import Image, ImageColor, ImageOps
from scipy import ndimage


@dataclass
class PipelineContext:
    image: Image.Image
    alpha_mask: Image.Image | None = None
    locked_keep_mask: np.ndarray | None = None
    locked_remove_mask: np.ndarray | None = None


def read_image(path: Path) -> PipelineContext:
    image = Image.open(path)
    image.load()
    return PipelineContext(image=image)


def normalize_orientation(ctx: PipelineContext) -> PipelineContext:
    ctx.image = ImageOps.exif_transpose(ctx.image)
    return ctx


def decode_processed_bytes(ctx: PipelineContext, content: bytes) -> PipelineContext:
    image = Image.open(io.BytesIO(content)).convert("RGBA")
    image.load()
    alpha = image.getchannel("A")
    ctx.image = image
    ctx.alpha_mask = alpha
    return ctx


def apply_mask_hint(ctx: PipelineContext, content: bytes) -> PipelineContext:
    hint = Image.open(io.BytesIO(content)).convert("RGBA")
    hint.load()
    if hint.size != ctx.image.size:
        hint = hint.resize(ctx.image.size, Image.Resampling.NEAREST)

    if ctx.image.mode != "RGBA":
        ctx.image = ctx.image.convert("RGBA")

    image_data = np.array(ctx.image)
    hint_data = np.array(hint)

    hint_alpha = hint_data[:, :, 3] > 15
    remove_mask = hint_alpha & (hint_data[:, :, 0] > 140) & (hint_data[:, :, 0] > hint_data[:, :, 1] + 30)
    keep_mask = hint_alpha & (hint_data[:, :, 1] > 140) & (hint_data[:, :, 1] > hint_data[:, :, 0] + 30)

    ctx.locked_remove_mask = remove_mask if ctx.locked_remove_mask is None else (ctx.locked_remove_mask | remove_mask)
    ctx.locked_keep_mask = keep_mask if ctx.locked_keep_mask is None else (ctx.locked_keep_mask | keep_mask)

    image_data[:, :, 3] = np.where(ctx.locked_remove_mask, 0, image_data[:, :, 3])
    image_data[:, :, 3] = np.where(ctx.locked_keep_mask, 255, image_data[:, :, 3])

    ctx.image = Image.fromarray(image_data, mode="RGBA")
    ctx.alpha_mask = ctx.image.getchannel("A")
    return ctx


def enforce_locked_masks(ctx: PipelineContext) -> PipelineContext:
    if ctx.locked_keep_mask is None and ctx.locked_remove_mask is None:
        return ctx
    if ctx.image.mode != "RGBA":
        ctx.image = ctx.image.convert("RGBA")
    image_data = np.array(ctx.image)
    if ctx.locked_remove_mask is not None:
        image_data[:, :, 3] = np.where(ctx.locked_remove_mask, 0, image_data[:, :, 3])
    if ctx.locked_keep_mask is not None:
        image_data[:, :, 3] = np.where(ctx.locked_keep_mask, 255, image_data[:, :, 3])
    ctx.image = Image.fromarray(image_data, mode="RGBA")
    ctx.alpha_mask = ctx.image.getchannel("A")
    return ctx


def trim_transparent_bounds(ctx: PipelineContext) -> PipelineContext:
    if ctx.image.mode != "RGBA":
        ctx.image = ctx.image.convert("RGBA")
    alpha = ctx.image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        ctx.image = ctx.image.crop(bbox)
        ctx.alpha_mask = alpha.crop(bbox)
    return ctx


def apply_padding(ctx: PipelineContext, padding: int) -> PipelineContext:
    if padding <= 0:
        return ctx
    w, h = ctx.image.size
    canvas = Image.new("RGBA", (w + (padding * 2), h + (padding * 2)), (0, 0, 0, 0))
    canvas.paste(ctx.image, (padding, padding))
    ctx.image = canvas
    if ctx.alpha_mask is not None:
        alpha_canvas = Image.new("L", canvas.size, 0)
        alpha_canvas.paste(ctx.alpha_mask, (padding, padding))
        ctx.alpha_mask = alpha_canvas
    return ctx


def apply_resize(ctx: PipelineContext, max_width: int | None, max_height: int | None) -> PipelineContext:
    if not max_width and not max_height:
        return ctx
    width, height = ctx.image.size
    ratio_w = (max_width / width) if max_width else 1.0
    ratio_h = (max_height / height) if max_height else 1.0
    ratio = min(ratio_w, ratio_h, 1.0)
    new_size = (max(1, int(width * ratio)), max(1, int(height * ratio)))
    if new_size != (width, height):
        ctx.image = ctx.image.resize(new_size, Image.Resampling.LANCZOS)
        if ctx.alpha_mask is not None:
            ctx.alpha_mask = ctx.alpha_mask.resize(new_size, Image.Resampling.LANCZOS)
    return ctx


def apply_aspect_ratio(ctx: PipelineContext, aspect_ratio: str) -> PipelineContext:
    if not aspect_ratio or aspect_ratio == "keep":
        return ctx

    try:
        left, right = aspect_ratio.split(":")
        target_ratio = float(left) / float(right)
    except (ValueError, ZeroDivisionError):
        return ctx

    width, height = ctx.image.size
    current_ratio = width / height if height else target_ratio

    if abs(current_ratio - target_ratio) < 0.0001:
        return ctx

    if current_ratio > target_ratio:
        canvas_width = width
        canvas_height = max(height, int(round(width / target_ratio)))
    else:
        canvas_height = height
        canvas_width = max(width, int(round(height * target_ratio)))

    x = max(0, (canvas_width - width) // 2)
    y = max(0, (canvas_height - height) // 2)

    canvas = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    canvas.paste(ctx.image, (x, y))
    ctx.image = canvas

    if ctx.alpha_mask is not None:
        alpha_canvas = Image.new("L", canvas.size, 0)
        alpha_canvas.paste(ctx.alpha_mask, (x, y))
        ctx.alpha_mask = alpha_canvas

    return ctx


def apply_background(ctx: PipelineContext, mode: str, color_hex: str) -> PipelineContext:
    if mode == "transparent":
        return ctx
    rgb = ImageColor.getrgb(color_hex)
    base = Image.new("RGB", ctx.image.size, rgb)
    base.paste(ctx.image, mask=ctx.image.split()[-1] if ctx.image.mode == "RGBA" else None)
    ctx.image = base
    return ctx


def apply_alpha_threshold(ctx: PipelineContext, threshold: int) -> PipelineContext:
    if threshold <= 0:
        return ctx
    if ctx.image.mode != "RGBA":
        ctx.image = ctx.image.convert("RGBA")
    image_data = np.array(ctx.image)
    alpha = image_data[:, :, 3]
    alpha = np.where(alpha < threshold, 0, alpha).astype(np.uint8)
    image_data[:, :, 3] = alpha
    ctx.image = Image.fromarray(image_data, mode="RGBA")
    ctx.alpha_mask = ctx.image.getchannel("A")
    return enforce_locked_masks(ctx)


def apply_edge_feather(ctx: PipelineContext, radius: int) -> PipelineContext:
    if radius <= 0:
        return ctx
    if ctx.image.mode != "RGBA":
        ctx.image = ctx.image.convert("RGBA")
    image_data = np.array(ctx.image)
    alpha = image_data[:, :, 3].astype(np.float32)
    alpha = ndimage.gaussian_filter(alpha, sigma=max(radius / 2.0, 0.5))
    image_data[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    ctx.image = Image.fromarray(image_data, mode="RGBA")
    ctx.alpha_mask = ctx.image.getchannel("A")
    return enforce_locked_masks(ctx)


def cleanup_white_halo(ctx: PipelineContext, strength: int) -> PipelineContext:
    if strength <= 0:
        return ctx
    if ctx.image.mode != "RGBA":
        ctx.image = ctx.image.convert("RGBA")
    image_data = np.array(ctx.image).astype(np.float32)
    alpha = image_data[:, :, 3:4] / 255.0
    blend = np.clip(strength / 100.0, 0.0, 1.0)
    safe_alpha = np.clip(alpha, 1e-4, 1.0)
    corrected = (image_data[:, :, :3] - ((1.0 - safe_alpha) * 255.0)) / safe_alpha
    corrected = np.clip(corrected, 0.0, 255.0)
    mixed = (image_data[:, :, :3] * (1.0 - blend)) + (corrected * blend)
    image_data[:, :, :3] = np.where(alpha > 0.0, mixed, image_data[:, :, :3])
    ctx.image = Image.fromarray(np.clip(image_data, 0, 255).astype(np.uint8), mode="RGBA")
    ctx.alpha_mask = ctx.image.getchannel("A")
    return enforce_locked_masks(ctx)
