from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
GENERATOR_PATH = ROOT / "scripts" / "generate_synthetic_scenes.py"


@pytest.fixture(scope="session")
def generator():
    spec = importlib.util.spec_from_file_location("generator", GENERATOR_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["generator"] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def scene_jpeg(generator) -> tuple[bytes, int]:
    scene = generator.CAMERA_SCENES[0]
    image = generator.render_camera_scene(scene)
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, generator.JPEG_QUALITY])
    assert ok
    return encoded.tobytes(), scene.animals


@pytest.fixture
def blank_png() -> bytes:
    image = np.full((600, 800, 3), (52, 128, 84), dtype=np.uint8)
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return encoded.tobytes()
