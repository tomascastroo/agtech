"""Análisis de contenido de documentos (no certifica autenticidad).

A partir del texto (capa de texto del PDF u OCR) clasifica el tipo de documento por palabras
clave y extrae campos verificables: RENSPA, CUIT (con dígito verificador), titular y fechas.
La comparación con lo declarado la hace la API, que conoce el establecimiento y el activo.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

DOCUMENT_ANALYZER_VERSION = "agro-docs/1.0.0"

# Palabras clave por tipo (sobre texto normalizado: mayúsculas, sin acentos ni espacios).
CLASSIFIER: dict[str, tuple[tuple[str, int], ...]] = {
    "RENSPA": (
        ("RENSPA", 3),
        ("REGISTRONACIONALSANITARIO", 3),
        ("SENASA", 1),
        ("PRODUCTORESAGROPECUARIOS", 1),
    ),
    "ID_CUIT": (
        ("CONSTANCIADEINSCRIPCION", 2),
        ("AFIP", 2),
        ("ARCA", 1),
        ("CLAVEUNICADEIDENTIFICACIONTRIBUTARIA", 3),
        ("DOCUMENTONACIONALDEIDENTIDAD", 3),
        ("REGISTRONACIONALDELASPERSONAS", 3),
    ),
    "PROPERTY_DEED": (
        ("ESCRITURA", 3),
        ("ESCRIBANO", 2),
        ("REGISTRODELAPROPIEDAD", 2),
        ("MATRICULA", 1),
    ),
    "LEASE_CONTRACT": (
        ("CONTRATODEARRENDAMIENTO", 4),
        ("ARRENDADOR", 2),
        ("ARRENDATARIO", 2),
        ("ARRENDAMIENTO", 1),
    ),
    "INSURANCE_POLICY": (("POLIZA", 3), ("ASEGURADORA", 2), ("SUMAASEGURADA", 2), ("ASEGURADO", 1)),
    "SANITARY_CERTIFICATE": (
        ("CERTIFICADOSANITARIO", 3),
        ("VACUNACION", 2),
        ("AFTOSA", 2),
        ("BRUCELOSIS", 2),
        ("TUBERCULOSIS", 1),
    ),
}

RENSPA_RE = re.compile(r"(\d{2})\s*\.\s*(\d{3})\s*\.\s*(\d)\s*\.\s*(\d{5})\s*/\s*(\d{2})")
CUIT_RE = re.compile(r"(?<!\d)(20|23|24|27|30|33|34)\s*-?\s*(\d{8})\s*-?\s*(\d)(?!\d)")
DATE_RE = re.compile(r"(?<!\d)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?!\d)")
HOLDER_RE = re.compile(
    r"(?:TITULAR|RAZON\s*SOCIAL|APELLIDO\s*Y\s*NOMBRES?|DENOMINACION)\s*:?\s*([A-Z0-9 .,&'-]{3,80})"
)
EXPIRY_RE = re.compile(
    r"(?:VENC\w*|VIGENCIA|VALID[OA]\s*HASTA|VIGENTE\s*HASTA)\s*:?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})"
)
ISSUE_RE = re.compile(
    r"(?:EMISION|EMITID[OA]|FECHA\s*DE\s*EMISION|EXPEDICION)\s*:?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})"
)


def normalize(text: str) -> str:
    """Mayúsculas y sin acentos (conserva espacios y puntuación)."""
    stripped = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return stripped.upper()


def compact(text: str) -> str:
    """Solo letras y dígitos: el OCR a veces pierde espacios ("LAESPERANZA")."""
    return re.sub(r"[^A-Z0-9]", "", normalize(text))


def cuit_is_valid(digits: str) -> bool:
    if not re.fullmatch(r"\d{11}", digits):
        return False
    weights = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)
    mod = 11 - sum(int(d) * w for d, w in zip(digits, weights, strict=False)) % 11
    check = 0 if mod == 11 else 9 if mod == 10 else mod
    return check == int(digits[10])


def _iso(date_text: str) -> str | None:
    m = DATE_RE.search(date_text)
    if not m:
        return None
    d, mth, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= d <= 31 and 1 <= mth <= 12 and 1900 <= y <= 2100):
        return None
    return f"{y:04d}-{mth:02d}-{d:02d}"


@dataclass
class DocumentFields:
    renspa: list[str] = field(default_factory=list)
    cuit: list[str] = field(default_factory=list)
    holder_names: list[str] = field(default_factory=list)
    issued_at: str | None = None
    expires_at: str | None = None
    dates: list[str] = field(default_factory=list)


def extract_fields(text: str) -> DocumentFields:
    upper = normalize(text)
    fields = DocumentFields()
    for m in RENSPA_RE.finditer(upper):
        value = f"{m.group(1)}.{m.group(2)}.{m.group(3)}.{m.group(4)}/{m.group(5)}"
        if value not in fields.renspa:
            fields.renspa.append(value)
    for m in CUIT_RE.finditer(upper):
        digits = m.group(1) + m.group(2) + m.group(3)
        value = f"{digits[:2]}-{digits[2:10]}-{digits[10]}"
        if cuit_is_valid(digits) and value not in fields.cuit:
            fields.cuit.append(value)
    for line in upper.splitlines():
        m = HOLDER_RE.search(line)
        if m:
            name = re.sub(r"\s+", " ", m.group(1)).strip(" .,-")
            # Corta en otra etiqueta de la misma línea (p. ej. "... CUIT: ...").
            name = re.split(r"\b(?:CUIT|CUIL|DNI|RENSPA|DOMICILIO)\b", name)[0].strip(" .,-:")
            if len(name) >= 3 and name not in fields.holder_names:
                fields.holder_names.append(name)
    m = EXPIRY_RE.search(upper)
    fields.expires_at = _iso(m.group(1)) if m else None
    m = ISSUE_RE.search(upper)
    fields.issued_at = _iso(m.group(1)) if m else None
    fields.dates = sorted({iso for m in DATE_RE.finditer(upper) if (iso := _iso(m.group(0)))})
    return fields


@dataclass
class Classification:
    document_type: str
    score: int
    matched: list[str]


def classify(text: str) -> Classification:
    flat = compact(text)
    best = Classification("UNKNOWN", 0, [])
    for doc_type, keywords in CLASSIFIER.items():
        matched = [k for k, _ in keywords if k in flat]
        score = sum(w for k, w in keywords if k in flat)
        if score > best.score:
            best = Classification(doc_type, score, matched)
    return best if best.score >= 2 else Classification("UNKNOWN", best.score, best.matched)
