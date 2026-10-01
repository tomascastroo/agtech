from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from agro_vision.config import get_settings
from agro_vision.domain.documents import classify, cuit_is_valid, extract_fields
from agro_vision.main import create_app

TEXT = """SENASA - Servicio Nacional de Sanidad y Calidad Agroalimentaria
CONSTANCIA DE INSCRIPCION EN EL RENSPA
RENSPA: 06.687.0.01542/00
Titular: AGROPECUARIA LA ESPERANZA S.A.  CUIT: 30-71548963-1
Fecha de emisión: 10/02/2026   Vencimiento: 31/12/2026"""


def test_extract_fields_from_renspa_constancia():
    f = extract_fields(TEXT)
    assert f.renspa == ["06.687.0.01542/00"]
    assert f.cuit == ["30-71548963-1"]
    assert f.holder_names[0] == "AGROPECUARIA LA ESPERANZA S.A"
    assert f.issued_at == "2026-02-10"
    assert f.expires_at == "2026-12-31"
    assert classify(TEXT).document_type == "RENSPA"


def test_invalid_cuit_check_digit_is_ignored():
    assert cuit_is_valid("30715489631")
    assert not cuit_is_valid("30715489632")
    assert extract_fields("CUIT 30-71548963-2").cuit == []


def test_classifies_other_documents():
    assert (
        classify(
            "CONTRATO DE ARRENDAMIENTO RURAL entre el arrendador y el arrendatario"
        ).document_type
        == "LEASE_CONTRACT"
    )
    assert classify("Constancia de Inscripción AFIP - CUIT").document_type == "ID_CUIT"
    assert classify("texto sin señales").document_type == "UNKNOWN"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")
    get_settings.cache_clear()
    yield TestClient(create_app())
    get_settings.cache_clear()


def test_ocr_endpoint_reads_a_scanned_constancia(client):
    """OCR real (RapidOCR) sobre una constancia escaneada sintética."""
    img = np.full((700, 1300, 3), 255, np.uint8)
    lines = [
        "CONSTANCIA DE INSCRIPCION EN EL RENSPA",
        "RENSPA: 06.687.0.01542/00",
        "Titular: AGROPECUARIA LA ESPERANZA S.A.",
        "CUIT: 30-71548963-1",
    ]
    for i, t in enumerate(lines):
        cv2.putText(img, t, (40, 100 + i * 110), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20, 20, 20), 2)
    ok, encoded = cv2.imencode(".png", img)
    assert ok
    r = client.post(
        "/v1/documents/analyze",
        files={"file": ("scan.png", encoded.tobytes(), "image/png")},
        headers={"x-internal-token": "test-token"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["method"] == "OCR"
    assert body["detected_type"] == "RENSPA"
    assert body["fields"]["renspa"] == ["06.687.0.01542/00"]
    assert body["fields"]["cuit"] == ["30-71548963-1"]
    assert body["text_confidence"] > 0.8


def test_rejects_unreadable_file(client):
    r = client.post(
        "/v1/documents/analyze",
        files={"file": ("x.bin", b"no es un documento", "application/octet-stream")},
        headers={"x-internal-token": "test-token"},
    )
    assert r.status_code == 422
