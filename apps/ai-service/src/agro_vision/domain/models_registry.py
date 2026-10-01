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
        "Segmentación por índice de exceso de verde (ExG), morfología y componentes conexos. "
        "Sólo válido para las escenas sintéticas de desarrollo; no usar con fotografías reales."
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

NDVI_PROCESSOR = ModelDescriptor(
    code="sentinel2-ndvi",
    version="1.0.0",
    task="VEGETATION_INDEX",
    description=(
        "NDVI (B08−B04)/(B08+B04) sobre Sentinel-2 L2A en el polígono declarado, con máscara de "
        "nubes y píxeles inválidos según la capa SCL; superficie con vegetación activa por umbral."
    ),
    license="Datos Copernicus Sentinel (libre y abierto); procesamiento propio",
    base_confidence=0.95,
)


def yolox_descriptor(
    variant: str, threshold: float, tiled_threshold: float, class_set: str, tile_size: int
) -> ModelDescriptor:
    """Descriptor del detector YOLOX activo (pesos COCO oficiales, ONNX)."""
    return ModelDescriptor(
        code=f"{variant.replace('_', '-')}-coco",
        version="0.1.1rc0-onnx",
        task="ANIMAL_COUNTING",
        description=(
            f"YOLOX ({variant}) preentrenado en COCO, inferencia ONNX Runtime; cuenta las clases "
            f"{class_set}. Umbral {threshold} en fotos completas y {tiled_threshold} en escenas "
            f"grandes procesadas por mosaico de {tile_size} px."
        ),
        license="Apache-2.0 (YOLOX, Megvii)",
        base_confidence=tiled_threshold,
        parameters={
            "score_threshold": threshold,
            "tiled_score_threshold": tiled_threshold,
            "class_set": class_set,
            "tile_size": tile_size,
        },
    )


REGISTRY: tuple[ModelDescriptor, ...] = (
    LIVESTOCK_COUNTER,
    IMAGE_QUALITY,
    CHANGE_DETECTOR,
    NDVI_PROCESSOR,
)
