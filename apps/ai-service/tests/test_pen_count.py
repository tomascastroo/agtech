"""Conteo de animales quietos (escáner de corral): unión conservadora de vistas."""

from __future__ import annotations

import cv2
import numpy as np

from agro_vision.domain.detection import Detection
from agro_vision.domain.pen_count import count_pen
from agro_vision.domain.scan_processing import estimate_photo_shift, process_scan
from agro_vision.domain.tracking import LineSpec

SIZE = (640, 360)


def herd(world: list[tuple[float, float]], camera_x: float, w: float = 60, h: float = 40):
    """Detecciones en el cuadro de animales quietos en `world`, con la cámara en `camera_x`."""
    boxes = []
    for x, y in world:
        sx = x - camera_x
        if sx >= 0 and sx + w <= SIZE[0]:
            boxes.append((sx, y, sx + w, y + h, 0.9))
    return boxes


def pan(world, positions):
    frames, shifts, prev = [], [], positions[0]
    for pos in positions:
        frames.append(herd(world, pos))
        shifts.append((prev - pos, 0.0))  # el contenido se corre al revés que la cámara
        prev = pos
    return frames, shifts


WORLD = [(50 + 140 * i, 100 + (i % 3) * 60) for i in range(10)]  # 10 animales en 1400 px


def test_still_group_in_one_view_counts_each_animal_once():
    world = WORLD[:4]
    frames = [herd(world, 0)] * 12
    result = count_pen(frames, SIZE, [(0.0, 0.0)] * 12)
    assert result.observed == 4
    assert result.merged_tracks == 0
    assert result.coverage_views == 1.0


def test_pan_across_wider_group_counts_all_once():
    positions = [float(p) for p in range(0, 800, 16)]
    frames, shifts = pan(WORLD, positions)
    result = count_pen(frames, SIZE, shifts)
    assert result.observed == 10
    assert 2.1 < result.coverage_views < 2.4


def test_going_back_over_seen_area_does_not_double_count():
    forward = [float(p) for p in range(0, 800, 16)]
    back = [float(p) for p in range(800, 200, -16)]
    again = [float(p) for p in range(200, 800, 16)]
    frames, shifts = pan(WORLD, forward + back + again)
    result = count_pen(frames, SIZE, shifts)
    assert result.observed == 10
    assert result.revisit_ratio > 1.0


def test_tracks_lost_by_occlusion_and_reappearing_are_merged():
    world = WORLD[:3]
    frames = [herd(world, 0) for _ in range(30)]
    # El animal 0 queda tapado 15 cuadros (más que max_lost) y reaparece en el mismo lugar.
    for i in range(8, 23):
        frames[i] = [b for b in frames[i] if b[0] > 100]
    result = count_pen(frames, SIZE, [(0.0, 0.0)] * 30)
    assert result.tracks_counted == 4
    assert result.merged_tracks == 1
    assert result.observed == 3


def test_animals_seen_together_are_never_merged():
    # Dos animales pegados (se solapan) a la vez: distintos aunque estén en el mismo lugar.
    frames = [[(100, 100, 160, 140, 0.9), (120, 100, 180, 140, 0.85)] for _ in range(10)]
    result = count_pen(frames, SIZE, [(0.0, 0.0)] * 10)
    assert result.observed == 2
    assert result.occlusion_ratio == 1.0


def test_single_frame_flicker_is_not_counted():
    frames = [herd(WORLD[:2], 0) for _ in range(10)]
    frames[4] = frames[4] + [(400, 50, 460, 90, 0.95)]  # una detección espuria aislada
    assert count_pen(frames, SIZE, [(0.0, 0.0)] * 10).observed == 2


def test_edge_animals_flag_group_continuing_outside():
    frames = [[(0, 100, 60, 140, 0.9), (300, 100, 360, 140, 0.9)] for _ in range(6)]
    assert count_pen(frames, SIZE, [(0.0, 0.0)] * 6).edge_animals == 1


def _textured(seed: int, width: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.integers(0, 255, (360, width), dtype=np.uint8)
    gray = cv2.GaussianBlur(noise, (5, 5), 0)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def test_photo_shift_registers_overlapping_photos_and_rejects_unrelated():
    pano = _textured(3, 1200)
    a, b = pano[:, 0:640], pano[:, 300:940]
    gray = lambda im: cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)  # noqa: E731
    shift = estimate_photo_shift(gray(a), gray(b))
    assert shift is not None and abs(shift[0] + 300) < 3
    assert estimate_photo_shift(gray(a), gray(_textured(99, 640))) is None


def test_photos_of_overlapping_views_union_and_unrelated_take_max():
    pano = _textured(5, 1200)
    world = [(40, 100), (200, 200), (420, 80), (560, 220), (760, 120), (900, 200)]

    def detector_for(offset: int):
        def detect(_image):
            return [
                Detection(x - offset, y, x - offset + 60, y + 40, 0.9, 19)
                for x, y in world
                if x - offset >= 0 and x - offset + 60 <= 640
            ]

        return detect

    photos = [pano[:, 0:640], pano[:, 400:1040]]
    detections = iter([detector_for(0), detector_for(400)])
    result = process_scan(photos, lambda im: next(detections)(im), "PHOTO", LineSpec())
    # Foto 1: 4 animales; foto 2: 4 animales; 2 compartidos → 6 únicos.
    assert result.pen is not None and result.observed == 6
    assert result.metrics is not None and result.metrics.registered_photos == 2

    unrelated = [pano[:, 0:640], _textured(77, 640)]
    detections = iter([detector_for(0), detector_for(400)])
    result = process_scan(unrelated, lambda im: next(detections)(im), "PHOTO", LineSpec())
    # No se pueden unir: no se suman (4 y 4 → máximo 4).
    assert result.observed == 4
    assert any("no se pudieron unir" in w for w in result.warnings)
