"""Conteo de animales mediante visión computacional clásica.

El algoritmo separa la pastura (alto índice de exceso de verde) de los objetos que no son
vegetación, limpia el ruido con morfología y cuenta componentes conexos dentro de un rango de
área compatible con un bovino visto desde arriba. Los componentes de área anómala (dos o más
animales en contacto) se estiman dividiendo por el área mediana.

Es un modelo base, explicable y ejecutable en CPU. Está pensado para ser reemplazado por un
detector entrenado (p. ej. Faster R-CNN / RT-DETR) detrás de la misma interfaz.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .image_quality import assess_quality, sharpness_factor
from .models_registry import LIVESTOCK_COUNTER, ModelDescriptor

CLUSTER_FACTOR = 1.9
MAX_ASPECT_RATIO = 5.0


@dataclass(frozen=True)
class Detection:
    x: int
    y: int
    width: int
    height: int
    area_px: int
    estimated_animals: int
    label: str


@dataclass(frozen=True)
class CountResult:
    count: int
    confidence: float
    detections: list[Detection]
    clustered_components: int
    rejected_components: int
    model: ModelDescriptor


@dataclass(frozen=True)
class CounterParams:
    min_area_px: int = int(LIVESTOCK_COUNTER.parameters["min_area_px"])
    max_area_px: int = int(LIVESTOCK_COUNTER.parameters["max_area_px"])
    exg_threshold: int = int(LIVESTOCK_COUNTER.parameters["exg_threshold"])


def non_vegetation_mask(bgr: np.ndarray, exg_threshold: int) -> np.ndarray:
    b, g, r = (bgr[:, :, i].astype(np.int16) for i in range(3))
    excess_green = 2 * g - r - b
    mask = (excess_green < exg_threshold).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask


def count_animals(bgr: np.ndarray, params: CounterParams | None = None) -> CountResult:
    params = params or CounterParams()
    mask = non_vegetation_mask(bgr, params.exg_threshold)
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)

    candidates: list[tuple[int, int, int, int, int]] = []
    rejected = 0
    for label in range(1, n_labels):
        x, y, w, h, area = (int(v) for v in stats[label])
        aspect = max(w, h) / max(1, min(w, h))
        if area < params.min_area_px or aspect > MAX_ASPECT_RATIO:
            rejected += 1
            continue
        if area > params.max_area_px * 4:
            # Superficies grandes sin vegetación (suelo desnudo, aguadas, construcciones).
            rejected += 1
            continue
        candidates.append((x, y, w, h, area))

    if not candidates:
        return CountResult(0, 0.0, [], 0, rejected, LIVESTOCK_COUNTER)

    single_areas = [c[4] for c in candidates if c[4] <= params.max_area_px]
    median_area = float(np.median(single_areas)) if single_areas else float(params.max_area_px)

    detections: list[Detection] = []
    clustered = 0
    for x, y, w, h, area in candidates:
        estimated = 1
        if area > median_area * CLUSTER_FACTOR:
            estimated = max(2, round(area / median_area))
            clustered += 1
        detections.append(
            Detection(x, y, w, h, area, estimated, "bovine" if estimated == 1 else "bovine_group")
        )

    total = sum(d.estimated_animals for d in detections)
    quality = assess_quality(bgr)
    cluster_share = clustered / len(detections)
    confidence = (
        LIVESTOCK_COUNTER.base_confidence
        * sharpness_factor(quality.sharpness)
        * (1.0 - 0.5 * cluster_share)
    )
    return CountResult(
        count=total,
        confidence=round(float(confidence), 3),
        detections=detections,
        clustered_components=clustered,
        rejected_components=rejected,
        model=LIVESTOCK_COUNTER,
    )
