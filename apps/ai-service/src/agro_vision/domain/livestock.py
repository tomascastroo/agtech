"""Clases COCO que se cuentan como bovinos.

`cow` es la clase nativa de COCO. `livestock` agrega oveja y caballo, con los que el detector
confunde terneros o animales parcialmente visibles; el benchmark decide cuál se usa.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .detection import COCO_CLASSES, Detection, TilingParams, YoloxOnnxDetector

LIVESTOCK_CLASS_SETS: dict[str, frozenset[int]] = {
    "cow": frozenset({COCO_CLASSES.index("cow")}),
    "livestock": frozenset({COCO_CLASSES.index(c) for c in ("cow", "sheep", "horse")}),
}


@dataclass(frozen=True)
class LivestockCount:
    count: int
    confidence: float
    detections: list[Detection]
    inference_passes: int
    score_threshold: float


def count_livestock(
    detector: YoloxOnnxDetector,
    image_bgr: np.ndarray,
    *,
    score_threshold: float,
    tiled_score_threshold: float,
    class_set: str,
    tiling: TilingParams,
) -> LivestockCount:
    """Pipeline de conteo: detección (con mosaico) → filtro por clase y confianza → agregación.

    Se usan umbrales distintos para fotos completas y para escenas grandes procesadas por
    mosaico, calibrados por separado. La confianza del conteo es el score medio de las
    detecciones contadas; sin detecciones se informa 0 (falta de evidencia, no certeza de
    ausencia).
    """
    tiled = tiling.applies_to(image_bgr.shape[:2])
    threshold = tiled_score_threshold if tiled else score_threshold
    detections, passes = detector.detect(
        image_bgr,
        score_threshold=threshold,
        class_ids=LIVESTOCK_CLASS_SETS[class_set],
        tiling=tiling,
    )
    confidence = float(np.mean([d.score for d in detections])) if detections else 0.0
    return LivestockCount(
        count=len(detections),
        confidence=round(confidence, 4),
        detections=detections,
        inference_passes=passes,
        score_threshold=threshold,
    )
