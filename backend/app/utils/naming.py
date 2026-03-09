import re
from datetime import datetime

import pytesseract
from PIL import Image, ImageOps

from app.schemas.jobs import ProcessingOptions


def sanitize_filename(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^\w\-\.]+", "_", value.strip(), flags=re.ASCII)
    cleaned = re.sub(r"_+", "_", cleaned).strip("._")
    return cleaned or fallback


def extract_ocr_text(image: Image.Image, language: str, max_length: int) -> str:
    grayscale = ImageOps.grayscale(image)
    boosted = ImageOps.autocontrast(grayscale)
    text = pytesseract.image_to_string(boosted, lang=language, config="--psm 6")
    normalized = re.sub(r"\s+", " ", text).strip()
    return sanitize_filename(normalized[:max_length], "")


def resolve_output_name(
    *,
    options: ProcessingOptions,
    original_name: str,
    engine_used: str,
    source_image: Image.Image,
    sequence_number: int,
    output_format: str,
) -> str:
    base_name = original_name

    if options.naming_mode == "ocr_text":
        try:
            ocr_name = extract_ocr_text(source_image, options.ocr_language, options.ocr_max_length)
        except Exception:
            ocr_name = ""
        if ocr_name:
            base_name = ocr_name

    if options.naming_mode == "pattern":
        if options.naming_regex_find:
            try:
                base_name = re.sub(options.naming_regex_find, options.naming_regex_replace, base_name)
            except re.error:
                base_name = base_name
        rendered = options.filename_pattern.format(
            original_name=original_name,
            name=base_name,
            preset=options.preset,
            engine=engine_used.replace(":", "_"),
            model=options.local_model,
            ext=output_format,
            date=datetime.now().strftime("%Y%m%d"),
            index=f"{sequence_number:03d}",
            sequence=f"{sequence_number:03d}",
            width=source_image.width,
            height=source_image.height,
        )
        return sanitize_filename(rendered, original_name)

    if options.naming_mode == "keep_original":
        return sanitize_filename(original_name, original_name)

    return sanitize_filename(base_name, original_name)
