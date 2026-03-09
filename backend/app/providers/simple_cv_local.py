import io

import numpy as np
from PIL import Image
from scipy import ndimage

from app.providers.base import BackgroundRemovalProvider, ProviderResult


class SimpleCvLocalProvider(BackgroundRemovalProvider):
    name = "simple_cv_local"
    is_local = True

    def health(self) -> tuple[bool, str | None]:
        try:
            _ = ndimage.binary_fill_holes
            return True, None
        except Exception as exc:  # pragma: no cover
            return False, str(exc)

    def _connected_background(self, probable_background: np.ndarray) -> np.ndarray:
        labels, labels_count = ndimage.label(probable_background)
        if labels_count <= 1:
            return probable_background
        edge_labels = np.unique(
            np.concatenate(
                [
                    labels[0, :],
                    labels[-1, :],
                    labels[:, 0],
                    labels[:, -1],
                ]
            )
        )
        return np.isin(labels, edge_labels)

    def remove_background(self, image_bytes: bytes, *, model: str | None = None, api_key: str | None = None) -> ProviderResult:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        rgba = np.array(image)
        rgb = rgba[:, :, :3].astype(np.float32)
        alpha = rgba[:, :, 3]

        if np.count_nonzero(alpha < 250) > 0:
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            return ProviderResult(
                content=buffer.getvalue(),
                engine_used="simple_local:existing_alpha",
                provider_used=self.name,
                confidence=0.95,
            )

        border_pixels = np.concatenate(
            [
                rgb[0, :, :],
                rgb[-1, :, :],
                rgb[:, 0, :],
                rgb[:, -1, :],
            ],
            axis=0,
        )
        background_color = np.median(border_pixels, axis=0)
        border_distance = np.linalg.norm(border_pixels - background_color, axis=1)
        border_variation = float(np.percentile(border_distance, 90))
        background_brightness = float(np.mean(background_color))

        distance_map = np.linalg.norm(rgb - background_color, axis=2)
        threshold = float(np.clip(border_variation + 18.0, 16.0, 60.0))
        probable_background = distance_map <= threshold
        connected_background = self._connected_background(probable_background)

        foreground_mask = ~connected_background
        foreground_mask = ndimage.binary_opening(foreground_mask, structure=np.ones((3, 3)))
        foreground_mask = ndimage.binary_closing(foreground_mask, structure=np.ones((5, 5)))
        foreground_mask = ndimage.binary_fill_holes(foreground_mask)

        foreground_uint8 = (foreground_mask.astype(np.uint8) * 255)
        alpha_out = np.minimum(alpha, foreground_uint8)
        output = rgba.copy()
        output[:, :, 3] = alpha_out

        output_image = Image.fromarray(output, mode="RGBA")
        buffer = io.BytesIO()
        output_image.save(buffer, format="PNG")

        fill_ratio = float(np.count_nonzero(foreground_uint8 > 10)) / float(foreground_uint8.size)
        confidence = 0.97 if border_variation < 10 and background_brightness > 200 and 0.05 < fill_ratio < 0.82 else 0.18

        return ProviderResult(
            content=buffer.getvalue(),
            engine_used="simple_local:solid_bg",
            provider_used=self.name,
            confidence=confidence,
        )
