"""Reprocesamiento OFICIAL de un escaneo de bovinos.

El celular cuenta en vivo con un modelo liviano (YOLOX-Nano/Tiny en ONNX Runtime Web), pero
ese conteo es preliminar: corre en un dispositivo que no controlamos. El conteo oficial se
recalcula acá, sobre los cuadros muestreados que el celular subió (con hash):

  cuadros → YOLOX (modelo del servidor) → desplazamiento global de la cámara (flujo óptico)
  → según el modo:
      FIXED (paso)    tracker → conteo neto por línea (sin compensación: la cámara está quieta)
      SWEEP (barrido) tracker con compensación de cámara → conteo neto por la línea central
      PEN (corral)    tracker con compensación → animales únicos con unión conservadora de
                      vistas (domain/pen_count.py)
      PHOTO (fotos)   fotos sueltas registradas entre sí (ORB + RANSAC) → animales únicos
  → métricas objetivas de calidad (desenfoque, exposición, movimiento, tamaño, oclusión,
    cobertura). La API decide con ellas si la evidencia es válida.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np

from .detection import Detection
from .pen_count import PenCount, count_pen, frame_occlusion
from .tracking import Box, LineSpec, ScanCount, TrackerParams, count_scan

ScanMode = Literal["FIXED", "SWEEP", "PEN", "PHOTO"]

# Umbral de nitidez (varianza del laplaciano) sobre cuadros reducidos a 640 px de ancho.
BLURRY_SHARPNESS = 60.0
# Desplazamiento de cámara por cuadro (fracción del ancho) a partir del cual se considera rápido.
FAST_PAN_FRACTION = 0.25
# Con la cámara que debería estar quieta (modo fijo), moverse más que esto por cuadro.
STILL_CAMERA_FRACTION = 0.03
# Exposición (brillo medio 0-255), mismos umbrales que domain/image_quality.py.
DARK_BRIGHTNESS = 40.0
BRIGHT_BRIGHTNESS = 220.0
# Registro entre fotos: coincidencias mínimas consistentes (RANSAC) para afirmar solapamiento.
PHOTO_MIN_INLIERS = 25


@dataclass(frozen=True)
class FrameQuality:
    sharpness: float
    brightness: float


@dataclass(frozen=True)
class ScanMetrics:
    """Magnitudes medidas sobre los cuadros (sin juicio): la API decide la calidad."""

    frames: int
    blurry_ratio: float
    underexposed_ratio: float
    overexposed_ratio: float
    fast_motion_ratio: float
    occlusion_ratio: float
    small_animal_ratio: float
    coverage_views: float | None
    edge_animals: int | None
    registered_photos: int | None


@dataclass(frozen=True)
class ScanResult:
    count: ScanCount
    detections: list[list[Detection]]
    shifts: list[tuple[float, float]]
    quality: list[FrameQuality]
    warnings: list[str]
    frame_size: tuple[int, int]
    pen: PenCount | None = None
    metrics: ScanMetrics | None = None

    @property
    def observed(self) -> int:
        """Conteo oficial del modo: neto por línea (FIXED/SWEEP) o animales únicos (PEN/PHOTO)."""
        return self.pen.observed if self.pen is not None else self.count.net_count


def estimate_camera_shift(
    prev_gray: np.ndarray,
    gray: np.ndarray,
    exclude: Sequence[tuple[float, float, float, float]] = (),
) -> tuple[float, float]:
    """Traslación global del contenido entre dos cuadros (flujo óptico disperso + RANSAC),
    como la compensación de movimiento de cámara de BoT-SORT. (0, 0) si no hay textura.

    `exclude`: cajas de animales del cuadro anterior. Sus puntos no se usan: un animal que
    camina no debe confundirse con un movimiento de la cámara (como en BoT-SORT)."""
    mask = None
    if exclude:
        mask = np.full(prev_gray.shape, 255, np.uint8)
        h, w = prev_gray.shape
        for x1, y1, x2, y2 in exclude:
            mask[max(0, int(y1)) : min(h, int(y2) + 1), max(0, int(x1)) : min(w, int(x2) + 1)] = 0
    points = cv2.goodFeaturesToTrack(
        prev_gray, maxCorners=300, qualityLevel=0.01, minDistance=8, mask=mask
    )
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


def estimate_photo_shift(prev_gray: np.ndarray, gray: np.ndarray) -> tuple[float, float] | None:
    """Traslación entre dos FOTOS del mismo grupo (puede ser grande): ORB + RANSAC. None si no
    hay suficientes coincidencias consistentes para afirmar que se solapan."""
    orb = cv2.ORB_create(nfeatures=1500)
    kp1, des1 = orb.detectAndCompute(prev_gray, None)
    kp2, des2 = orb.detectAndCompute(gray, None)
    if des1 is None or des2 is None or len(kp1) < PHOTO_MIN_INLIERS or len(kp2) < PHOTO_MIN_INLIERS:
        return None
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(des1, des2)
    if len(matches) < PHOTO_MIN_INLIERS:
        return None
    src = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    matrix, inliers = cv2.estimateAffinePartial2D(
        src, dst, method=cv2.RANSAC, ransacReprojThreshold=4.0
    )
    if matrix is None or inliers is None or int(inliers.sum()) < PHOTO_MIN_INLIERS:
        return None
    scale = float(np.hypot(matrix[0, 0], matrix[1, 0]))
    if not 0.8 <= scale <= 1.25:
        return None  # cambio de escala grande: otra distancia, no se puede unir con seguridad
    return (float(matrix[0, 2]), float(matrix[1, 2]))


def frame_quality(bgr: np.ndarray) -> FrameQuality:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return FrameQuality(
        sharpness=round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2),
        brightness=round(float(gray.mean()), 2),
    )


def _boxes(detections: list[list[Detection]]) -> list[list[Box]]:
    return [[(d.x1, d.y1, d.x2, d.y2, d.score) for d in f] for f in detections]


def _count_photos(
    grays: list[np.ndarray], boxes: list[list[Box]], frame_size: tuple[int, int]
) -> tuple[PenCount, list[tuple[float, float]], int]:
    """Fotos sueltas: se registran de a pares consecutivos. Una cadena de fotos solapadas se
    trata como un recorrido de cámara (unión de vistas de pen_count); cadenas que no se pueden
    registrar entre sí NO se suman (podrían mostrar los mismos animales): se toma el máximo."""
    chains: list[list[int]] = [[0]]
    shifts: list[tuple[float, float]] = [(0.0, 0.0)]
    for i in range(1, len(grays)):
        shift = estimate_photo_shift(grays[i - 1], grays[i])
        if shift is None:
            chains.append([i])
            shifts.append((0.0, 0.0))
        else:
            chains[-1].append(i)
            shifts.append(shift)
    # Una foto es una "vista" estable: se repite para que el tracker la confirme (min_hits).
    best: PenCount | None = None
    for chain in chains:
        frames: list[list[Box]] = []
        chain_shifts: list[tuple[float, float]] = []
        for n, i in enumerate(chain):
            for rep in range(3):
                frames.append(boxes[i])
                chain_shifts.append(shifts[i] if (n > 0 and rep == 0) else (0.0, 0.0))
        result = count_pen(frames, frame_size, chain_shifts, TrackerParams(max_lost=3))
        if best is None or result.observed > best.observed:
            best = result
    assert best is not None
    registered = sum(len(c) for c in chains if len(c) > 1)
    return best, shifts, registered


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
    grays: list[np.ndarray] = []
    prev_gray: np.ndarray | None = None
    for frame in frames:
        if frame.shape[:2] != (height, width):
            frame = cv2.resize(frame, (width, height))
        detections.append(detect(frame))
        quality.append(frame_quality(frame))
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if mode == "PHOTO":
            grays.append(gray)
        else:
            animals = (
                [(d.x1, d.y1, d.x2, d.y2) for d in detections[-2]] if len(detections) > 1 else []
            )
            shifts.append(
                estimate_camera_shift(prev_gray, gray, animals) if prev_gray is not None else (0, 0)
            )
            prev_gray = gray
    boxes = _boxes(detections)
    # El modo fijo no compensa la cámara (debería estar quieta); el desplazamiento solo se mide.
    count = count_scan(
        boxes, (width, height), params, line, shifts if mode in ("SWEEP", "PEN") else None
    )
    pen: PenCount | None = None
    registered: int | None = None
    if mode == "PEN":
        pen = count_pen(boxes, (width, height), shifts, params)
    elif mode == "PHOTO":
        pen, shifts, registered = _count_photos(grays, boxes, (width, height))

    n = len(frames)
    blurry = sum(1 for q in quality if q.sharpness < BLURRY_SHARPNESS)
    dark = sum(1 for q in quality if q.brightness < DARK_BRIGHTNESS)
    bright = sum(1 for q in quality if q.brightness > BRIGHT_BRIGHTNESS)
    motion_limit = (STILL_CAMERA_FRACTION if mode == "FIXED" else FAST_PAN_FRACTION) * width
    fast = 0 if mode == "PHOTO" else sum(1 for dx, dy in shifts if abs(dx) > motion_limit)
    high = (params or TrackerParams()).high_threshold
    occl = [frame_occlusion(b, high) for b in boxes]
    considered = sum(c for _, c in occl)
    strong = [b for f in boxes for b in f if b[4] >= high]
    small = sum(1 for b in strong if (b[3] - b[1]) < 0.08 * height)
    if mode == "SWEEP" and shifts:
        xs = np.cumsum([dx for dx, _ in shifts])
        coverage: float | None = round((float(xs.max() - xs.min()) + width) / width, 2)
    else:
        coverage = pen.coverage_views if pen is not None else None
    metrics = ScanMetrics(
        frames=n,
        blurry_ratio=round(blurry / n, 3),
        underexposed_ratio=round(dark / n, 3),
        overexposed_ratio=round(bright / n, 3),
        fast_motion_ratio=round(fast / n, 3),
        occlusion_ratio=round(sum(o for o, _ in occl) / considered, 3) if considered else 0.0,
        small_animal_ratio=round(small / len(strong), 3) if strong else 0.0,
        coverage_views=coverage,
        edge_animals=pen.edge_animals if pen is not None else None,
        registered_photos=registered,
    )

    warnings: list[str] = []
    if blurry > 0.3 * n:
        warnings.append(f"{blurry} de {n} cuadros desenfocados (movimiento o foco)")
    if dark > 0.3 * n:
        warnings.append(f"{dark} de {n} cuadros con poca luz")
    if bright > 0.3 * n:
        warnings.append(f"{bright} de {n} cuadros sobreexpuestos (contraluz o sol directo)")
    if mode in ("SWEEP", "PEN") and fast > 0.1 * n:
        warnings.append(f"Cámara movida demasiado rápido en {fast} cuadros: puede perder animales")
    if mode == "FIXED" and fast > 0.1 * n:
        warnings.append(f"La cámara se movió en {fast} cuadros (el escáner fijo requiere quietud)")
    if mode == "SWEEP":
        revisited = min(count.positive_crossings, count.negative_crossings)
        if revisited:
            warnings.append(
                f"Se volvió sobre zonas ya escaneadas ({revisited} cruces descontados en el "
                "conteo neto)"
            )
    if mode in ("FIXED", "SWEEP") and count.confirmed_tracks and count.net_count == 0:
        warnings.append("Se siguieron animales pero ninguno cruzó la línea de conteo")
    if pen is not None:
        if pen.merged_tracks:
            warnings.append(
                f"{pen.merged_tracks} reapariciones del mismo animal unidas "
                "(no se cuentan dos veces)"
            )
        if metrics.occlusion_ratio > 0.35:
            warnings.append(
                f"{round(metrics.occlusion_ratio * 100)} % de las detecciones se superponen con "
                "otras: puede haber animales ocultos no contados"
            )
        if pen.edge_animals:
            warnings.append(
                f"{pen.edge_animals} animales en el borde del área cubierta: el grupo puede "
                "seguir fuera de cuadro"
            )
    if mode == "PHOTO" and n > 1 and (registered or 0) < n:
        warnings.append(
            "Algunas fotos no se pudieron unir con la anterior (no se solapan): no se suman, se "
            "toma el máximo para no contar dos veces"
        )
    if small > 0.5 * max(len(strong), 1) and strong:
        warnings.append("La mayoría de los animales se ven muy chicos: acercate")
    if mode != "PHOTO" and n < 10:
        warnings.append("Escaneo muy corto (menos de 10 cuadros)")
    return ScanResult(
        count=count,
        detections=detections,
        shifts=shifts,
        quality=quality,
        warnings=warnings,
        frame_size=(width, height),
        pen=pen,
        metrics=metrics,
    )
