import io
import json
from pathlib import Path
from PIL import Image, ImageFilter, UnidentifiedImageError
from app.pipelines.steps import (
    apply_background,
    apply_alpha_threshold,
    apply_color_normalization,
    apply_denoise,
    apply_edge_feather,
    apply_mask_hint,
    apply_padding,
    apply_aspect_ratio,
    apply_resize,
    apply_sharpening,
    cleanup_white_halo,
    decode_processed_bytes,
    enforce_locked_masks,
    normalize_orientation,
    read_image,
    trim_transparent_bounds,
)
from app.providers.registry import provider_registry
from app.schemas.jobs import JobExecutionConfig, ProcessingOptions
from app.storage.filesystem import storage
from app.utils.naming import resolve_output_name


class ProcessingEngine:
    @staticmethod
    def _uses_cutout(options: ProcessingOptions) -> bool:
        return options.remove_background

    @staticmethod
    def _uses_enhance(options: ProcessingOptions) -> bool:
        return options.enhance_level in {"2x", "4x"}

    @staticmethod
    def _enhance_image(ctx, options: ProcessingOptions):
        factor = 2 if options.enhance_level == "2x" else 4
        # Lightweight fallback enhancement path until external ESRGAN worker is integrated.
        base_image = ctx.image
        target_size = (max(1, base_image.width * factor), max(1, base_image.height * factor))
        upscaled = base_image.resize(target_size, resample=Image.Resampling.LANCZOS)
        upscaled = upscaled.filter(ImageFilter.UnsharpMask(radius=1.4, percent=120, threshold=2))
        ctx.image = upscaled
        if ctx.alpha_mask is not None:
            ctx.alpha_mask = ctx.alpha_mask.resize(target_size, resample=Image.Resampling.LANCZOS)
        return ctx

    def _apply_lightweight_preprocess(self, ctx, options: ProcessingOptions):
        if options.preprocess_denoise:
            ctx = apply_denoise(ctx)
        if options.preprocess_color_normalization:
            ctx = apply_color_normalization(ctx)
        if options.preprocess_sharpening:
            ctx = apply_sharpening(ctx)
        return ctx

    def _run_cutout(
        self,
        ctx,
        options: ProcessingOptions,
    ):
        source_buffer = io.BytesIO()
        ctx.image.save(source_buffer, format="PNG")
        selected = provider_registry.remove_background(
            source_buffer.getvalue(),
            model=options.cutout_model_id,
            quality_preset=options.local_quality_preset,
            provider_priority=options.provider_priority,
            allow_external=options.fallback_to_api,
        )
        ctx = decode_processed_bytes(ctx, selected.result.content)
        return ctx, selected.result.engine_used, selected.result.provider_used, selected.via_api

    def _run_enhance(self, ctx, options: ProcessingOptions, engine_parts: list[str], provider_parts: list[str], stage: str):
        if not self._uses_enhance(options):
            return ctx
        ctx = self._enhance_image(ctx, options)
        engine_parts.append(f"enhance:{options.enhance_engine}:{options.enhance_level}:{stage}")
        provider_parts.append("enhance_local")
        return ctx

    def _cutout(self, ctx, options: ProcessingOptions, engine_parts: list[str], provider_parts: list[str]):
        if not self._uses_cutout(options):
            return ctx, False
        ctx, cutout_engine, cutout_provider, cutout_external = self._run_cutout(ctx, options)
        engine_parts.append(cutout_engine)
        provider_parts.append(cutout_provider)
        return ctx, cutout_external

    def _refine(self, ctx, options: ProcessingOptions, cutout_enabled: bool, mask_hint_bytes: bytes | None = None):
        if cutout_enabled:
            ctx = apply_alpha_threshold(ctx, options.alpha_threshold)
            ctx = cleanup_white_halo(ctx, options.white_halo_cleanup)
            ctx = apply_edge_feather(ctx, options.edge_feather_radius)
        if mask_hint_bytes:
            ctx = apply_mask_hint(ctx, mask_hint_bytes)
            ctx = enforce_locked_masks(ctx)
        return ctx

    def _postprocess(self, ctx, options: ProcessingOptions, cutout_enabled: bool):
        if cutout_enabled and options.trim_transparent_bounds:
            ctx = trim_transparent_bounds(ctx)
        ctx = apply_padding(ctx, options.padding)
        resize_max_width = options.resize_max_width if options.resize_mode == "custom" else None
        resize_max_height = options.resize_max_height if options.resize_mode == "custom" else None
        ctx = apply_resize(ctx, resize_max_width, resize_max_height)
        ctx = apply_aspect_ratio(ctx, options.aspect_ratio)
        ctx = apply_background(ctx, options.background_mode, options.background_color)
        return ctx

    def process_file(
        self,
        image_path: Path,
        options: ProcessingOptions,
        execution_config: JobExecutionConfig | None = None,
        sequence_number: int = 1,
        mask_hint_bytes: bytes | None = None,
    ) -> dict:
        try:
            ctx = read_image(image_path)
        except UnidentifiedImageError as exc:
            raise RuntimeError(f"Corrupted or unsupported image: {image_path.name}") from exc

        ctx = normalize_orientation(ctx)
        original_name = image_path.stem
        source_image = ctx.image.copy()
        cutout_enabled = self._uses_cutout(options)

        engine_parts: list[str] = []
        provider_parts: list[str] = []
        used_external = False

        # Pipeline execution:
        # lightweight preprocess -> optional enhance -> cutout -> refine -> optional enhance -> postprocess -> export
        ctx = self._apply_lightweight_preprocess(ctx, options)
        enhance_before_cutout = (
            not cutout_enabled
            or options.processing_order == "enhance_then_cutout"
        )
        if enhance_before_cutout:
            ctx = self._run_enhance(ctx, options, engine_parts, provider_parts, stage="pre")
        ctx, cutout_external = self._cutout(ctx, options, engine_parts, provider_parts)
        used_external = used_external or cutout_external
        ctx = self._refine(ctx, options, cutout_enabled=cutout_enabled, mask_hint_bytes=mask_hint_bytes)
        if cutout_enabled and options.processing_order == "cutout_then_enhance":
            ctx = self._run_enhance(ctx, options, engine_parts, provider_parts, stage="post")
        ctx = self._postprocess(ctx, options, cutout_enabled=cutout_enabled)

        if not engine_parts:
            engine_used = "none"
            provider_used = "none"
        else:
            engine_used = "+".join(engine_parts)
            provider_used = "+".join(provider_parts)

        output_format = "jpeg" if options.output_format == "jpg" else options.output_format
        output_override = (
            Path(execution_config.output_dir_override).expanduser().resolve()
            if execution_config and execution_config.output_dir_override
            else (
                Path(options.output_dir_override).expanduser().resolve()
                if options.output_dir_override
                else None
            )
        )
        flat_output = execution_config is not None and execution_config.source == "watch_folder"
        safe_filename = resolve_output_name(
            options=options,
            original_name=original_name,
            engine_used=engine_used,
            source_image=source_image,
            sequence_number=sequence_number,
            output_format=output_format,
        )

        output_path = storage.output_path_for(
            safe_filename,
            output_format,
            base_dir=output_override,
            flat=flat_output,
        )

        save_kwargs = {}
        if output_format in {"jpeg", "jpg", "webp", "avif"}:
            save_kwargs["quality"] = options.quality
        if options.strip_metadata:
            save_kwargs["exif"] = b""

        image_for_export = ctx.image
        if output_format in {"jpeg", "jpg"} and image_for_export.mode == "RGBA":
            image_for_export = image_for_export.convert("RGB")

        image_for_export.save(output_path, format=output_format.upper() if output_format != "jpg" else "JPEG", **save_kwargs)

        mask_path = None
        if options.save_alpha_mask and ctx.alpha_mask is not None:
            mask_path = storage.mask_output_path_for(
                safe_filename,
                base_dir=output_override,
                flat=flat_output,
            )
            ctx.alpha_mask.save(mask_path, format="PNG")

        return {
            "output_path": str(output_path.resolve()),
            "output_filename": output_path.name,
            "mask_path": str(mask_path.resolve()) if mask_path else None,
            "engine_used": engine_used,
            "provider_used": provider_used,
            "used_external": used_external,
            "metadata": json.dumps(options.model_dump()),
        }


processing_engine = ProcessingEngine()
