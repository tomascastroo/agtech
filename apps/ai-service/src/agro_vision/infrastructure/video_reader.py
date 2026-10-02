"""Lectura de video y muestreo de cuadros con OpenCV (FFmpeg incluido en opencv-python)."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass

import cv2
import numpy as np


class UnreadableVideoError(ValueError):
    pass


@dataclass(frozen=True)
class SampledVideo:
    frames: list[np.ndarray]
    source_fps: float
    sampled_fps: float
    duration_s: float
    width: int
    height: int
    truncated: bool


def sample_frames(
    data: bytes, *, target_fps: float, max_frames: int, max_side_px: int
) -> SampledVideo:
    """Decodifica el video y toma cuadros a `target_fps` (como máximo `max_frames`)."""
    fd, path = tempfile.mkstemp(suffix=".video")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        capture = cv2.VideoCapture(path)
        if not capture.isOpened():
            raise UnreadableVideoError("No se pudo abrir el video (formato o códec no soportado)")
        fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
        if not 0 < fps <= 240:
            fps = 30.0
        step = max(1, round(fps / target_fps))
        frames: list[np.ndarray] = []
        index = 0
        truncated = False
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if index % step == 0:
                if len(frames) >= max_frames:
                    truncated = True
                    break
                frames.append(_resize(frame, max_side_px))
            index += 1
        capture.release()
    finally:
        os.unlink(path)
    if not frames:
        raise UnreadableVideoError("El video no contiene cuadros legibles")
    height, width = frames[0].shape[:2]
    return SampledVideo(
        frames=frames,
        source_fps=round(fps, 3),
        sampled_fps=round(fps / step, 3),
        duration_s=round(index / fps, 2),
        width=width,
        height=height,
        truncated=truncated,
    )


def _resize(frame: np.ndarray, max_side: int) -> np.ndarray:
    h, w = frame.shape[:2]
    scale = max_side / max(h, w)
    if scale >= 1:
        return frame
    return cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
