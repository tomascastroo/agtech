"""Reprocesamiento OFICIAL de un escaneo de bovinos.

El celular cuenta en vivo con un modelo liviano (YOLOX-Nano/Tiny en ONNX Runtime Web), pero
ese conteo es preliminar: corre en un dispositivo que no controlamos. El conteo oficial se
recalcula acá, sobre los cuadros muestreados que el celular subió (con hash):

  cuadros → YOLOX (modelo del servidor) → [modo MÓVIL: desplazamiento global de la cámara
  por flujo óptico] → tracker estilo ByteTrack → conteo neto por línea → calidad del escaneo.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np

from .detection import Detection
from .tracking import Box, LineSpec, ScanCount, TrackerParams, count_scan

ScanMode = Literal["FIXED", "SWEEP"]

# Umbral de nitidez (varianza del laplaciano) sobre cuadros reducidos a 640 px de ancho.
BLURRY_SHARPNESS = 60.0
# Desplazamiento de cámara por cuadro (fracción del ancho) a partir del cual se considera rápido.
FAST_PAN_FRACTION = 0.25


@dataclass(frozen=True)
class FrameQuality:
    sharpness: float
    brightness: float


@dataclass(frozen=True)
class ScanResult:
    count: ScanCount
    detections: list[list[Detection]]
    shifts: list[tuple[float, float]]
    quality: list[FrameQuality]
    warnings: list[str]
    frame_size: tuple[int, int]


def estimate_camera_shift(prev_gray: np.ndarray, gray: np.ndarray) -> tuple[float, float]:
    """Traslación global del contenido entre dos cuadros (flujo óptico disperso + RANSAC),
    como la compensación de movimiento de cámara de BoT-SORT. (0, 0) si no hay textura."""
    points = cv2.goodFeaturesToTrack(prev_gray, maxCorners=300, qualityLevel=0.01, minDistance=8)
    if points is None or len(points) < 8:
        return (0.0, 0.0)
    moved, status, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, points, None)
    ok = status.reshape(-1) == 1
    if ok.sum() < 8:
        return (0.0, 0.0)
    matrix, _ = cv2.estimateAffinePartial2D(points[ok], moved[ok], method=cv2.RANSAC)
    if matrix is None:
        return (0.0, 0.0)
    return (float(matrix[0, 2]), float(matrix[1, 2]))


def frame_quality(bgr: np.ndarray) -> FrameQuality:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return FrameQuality(
        sharpness=round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2),
        brightness=round(float(gray.mean()), 2),
    )


def process_scan(
    frames: Sequence[np.ndarray],
    detect: Callable[[np.ndarray], list[Detection]],
    mode: ScanMode,
    line: LineSpec,
    params: TrackerParams | None = None,
) -> ScanResult:
    if not frames:
        raise ValueError("El escaneo no tiene cuadros")
    height, width = frames[0].shape[:2]
    detections: list[list[Detection]] = []
    shifts: list[tuple[float, float]] = []
    quality: list[FrameQuality] = []
    prev_gray: np.ndarray | None = None
    for frame in frames:
        if frame.shape[:2] != (height, width):
            frame = cv2.resize(frame, (width, height))
        detections.append(detect(frame))
        quality.append(frame_quality(frame))
        if mode == "SWEEP":
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            shifts.append(
                estimate_camera_shift(prev_gray, gray) if prev_gray is not None else (0, 0)
            )
            prev_gray = gray
    boxes: list[list[Box]] = [[(d.x1, d.y1, d.x2, d.y2, d.score) for d in f] for f in detections]
    count = count_scan(boxes, (width, height), params, line, shifts if mode == "SWEEP" else None)

    warnings: list[str] = []
    blurry = sum(1 for q in quality if q.sharpness < BLURRY_SHARPNESS)
    if blurry > 0.3 * len(frames):
        warnings.append(f"{blurry} de {len(frames)} cuadros desenfocados (movimiento o foco)")
    if mode == "SWEEP":
        fast = sum(1 for dx, _ in shifts if abs(dx) > FAST_PAN_FRACTION * width)
        if fast > 0.1 * len(frames):
            warnings.append(f"Barrido demasiado rápido en {fast} cuadros: puede perder animales")
        revisited = min(count.positive_crossings, count.negative_crossings)
        if revisited:
            warnings.append(
                f"Se volvió sobre zonas ya escaneadas ({revisited} cruces descontados en el "
                "conteo neto)"
            )
    if count.confirmed_tracks and count.net_count == 0:
        warnings.append("Se siguieron animales pero ninguno cruzó la línea de conteo")
    if len(frames) < 10:
        warnings.append("Escaneo muy corto (menos de 10 cuadros)")
    return ScanResult(
        count=count,
        detections=detections,
        shifts=shifts,
        quality=quality,
        warnings=warnings,
        frame_size=(width, height),
    )
