"""Análisis de contenido de documentos (no certifica autenticidad).

A partir del texto (capa de texto del PDF u OCR) clasifica el tipo de documento por palabras
clave y extrae campos verificables con reglas deterministas (sin modelos generativos):
RENSPA, CUIT (con dígito verificador), titular, establecimiento, localidad, provincia, fechas,
cantidad de cabezas y vacunaciones. Cada campo conserva el valor ORIGINAL (tal como se leyó),
el NORMALIZADO y la confianza de la línea donde se leyó. Solo se informa lo que aparece en el
texto: si un campo no está, no se completa. La comparación con lo declarado la hace la API.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

DOCUMENT_ANALYZER_VERSION = "agro-docs/1.1.0"

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
        ("CERTIFICADODEVACUNACION", 3),
        ("VACUNACION", 2),
        ("AFTOSA", 2),
        ("BRUCELOSIS", 2),
        ("TUBERCULOSIS", 1),
    ),
    "MIPYME_CERTIFICATE": (("CERTIFICADOMIPYME", 4), ("REGISTRODEEMPRESASMIPYMES", 3)),
    "STOCK_CERTIFICATE": (
        ("EXISTENCIASGANADERAS", 4),
        ("CONSTANCIADEEXISTENCIAS", 4),
        ("INFORMEDESTOCK", 3),
        ("EXISTENCIAS", 1),
    ),
    "BRAND_TITLE": (("BOLETODEMARCA", 4), ("MARCAYSENAL", 3), ("TITULODEMARCA", 3)),
    "FEEDLOT_REGISTRATION": (
        ("ENGORDEACORRAL", 4),
        ("REGISTROESPECIALBOVINOS", 3),
        ("FEEDLOT", 2),
    ),
    "FINANCIAL_STATEMENTS": (
        ("ESTADOSCONTABLES", 4),
        ("MANIFESTACIONDEBIENES", 4),
        ("BALANCEGENERAL", 3),
        ("ESTADODESITUACIONPATRIMONIAL", 3),
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
ESTABLISHMENT_RE = re.compile(
    r"(?:ESTABLECIMIENTO|NOMBRE\s*DEL\s*CAMPO|DENOMINACION\s*DEL\s*PREDIO|PREDIO)\s*:\s*"
    r"([A-Z0-9 .'-]{3,60})"
)
LOCALITY_RE = re.compile(r"(?:LOCALIDAD|PARTIDO|DEPARTAMENTO)\s*:\s*([A-Z0-9 .'-]{3,50})")
PROVINCE_LABEL_RE = re.compile(r"PROVINCIA\s*:\s*([A-Z .'-]{4,40})")
HEADS_RE = re.compile(
    r"(?:(?:TOTAL|CANTIDAD|EXISTENCIA)[A-Z ]{0,30}:\s*(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*"
    r"(?:CABEZAS|BOVINOS|ANIMALES)?)"
    # Antes de "cabezas" el OCR suele leer 0 como O ("1.5OO"): se acepta y se corrige.
    r"|(?:(\d[\dO]{0,2}(?:[.\s][\dO]{3})*|\d[\dO]*)\s*(?:CABEZAS|BOVINOS))"
)
VACCINE_RE = re.compile(r"(AFTOSA|BRUCELOSIS|CARBUNCLO|TUBERCULOSIS)")
LABELS_AFTER_VALUE = r"\b(?:CUIT|CUIL|DNI|RENSPA|DOMICILIO|LOCALIDAD|PROVINCIA|PARTIDO|FECHA)\b"

# Provincias argentinas (forma normalizada → nombre oficial).
PROVINCES = {
    "BUENOSAIRES": "Buenos Aires",
    "CIUDADAUTONOMADEBUENOSAIRES": "Ciudad Autónoma de Buenos Aires",
    "CATAMARCA": "Catamarca",
    "CHACO": "Chaco",
    "CHUBUT": "Chubut",
    "CORDOBA": "Córdoba",
    "CORRIENTES": "Corrientes",
    "ENTRERIOS": "Entre Ríos",
    "FORMOSA": "Formosa",
    "JUJUY": "Jujuy",
    "LAPAMPA": "La Pampa",
    "LARIOJA": "La Rioja",
    "MENDOZA": "Mendoza",
    "MISIONES": "Misiones",
    "NEUQUEN": "Neuquén",
    "RIONEGRO": "Río Negro",
    "SALTA": "Salta",
    "SANJUAN": "San Juan",
    "SANLUIS": "San Luis",
    "SANTACRUZ": "Santa Cruz",
    "SANTAFE": "Santa Fe",
    "SANTIAGODELESTERO": "Santiago del Estero",
    "TIERRADELFUEGO": "Tierra del Fuego",
    "TUCUMAN": "Tucumán",
}

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
    establishment_names: list[str] = field(default_factory=list)
    localities: list[str] = field(default_factory=list)
    provinces: list[str] = field(default_factory=list)
    head_counts: list[int] = field(default_factory=list)
    vaccines: list[str] = field(default_factory=list)


@dataclass
class FieldEntry:
    """Un campo leído: valor tal como figura, valor normalizado y confianza de su línea."""

    field: str
    original: str
    normalized: str
    confidence: float | None
    line: int


def _clean_value(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip(" .,-:")
    return re.split(LABELS_AFTER_VALUE, value)[0].strip(" .,-:")


def _province(value: str) -> str | None:
    flat = compact(value)
    if flat in PROVINCES:
        return PROVINCES[flat]
    # "PCIA. DE ENTRE RIOS", "PROVINCIA DE BUENOS AIRES"
    for key, name in PROVINCES.items():
        if flat.endswith(key) and len(flat) - len(key) <= 12:
            return name
    return None


def extract_entries(text: str, line_confidences: list[float] | None = None) -> list[FieldEntry]:
    """Campos con valor original, normalizado y confianza (por línea) para guardar y auditar."""
    raw_lines = text.splitlines()
    confs = line_confidences or []
    entries: list[FieldEntry] = []
    seen: set[tuple[str, str]] = set()

    def add(name: str, original: str, normalized: str, line: int) -> None:
        if (name, normalized) in seen:
            return
        seen.add((name, normalized))
        conf = confs[line] if line < len(confs) else None
        entries.append(FieldEntry(name, original.strip(), normalized, conf, line))

    for i, raw in enumerate(raw_lines):
        upper = normalize(raw)
        # Si normalizar cambió la longitud (símbolos sin equivalente ASCII), el texto original no
        # se puede recortar por posición: se usa el normalizado.
        source = raw if len(upper) == len(raw) else upper

        def span(a: int, b: int, source: str = source) -> str:
            return source[a:b]

        for m in RENSPA_RE.finditer(upper):
            value = f"{m.group(1)}.{m.group(2)}.{m.group(3)}.{m.group(4)}/{m.group(5)}"
            add("RENSPA", span(m.start(), m.end()), value, i)
        for m in CUIT_RE.finditer(upper):
            digits = m.group(1) + m.group(2) + m.group(3)
            if cuit_is_valid(digits):
                add("CUIT", span(m.start(), m.end()), digits, i)
        if m := HOLDER_RE.search(upper):
            name = _clean_value(m.group(1))
            if len(name) >= 3:
                add("HOLDER", span(m.start(1), m.start(1) + len(name)), name, i)
        if m := ESTABLISHMENT_RE.search(upper):
            name = _clean_value(m.group(1))
            if len(name) >= 3:
                add("ESTABLISHMENT", span(m.start(1), m.start(1) + len(name)), name, i)
        if m := LOCALITY_RE.search(upper):
            name = _clean_value(m.group(1))
            if len(name) >= 3:
                add("LOCALITY", span(m.start(1), m.start(1) + len(name)), name, i)
        if m := PROVINCE_LABEL_RE.search(upper):
            value = _clean_value(m.group(1))
            if province := _province(value):
                add("PROVINCE", span(m.start(1), m.start(1) + len(value)), province, i)
        if (m := EXPIRY_RE.search(upper)) and (iso := _iso(m.group(1))):
            add("EXPIRES_AT", m.group(1), iso, i)
        if (m := ISSUE_RE.search(upper)) and (iso := _iso(m.group(1))):
            add("ISSUED_AT", m.group(1), iso, i)
        for m in HEADS_RE.finditer(upper):
            number = m.group(1) or m.group(2)
            heads = int(re.sub(r"\D", "", number.replace("O", "0")))
            if 0 < heads <= 2_000_000:
                add("HEAD_COUNT", span(m.start(), m.end()).strip(), str(heads), i)
        for m in VACCINE_RE.finditer(upper):
            add("VACCINE", span(m.start(), m.end()), m.group(1), i)
    return entries


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
    for entry in extract_entries(text):
        target = {
            "ESTABLISHMENT": fields.establishment_names,
            "LOCALITY": fields.localities,
            "PROVINCE": fields.provinces,
            "VACCINE": fields.vaccines,
        }.get(entry.field)
        if target is not None and entry.normalized not in target:
            target.append(entry.normalized)
        if entry.field == "HEAD_COUNT" and int(entry.normalized) not in fields.head_counts:
            fields.head_counts.append(int(entry.normalized))
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
