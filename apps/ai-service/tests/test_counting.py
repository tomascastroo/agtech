from __future__ import annotations

import cv2
import numpy as np

from agro_vision.domain.counting import count_animals
from agro_vision.domain.models_registry import LIVESTOCK_COUNTER


def test_counts_every_generated_scene_exactly(generator):
    for scene in generator.CAMERA_SCENES:
        image = generator.render_camera_scene(scene)
        ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
        assert ok
        decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        result = count_animals(decoded)
        assert result.count == scene.animals, scene.serial


def test_demo_herd_total_is_1482(generator):
    herd = [s for s in generator.CAMERA_SCENES if s.serial.startswith("CAM-LE-")]
    assert sum(scene.animals for scene in herd) == 1482


def test_empty_pasture_returns_zero_with_zero_confidence():
    pasture = np.full((600, 800, 3), (52, 128, 84), dtype=np.uint8)
    result = count_animals(pasture)
    assert result.count == 0
    assert result.confidence == 0.0


def test_touching_animals_are_estimated_as_group():
    image = np.full((400, 400, 3), (52, 128, 84), dtype=np.uint8)
    for i in range(10):
        cv2.ellipse(image, (40 + i * 30, 50), (9, 5), 0, 0, 360, (30, 30, 30), -1)
    # Tres animales superpuestos forman un único componente.
    for dx in (0, 14, 28):
        cv2.ellipse(image, (150 + dx, 250), (10, 5), 0, 0, 360, (30, 30, 30), -1)
    result = count_animals(image)
    assert result.clustered_components == 1
    assert 12 <= result.count <= 14
    assert result.confidence < LIVESTOCK_COUNTER.base_confidence


def test_large_bare_soil_is_not_counted():
    image = np.full((600, 800, 3), (52, 128, 84), dtype=np.uint8)
    cv2.ellipse(image, (400, 300), (120, 80), 0, 0, 360, (88, 112, 140), -1)
    assert count_animals(image).count == 0
