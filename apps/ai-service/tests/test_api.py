from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agro_vision.config import get_settings
from agro_vision.main import create_app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")
    get_settings.cache_clear()
    yield TestClient(create_app())
    get_settings.cache_clear()


HEADERS = {"x-internal-token": "test-token"}
ROOT_DIR = Path(__file__).resolve().parents[3]


def test_health_is_public(client):
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_requires_internal_token(client, blank_png):
    response = client.post("/v1/images/analyze", files={"file": ("a.png", blank_png, "image/png")})
    assert response.status_code == 401


@pytest.fixture
def classical_client(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")
    monkeypatch.setenv("AI_SERVICE_DETECTOR", "classical")
    get_settings.cache_clear()
    yield TestClient(create_app())
    get_settings.cache_clear()


def test_count_endpoint_returns_count_model_and_request_id(classical_client, scene_jpeg):
    client = classical_client
    data, expected = scene_jpeg
    response = client.post(
        "/v1/animals/count",
        files={"file": ("scene.jpg", data, "image/jpeg")},
        headers={**HEADERS, "x-request-id": "req-123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == expected
    assert body["model"]["code"] == "classical-livestock-counter"
    assert body["model"]["simulated"] is False
    assert body["image"]["width"] == 1280
    assert response.headers["x-request-id"] == "req-123"


def test_rejects_non_image_payload(client):
    response = client.post(
        "/v1/images/analyze",
        files={"file": ("doc.pdf", b"%PDF-1.7 not an image", "application/pdf")},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_rejects_invalid_area_range(classical_client, blank_png):
    response = classical_client.post(
        "/v1/animals/count?min_area_px=500&max_area_px=100",
        files={"file": ("a.png", blank_png, "image/png")},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_models_listing(client):
    response = client.get("/v1/models", headers=HEADERS)
    assert response.status_code == 200
    codes = {m["code"] for m in response.json()}
    assert {"classical-livestock-counter", "image-quality-metrics"} <= codes


COMPOSITE = ROOT_DIR / "infra" / "seed-assets" / "cameras" / "CAM-ET-01.jpg"
WEIGHTS = Path(__file__).resolve().parents[1] / "models" / "yolox_s.onnx"


@pytest.mark.skipif(not (WEIGHTS.exists() and COMPOSITE.exists()), reason="sin pesos YOLOX")
def test_yolox_counts_real_composite(client):
    """Conteo con el detector real sobre una escena con verdad de campo conocida (205)."""
    response = client.post(
        "/v1/animals/count",
        files={"file": ("cam.jpg", COMPOSITE.read_bytes(), "image/jpeg")},
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model"]["code"] == "yolox-s-coco"
    assert body["model"]["simulated"] is False
    assert abs(body["count"] - 205) <= 10
    assert body["inference_passes"] > 1  # escena grande: mosaico
    assert all(0 < d["score"] <= 1 for d in body["detections"])
