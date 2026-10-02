"""Reprocesamiento oficial del escáner: compensación de cámara y endpoint con video sintético."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from agro_vision.config import get_settings
from agro_vision.domain.scan_processing import estimate_camera_shift
from agro_vision.infrastructure.video_reader import sample_frames
from agro_vision.main import create_app

ROOT_DIR = Path(__file__).resolve().parents[3]
VIDEO = ROOT_DIR / "infra" / "seed-assets" / "videos" / "paso-manga-sintetico.mp4"
WEIGHTS = Path(__file__).resolve().parents[1] / "models" / "yolox_s.onnx"
HEADERS = {"x-internal-token": "test-token"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")
    get_settings.cache_clear()
    yield TestClient(create_app())
    get_settings.cache_clear()


def test_camera_shift_recovers_known_pan():
    rng = np.random.default_rng(1)
    panorama = cv2.GaussianBlur(rng.integers(0, 255, (400, 1400), dtype=np.uint8), (5, 5), 0)
    before = panorama[:, 100:740]
    after = panorama[:, 136:776]  # la cámara giró a la derecha: el contenido se corre 36 px
    dx, dy = estimate_camera_shift(before, after)
    assert abs(dx - (-36)) < 1.5
    assert abs(dy) < 1.5


def test_scan_requires_frames(client):
    response = client.post("/v1/scans/process", data={"mode": "FIXED"}, headers=HEADERS)
    assert response.status_code == 422


@pytest.mark.skipif(not (WEIGHTS.exists() and VIDEO.exists()), reason="sin pesos YOLOX o video")
def test_fixed_scan_counts_synthetic_passage(client):
    """Video SINTÉTICO de manga con 14 animales (verdad de campo), muestreado a 6 cuadros/s."""
    video = sample_frames(VIDEO.read_bytes(), target_fps=6, max_frames=1000, max_side_px=640)
    files = [
        ("frames", (f"{i:05d}.jpg", cv2.imencode(".jpg", f)[1].tobytes(), "image/jpeg"))
        for i, f in enumerate(video.frames)
    ]
    files.append(
        ("key_frames", ("k.jpg", cv2.imencode(".jpg", video.frames[40])[1].tobytes(), "image/jpeg"))
    )
    response = client.post(
        "/v1/scans/process", files=files, data={"mode": "FIXED"}, headers=HEADERS
    )
    assert response.status_code == 200
    body = response.json()
    # Resultado medido al implementar: 12 de 14 (dos animales sin detecciones suficientes).
    assert 11 <= body["net_count"] <= 14
    assert body["negative_crossings"] == 0
    assert body["frames_processed"] == len(video.frames)
    assert len(body["frames"]) == len(video.frames)
    assert len(body["key_frames"]) == 1
    assert body["model"]["code"].endswith("+scan")
    assert body["tracker"].startswith("agro-bytetrack/")
    assert any("línea" in limitation for limitation in body["limitations"])


SWEEPS = ROOT_DIR / "infra" / "seed-assets" / "videos"


@pytest.mark.skipif(
    not (WEIGHTS.exists() and (SWEEPS / "barrido-ida-vuelta-sintetico.mp4").exists()),
    reason="sin pesos YOLOX o videos de barrido",
)
@pytest.mark.parametrize(
    ("name", "revisit"),
    [("barrido-sintetico", False), ("barrido-ida-vuelta-sintetico", True)],
)
def test_sweep_scan_net_count_with_camera_motion(client, name: str, revisit: bool):
    """Barrido SINTÉTICO desde un punto (12 bovinos quietos): compensación de movimiento de
    cámara por flujo óptico y conteo NETO (la vuelta atrás se descuenta)."""
    video = sample_frames(
        (SWEEPS / f"{name}.mp4").read_bytes(), target_fps=6, max_frames=1000, max_side_px=640
    )
    # Misma codificación que el celular (JPEG calidad 0,75).
    files = [
        (
            "frames",
            (
                f"{i:05d}.jpg",
                cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 75])[1].tobytes(),
                "image/jpeg",
            ),
        )
        for i, f in enumerate(video.frames)
    ]
    response = client.post(
        "/v1/scans/process", files=files, data={"mode": "SWEEP"}, headers=HEADERS
    )
    assert response.status_code == 200
    body = response.json()
    # Medido al implementar con JPEG 75: 12 de 12 en ambos videos. Con JPEG 95 el de ida y
    # vuelta dio 13 (un cruce de más por pérdida de identidad): variabilidad real del método.
    assert 11 <= body["net_count"] <= 13
    # Paneo real: (3600 - 960) px a escala 640/960 ≈ 1760 px hacia la izquierda.
    assert abs(body["camera_pan_px"] + 1760) < 60
    assert (body["positive_crossings"] > 0) == revisit
    assert any("COTA INFERIOR" in limitation for limitation in body["limitations"])


@pytest.mark.skipif(
    not (WEIGHTS.exists() and (SWEEPS / "barrido-ida-vuelta-sintetico.mp4").exists()),
    reason="sin pesos YOLOX o videos de barrido",
)
@pytest.mark.parametrize("name", ["barrido-sintetico", "barrido-ida-vuelta-sintetico"])
def test_pen_scan_counts_still_animals_once(client, name: str):
    """Escáner de CORRAL sobre los mismos videos SINTÉTICOS (12 bovinos quietos): la cámara
    recorre el grupo y, en el de ida y vuelta, vuelve sobre una zona ya vista. Los animales
    re-vistos no se cuentan dos veces (unión de vistas en coordenadas del mundo)."""
    video = sample_frames(
        (SWEEPS / f"{name}.mp4").read_bytes(), target_fps=6, max_frames=1000, max_side_px=640
    )
    files = [
        (
            "frames",
            (
                f"{i:05d}.jpg",
                cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 75])[1].tobytes(),
                "image/jpeg",
            ),
        )
        for i, f in enumerate(video.frames)
    ]
    response = client.post("/v1/scans/process", files=files, data={"mode": "PEN"}, headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["method"].startswith("agro-pen-unique/")
    assert body["observed"] == body["pen"]["observed"]
    # Verdad de campo 12; tolerancia para pérdidas del detector (no es una métrica de precisión).
    assert 10 <= body["observed"] <= 13
    # Recorrido ≈ (3600 - 960) / 960 + 1 ≈ 3,75 vistas de ancho.
    assert 3.2 <= body["pen"]["coverage_views"] <= 4.2
    assert body["metrics"]["coverage_views"] == body["pen"]["coverage_views"]
    if name == "barrido-ida-vuelta-sintetico":
        assert body["pen"]["revisit_ratio"] > 0.3
    assert any("COTA INFERIOR" in limitation for limitation in body["limitations"])
