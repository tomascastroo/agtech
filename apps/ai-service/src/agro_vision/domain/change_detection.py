"""Detección de cambios entre dos tomas de la misma escena."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .models_registry import CHANGE_DETECTOR, ModelDescriptor

WORKING_SIDE_PX = 1024
MIN_REGION_PX = 64


@dataclass(frozen=True)
class ChangeRegion:
    x: int
    y: int
    width: int
    height: int
    area_px: int


@dataclass(frozen=True)
class ChangeResult:
    changed_fraction: float
    regions: list[ChangeRegion]
    model: ModelDescriptor


def detect_changes(before: np.ndarray, after: np.ndarray) -> ChangeResult:
    a = _normalize(before)
    b = _normalize(cv2.resize(after, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_AREA))
    diff = cv2.absdiff(a, b)
    _, mask = cv2.threshold(diff, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if float(diff.max()) < 25:
        mask = np.zeros_like(mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    regions = [
        ChangeRegion(*(int(v) for v in stats[i][:4]), area_px=int(stats[i][4]))
        for i in range(1, n_labels)
        if stats[i][4] >= MIN_REGION_PX
    ]
    regions.sort(key=lambda r: r.area_px, reverse=True)
    changed = float(np.count_nonzero(mask)) / mask.size
    return ChangeResult(round(changed, 4), regions[:20], CHANGE_DETECTOR)


def _normalize(bgr: np.ndarray) -> np.ndarray:
    scale = WORKING_SIDE_PX / max(bgr.shape[:2])
    if scale < 1:
        bgr = cv2.resize(bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    return cv2.GaussianBlur(gray, (5, 5), 0)
