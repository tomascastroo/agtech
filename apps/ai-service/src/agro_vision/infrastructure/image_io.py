"""Decodificación segura de imágenes y extracción de metadatos EXIF."""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime

import cv2
import numpy as np
from PIL import ExifTags, Image, UnidentifiedImageError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "TIFF"}


class InvalidImageError(ValueError):
    """La imagen no puede decodificarse o excede los límites permitidos."""


@dataclass(frozen=True)
class ExifData:
    captured_at: datetime | None
    latitude: float | None
    longitude: float | None
    camera_model: str | None


@dataclass(frozen=True)
class DecodedImage:
    bgr: np.ndarray
    format: str
    exif: ExifData

    @property
    def width(self) -> int:
        return int(self.bgr.shape[1])

    @property
    def height(self) -> int:
        return int(self.bgr.shape[0])


def decode_image(data: bytes, *, max_bytes: int, max_side_px: int) -> DecodedImage:
    if not data:
        raise InvalidImageError("Archivo vacío")
    if len(data) > max_bytes:
        raise InvalidImageError("La imagen supera el tamaño máximo permitido")

    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = (probe.format or "").upper()
            width, height = probe.size
            exif = _read_exif(probe)
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("Formato de imagen no reconocido") from exc

    if fmt not in ALLOWED_FORMATS:
        raise InvalidImageError(f"Formato no soportado: {fmt or 'desconocido'}")
    if width > max_side_px or height > max_side_px:
        raise InvalidImageError("La resolución de la imagen excede el máximo permitido")

    buffer = np.frombuffer(data, dtype=np.uint8)
    bgr = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if bgr is None:
        raise InvalidImageError("No fue posible decodificar la imagen")
    return DecodedImage(bgr=bgr, format=fmt, exif=exif)


def _read_exif(image: Image.Image) -> ExifData:
    try:
        exif = image.getexif()
    except Exception:  # noqa: BLE001 - EXIF corrupto no invalida la imagen
        return ExifData(None, None, None, None)

    captured_at = None
    camera_model = exif.get(ExifTags.Base.Model)
    exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
    raw_date = exif_ifd.get(ExifTags.Base.DateTimeOriginal) or exif.get(ExifTags.Base.DateTime)
    if isinstance(raw_date, str):
        try:
            captured_at = datetime.strptime(raw_date.strip(), "%Y:%m:%d %H:%M:%S")
        except ValueError:
            captured_at = None

    latitude = longitude = None
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    if gps:
        latitude = _gps_to_decimal(gps.get(2), gps.get(1))
        longitude = _gps_to_decimal(gps.get(4), gps.get(3))

    return ExifData(
        captured_at=captured_at,
        latitude=latitude,
        longitude=longitude,
        camera_model=str(camera_model) if camera_model else None,
    )


def _gps_to_decimal(values: object, ref: object) -> float | None:
    if not isinstance(values, tuple) or len(values) != 3:
        return None
    try:
        degrees, minutes, seconds = (float(v) for v in values)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    decimal = degrees + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        decimal = -decimal
    return round(decimal, 7)
