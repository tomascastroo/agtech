from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from agro_vision.config import get_settings
from agro_vision.domain.documents import (
    classify,
    cuit_is_valid,
    extract_entries,
    extract_fields,
)
from agro_vision.main import create_app

ROOT_DIR = Path(__file__).resolve().parents[3]

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


DEMO = """DOCUMENTO DE DEMOSTRACION - SIN VALOR
CERTIFICADO DE VACUNACION
RENSPA: 99.001.0.00001/00
Titular: JUAN PÉREZ   CUIT: 20-00000001-9
Establecimiento: LA ESPERANZA
Localidad: VILLAGUAY   Provincia: ENTRE RÍOS
Existencias totales: 1.500 cabezas
Vacunación aftosa y brucelosis
Fecha de emisión: 10/02/2026  Vencimiento: 31/12/2026"""


def test_entries_keep_original_normalized_and_line_confidence():
    entries = {e.field: e for e in extract_entries(DEMO, [0.5 + i / 100 for i in range(9)])}
    assert entries["CUIT"].original == "20-00000001-9"
    assert entries["CUIT"].normalized == "20000000019"
    assert entries["HOLDER"].original == "JUAN PÉREZ"
    assert entries["HOLDER"].normalized == "JUAN PEREZ"
    assert entries["PROVINCE"].normalized == "Entre Ríos"
    assert entries["LOCALITY"].normalized == "VILLAGUAY"
    assert entries["ESTABLISHMENT"].normalized == "LA ESPERANZA"
    assert entries["HEAD_COUNT"].normalized == "1500"
    assert entries["EXPIRES_AT"].normalized == "2026-12-31"
    assert entries["RENSPA"].confidence == 0.52  # confianza de su línea
    f = extract_fields(DEMO)
    assert f.vaccines == ["AFTOSA", "BRUCELOSIS"]
    assert f.head_counts == [1500]
    assert classify(DEMO).document_type == "SANITARY_CERTIFICATE"


def test_missing_fields_are_not_invented():
    entries = extract_entries("CERTIFICADO MIPYME\nRegistro de Empresas MiPyMEs")
    assert entries == []
    assert classify("CERTIFICADO MIPYME - Registro de Empresas MiPyMEs").document_type == (
        "MIPYME_CERTIFICATE"
    )
    # Una provincia inexistente no se normaliza a una real.
    assert extract_fields("Provincia: ATLANTIDA").provinces == []


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
    assert "RENSPA" in body["text"]
    cuit = next(e for e in body["entries"] if e["field"] == "CUIT")
    assert cuit["normalized"] == "30715489631"
    assert 0 < cuit["confidence"] <= 1


def test_rejects_unreadable_file(client):
    r = client.post(
        "/v1/documents/analyze",
        files={"file": ("x.bin", b"no es un documento", "application/octet-stream")},
        headers={"x-internal-token": "test-token"},
    )
    assert r.status_code == 422


DEMO_DOCS = ROOT_DIR / "infra" / "seed-assets" / "demo-documents"


@pytest.mark.parametrize(
    ("name", "doc_type", "fields"),
    [
        ("renspa", "RENSPA", {"RENSPA": "99.001.0.00001/00", "CUIT": "20000000019"}),
        ("renspa-inconsistente", "RENSPA", {"RENSPA": "99.001.0.00002/00"}),
        ("constancia-cuit", "ID_CUIT", {"CUIT": "20000000019", "PROVINCE": "Entre Ríos"}),
        ("certificado-vacunacion", "SANITARY_CERTIFICATE", {"EXPIRES_AT": "2030-12-31"}),
        ("contrato-arrendamiento", "LEASE_CONTRACT", {"LOCALITY": "VILLAGUAY"}),
    ],
)
def test_demo_documents_go_through_real_ocr(client, name, doc_type, fields):
    """Los documentos de DEMOSTRACIÓN pasan por el mismo OCR que uno real."""
    data = (DEMO_DOCS / f"{name}.png").read_bytes()
    r = client.post(
        "/v1/documents/analyze",
        files={"file": (f"{name}.png", data, "image/png")},
        headers={"x-internal-token": "test-token"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["method"] == "OCR"
    assert body["detected_type"] == doc_type
    assert "DEMOSTRACION" in body["text"].upper()
    found = {e["field"]: e["normalized"] for e in body["entries"]}
    for field, value in fields.items():
        assert found.get(field) == value, (field, found)
