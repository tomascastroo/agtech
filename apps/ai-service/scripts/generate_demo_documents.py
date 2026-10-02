"""Documentos de DEMOSTRACIÓN para "Simular solicitud" (datos ficticios, sin valor).

Genera imágenes PNG con texto plano (sin logos, sellos ni formato de ningún organismo) que la
demo carga como documentos del productor ficticio "Juan Pérez". Pasan por el MISMO OCR que un
documento real: así se ve el flujo documento → OCR → campos → comparación → resultado.
Todos llevan la leyenda "DOCUMENTO DE DEMOSTRACIÓN – SIN VALOR". El CUIT (20-00000001-9) y el
RENSPA (código de provincia 99, inexistente) no corresponden a personas ni establecimientos.

Uso: uv run python scripts/generate_demo_documents.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT.parents[1] / "infra" / "seed-assets" / "demo-documents"
FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/Library/Fonts/Arial.ttf"),
)
BOLD_CANDIDATES = (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),)
WIDTH, HEIGHT, MARGIN = 1100, 1250, 70
LEGEND = "DOCUMENTO DE DEMOSTRACIÓN – SIN VALOR"

HOLDER = "JUAN PÉREZ"
CUIT = "20-00000001-9"
RENSPA = "99.001.0.00001/00"
OTHER_RENSPA = "99.001.0.00002/00"

DOCUMENTS: dict[str, dict] = {
    "constancia-cuit": {
        "type": "ID_CUIT",
        "title": "Constancia de inscripción – Clave Única de Identificación Tributaria",
        "lines": [
            f"Titular: {HOLDER}",
            f"CUIT: {CUIT}",
            "Actividad declarada: cría de ganado bovino",
            "Localidad: VILLAGUAY",
            "Provincia: ENTRE RÍOS",
            "Fecha de emisión: 15/09/2026",
        ],
    },
    "renspa": {
        "type": "RENSPA",
        "title": "Constancia de inscripción en el RENSPA",
        "lines": [
            "Registro Nacional Sanitario de Productores Agropecuarios",
            f"RENSPA: {RENSPA}",
            f"Titular: {HOLDER}",
            f"CUIT: {CUIT}",
            "Establecimiento: LA ESPERANZA",
            "Localidad: VILLAGUAY",
            "Provincia: ENTRE RÍOS",
            "Actividad: bovinos – cría",
        ],
    },
    "renspa-inconsistente": {
        "type": "RENSPA",
        "title": "Constancia de inscripción en el RENSPA",
        "lines": [
            "Registro Nacional Sanitario de Productores Agropecuarios",
            f"RENSPA: {OTHER_RENSPA}",
            f"Titular: {HOLDER}",
            f"CUIT: {CUIT}",
            "Establecimiento: LA ESPERANZA",
            "Localidad: VILLAGUAY",
            "Provincia: ENTRE RÍOS",
            "Actividad: bovinos – cría",
        ],
    },
    "certificado-vacunacion": {
        "type": "SANITARY_CERTIFICATE",
        "title": "Certificado de vacunación",
        "lines": [
            f"RENSPA: {RENSPA}",
            f"Titular: {HOLDER}",
            "Establecimiento: LA ESPERANZA",
            "Vacunación aftosa: 1.500 cabezas",
            "Vacunación brucelosis: terneras de 3 a 8 meses",
            "Fecha de emisión: 20/05/2026",
            "Vencimiento: 31/12/2030",
        ],
    },
    "contrato-arrendamiento": {
        "type": "LEASE_CONTRACT",
        "title": "Contrato de arrendamiento rural",
        "lines": [
            "Arrendador: MARÍA GÓMEZ",
            f"Arrendatario: {HOLDER}",
            f"Titular: {HOLDER}",
            "Establecimiento: LA ESPERANZA",
            "Localidad: VILLAGUAY",
            "Provincia: ENTRE RÍOS",
            "Superficie: 1.200 hectáreas",
            "Vigencia hasta: 30/06/2030",
        ],
    },
}


def font(candidates: tuple[Path, ...], size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def render(spec: dict) -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(img)
    regular = font(FONT_CANDIDATES, 30)
    bold = font(BOLD_CANDIDATES + FONT_CANDIDATES, 34)
    small = font(FONT_CANDIDATES, 24)
    # Leyenda de demostración arriba y abajo (no se puede confundir con un documento real).
    draw.rectangle((0, 0, WIDTH, 90), fill=(190, 40, 40))
    draw.text((MARGIN, 26), LEGEND, font=bold, fill="white")
    y = 150
    draw.text((MARGIN, y), spec["title"], font=bold, fill=(20, 20, 20))
    y += 50
    draw.text((MARGIN, y), "Formato de demostración generado por AgroGarantías", font=small,
              fill=(110, 110, 110))  # fmt: skip
    y += 70
    for line in spec["lines"]:
        draw.text((MARGIN, y), line, font=regular, fill=(20, 20, 20))
        y += 62
    draw.rectangle((0, HEIGHT - 80, WIDTH, HEIGHT), fill=(190, 40, 40))
    draw.text((MARGIN, HEIGHT - 58), LEGEND, font=small, fill="white")
    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "description": (
            "Documentos de DEMOSTRACIÓN (datos ficticios, sin valor) para 'Simular solicitud'. "
            "No imitan el formato de SENASA, ARCA ni de ningún organismo."
        ),
        "holder": HOLDER,
        "cuit": CUIT,
        "renspa": RENSPA,
        "documents": {},
    }
    for name, spec in DOCUMENTS.items():
        path = OUT_DIR / f"{name}.png"
        render(spec).save(path, optimize=True)
        manifest["documents"][name] = {"file": path.name, "type": spec["type"]}
        print(path)
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
