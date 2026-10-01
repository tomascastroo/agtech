from __future__ import annotations

import cv2
import numpy as np

from agro_vision.domain.change_detection import detect_changes
from agro_vision.domain.image_quality import assess_quality


def test_sharp_scene_has_no_quality_issues(generator):
    image = generator.render_camera_scene(generator.CAMERA_SCENES[1])
    report = assess_quality(image)
    assert report.issues == []
    assert report.quality_score > 0.8
    assert len(report.dhash) == 16


def test_blurred_dark_image_is_flagged(generator):
    image = generator.render_camera_scene(generator.CAMERA_SCENES[1])
    degraded = (cv2.GaussianBlur(image, (31, 31), 0) * 0.15).astype(np.uint8)
    report = assess_quality(degraded)
    assert "BLURRY" in report.issues
    assert "UNDEREXPOSED" in report.issues


def test_dhash_is_stable_for_recompressed_image(generator):
    image = generator.render_camera_scene(generator.CAMERA_SCENES[2])
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 60])
    assert ok
    recompressed = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    assert assess_quality(image).dhash == assess_quality(recompressed).dhash


def test_change_detection_identifies_new_structure(generator):
    before = generator.render_camera_scene(generator.CAMERA_SCENES[3])
    after = before.copy()
    cv2.rectangle(after, (500, 300), (760, 520), (200, 200, 200), -1)
    result = detect_changes(before, after)
    assert result.changed_fraction > 0.03
    assert result.regions


def test_identical_images_have_no_changes(generator):
    image = generator.render_camera_scene(generator.CAMERA_SCENES[3])
    assert detect_changes(image, image.copy()).changed_fraction == 0.0
