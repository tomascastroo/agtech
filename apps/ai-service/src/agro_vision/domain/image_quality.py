"""Métricas objetivas de calidad de imagen usadas como evidencia de respaldo."""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

# Umbrales empíricos para imágenes de cámaras de campo (resolución ≥ 720p).
MIN_SHARPNESS = 60.0
SHARPNESS_REFERENCE = 250.0
MIN_SIDE_PX = 480
DARK_THRESHOLD = 40.0
BRIGHT_THRESHOLD = 220.0


@dataclass(frozen=True)
class QualityReport:
    width: int
    height: int
    sharpness: float
    brightness: float
    contrast: float
    dhash: str
    quality_score: float
    issues: list[str] = field(default_factory=list)


def assess_quality(bgr: np.ndarray) -> QualityReport:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    contrast = float(gray.std())

    issues: list[str] = []
    if sharpness < MIN_SHARPNESS:
        issues.append("BLURRY")
    if brightness < DARK_THRESHOLD:
        issues.append("UNDEREXPOSED")
    if brightness > BRIGHT_THRESHOLD:
        issues.append("OVEREXPOSED")
    if min(width, height) < MIN_SIDE_PX:
        issues.append("LOW_RESOLUTION")
    if contrast < 12:
        issues.append("LOW_CONTRAST")

    return QualityReport(
        width=width,
        height=height,
        sharpness=round(sharpness, 2),
        brightness=round(brightness, 2),
        contrast=round(contrast, 2),
        dhash=difference_hash(gray),
        quality_score=round(_score(sharpness, brightness, width, height, contrast), 3),
        issues=issues,
    )


def sharpness_factor(sharpness: float) -> float:
    """Factor [0.5, 1] que penaliza la confianza de detección en imágenes poco nítidas."""
    return float(np.clip(sharpness / SHARPNESS_REFERENCE, 0.5, 1.0))


def difference_hash(gray: np.ndarray, hash_size: int = 8) -> str:
    """dHash de 64 bits: permite detectar imágenes reutilizadas entre verificaciones."""
    resized = cv2.resize(gray, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = resized[:, 1:] > resized[:, :-1]
    value = 0
    for bit in diff.flatten():
        value = (value << 1) | int(bit)
    return f"{value:016x}"


def _score(sharpness: float, brightness: float, width: int, height: int, contrast: float) -> float:
    sharp = sharpness_factor(sharpness) if sharpness >= MIN_SHARPNESS else 0.3
    exposure = 1.0 - min(abs(brightness - 128.0) / 128.0, 1.0) * 0.6
    resolution = 1.0 if min(width, height) >= MIN_SIDE_PX else 0.6
    contrast_factor = 1.0 if contrast >= 12 else 0.7
    return float(np.clip(sharp * exposure * resolution * contrast_factor, 0.0, 1.0))
