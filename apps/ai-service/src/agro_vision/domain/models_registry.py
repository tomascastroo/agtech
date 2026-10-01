"""Registro de modelos disponibles en el servicio.

Cada resultado devuelto por la API incluye el código y la versión del modelo, de modo que
toda verificación pueda reproducirse y auditarse.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ModelDescriptor:
    code: str
    version: str
    task: str
    description: str
    license: str
    # Confianza base declarada para el modelo. Para los modelos clásicos v1 no existe todavía un
    # dataset de validación de campo: el valor es una calibración interna que debe recalibrarse
    # con datos reales antes de uso productivo.
    base_confidence: float
    simulated: bool = False
    parameters: dict[str, float | int | str] = field(default_factory=dict)


LIVESTOCK_COUNTER = ModelDescriptor(
    code="classical-livestock-counter",
    version="1.0.0",
    task="ANIMAL_COUNTING",
    description=(
        "Segmentación por índice de exceso de verde (ExG), morfología y componentes conexos "
        "para conteo de bovinos en tomas cenitales sobre pastura."
    ),
    license="Apache-2.0 (OpenCV)",
    base_confidence=0.86,
    parameters={"min_area_px": 30, "max_area_px": 900, "exg_threshold": 12},
)

IMAGE_QUALITY = ModelDescriptor(
    code="image-quality-metrics",
    version="1.0.0",
    task="IMAGE_QUALITY",
    description="Nitidez (varianza del Laplaciano), exposición, contraste y dHash.",
    license="Apache-2.0 (OpenCV)",
    base_confidence=1.0,
)

CHANGE_DETECTOR = ModelDescriptor(
    code="classical-change-detector",
    version="1.0.0",
    task="CHANGE_DETECTION",
    description="Diferencia absoluta normalizada entre dos tomas alineadas, con umbral de Otsu.",
    license="Apache-2.0 (OpenCV)",
    base_confidence=0.8,
)

REGISTRY: tuple[ModelDescriptor, ...] = (LIVESTOCK_COUNTER, IMAGE_QUALITY, CHANGE_DETECTOR)
