"""Recursos de larga vida del proceso: detector ONNX y catálogo Sentinel-2."""

from __future__ import annotations

import threading
from functools import lru_cache

from .config import Settings
from .domain.detection import YoloxOnnxDetector
from .infrastructure.sentinel_catalog import SentinelCatalog

_lock = threading.Lock()
_detector: YoloxOnnxDetector | None = None


class ModelNotAvailableError(RuntimeError):
    """Los pesos del detector no están instalados."""


def get_detector(settings: Settings) -> YoloxOnnxDetector:
    global _detector
    with _lock:
        if _detector is None:
            path = settings.models_dir / f"{settings.detector_model}.onnx"
            if not path.exists():
                raise ModelNotAvailableError(
                    f"Pesos no encontrados en {path}; ejecutar scripts/download_models.py"
                )
            _detector = YoloxOnnxDetector(
                path,
                name=settings.detector_model,
                version="0.1.1rc0-onnx",
                intra_op_threads=settings.detector_threads,
            )
        return _detector


@lru_cache
def get_catalog(mode: str, url: str) -> SentinelCatalog:
    return SentinelCatalog(mode, url)
