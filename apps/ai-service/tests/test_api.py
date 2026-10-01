from __future__ import annotations

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


def test_health_is_public(client):
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_requires_internal_token(client, blank_png):
    response = client.post("/v1/images/analyze", files={"file": ("a.png", blank_png, "image/png")})
    assert response.status_code == 401


def test_count_endpoint_returns_count_model_and_request_id(client, scene_jpeg):
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


def test_rejects_invalid_area_range(client, blank_png):
    response = client.post(
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
