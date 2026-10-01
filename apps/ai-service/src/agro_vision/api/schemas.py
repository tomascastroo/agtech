from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class ModelInfo(BaseModel):
    code: str
    version: str
    task: str
    description: str
    license: str
    base_confidence: float
    simulated: bool
    parameters: dict[str, float | int | str]


class ExifInfo(BaseModel):
    captured_at: datetime | None
    latitude: float | None
    longitude: float | None
    camera_model: str | None


class ImageAnalysisResponse(BaseModel):
    format: str
    width: int
    height: int
    sharpness: float
    brightness: float
    contrast: float
    dhash: str = Field(description="Hash perceptual de 64 bits (hex)")
    quality_score: float = Field(ge=0, le=1)
    issues: list[str]
    exif: ExifInfo
    model: ModelInfo
    processing_ms: int


class DetectionOut(BaseModel):
    x: int
    y: int
    width: int
    height: int
    area_px: int
    estimated_animals: int
    label: str
    score: float | None = None


class CountResponse(BaseModel):
    count: int
    confidence: float = Field(ge=0, le=1)
    inference_passes: int = 1
    score_threshold: float | None = None
    clustered_components: int
    rejected_components: int
    detections: list[DetectionOut]
    detections_truncated: bool
    image: ImageAnalysisResponse
    model: ModelInfo
    processing_ms: int


class ChangeRegionOut(BaseModel):
    x: int
    y: int
    width: int
    height: int
    area_px: int


class ChangeResponse(BaseModel):
    changed_fraction: float = Field(ge=0, le=1)
    regions: list[ChangeRegionOut]
    model: ModelInfo
    processing_ms: int


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class GeometryIn(BaseModel):
    type: str = Field(pattern="^(Polygon|MultiPolygon)$")
    coordinates: list


class SceneSearchRequest(BaseModel):
    geometry: GeometryIn
    start: date
    end: date
    max_scene_cloud_cover: float = Field(default=80, ge=0, le=100)
    limit: int = Field(default=10, ge=1, le=50)


class SceneOut(BaseModel):
    scene_id: str
    platform: str
    acquired_at: datetime
    tile: str
    cloud_cover: float
    processing_baseline: str | None
    catalog: str


class ObservationsRequest(BaseModel):
    geometry: GeometryIn
    start: date
    end: date
    max_scenes: int = Field(default=1, ge=1, le=24)
    # Detenerse en la primera observación utilizable (verificación) o analizar la serie.
    stop_at_first_usable: bool = True
    include_previews: bool = True
    max_scene_cloud_cover: float = Field(default=80, ge=0, le=100)
    # Umbral de NDVI para considerar un píxel con vegetación activa (depende del tipo de activo).
    vegetation_threshold: float | None = Field(default=None, ge=0, le=1)


class NdviRequest(BaseModel):
    geometry: GeometryIn
    scene_id: str = Field(pattern=r"^S2[ABCD]_\d{1,2}[C-X][A-Z]{2}_\d{8}_\d+_L2A$")
    include_previews: bool = True
    vegetation_threshold: float | None = Field(default=None, ge=0, le=1)


class NdviObservationOut(BaseModel):
    scene: SceneOut
    polygon_pixels: int
    valid_pixels: int
    cloud_pixels: int
    polygon_area_ha: float
    cloud_cover_pct: float
    valid_fraction: float
    ndvi_mean: float | None
    ndvi_median: float | None
    ndvi_min: float | None
    ndvi_max: float | None
    ndvi_p10: float | None
    ndvi_p90: float | None
    ndvi_std: float | None
    vegetated_pixels: int
    vegetation_pct: float | None
    vegetated_area_observed_ha: float
    vegetated_area_estimated_ha: float | None
    usable: bool
    quality: str
    confidence: float
    issues: list[str]
    bands: list[str]
    processing_version: str
    processing_ms: int
    previews: dict[str, str]


class ObservationsResponse(BaseModel):
    observations: list[NdviObservationOut]
    scenes_considered: int
    thresholds: dict[str, float]
    model: ModelInfo
    processing_ms: int


class DocumentFieldsOut(BaseModel):
    renspa: list[str]
    cuit: list[str]
    holder_names: list[str]
    issued_at: str | None
    expires_at: str | None
    dates: list[str]


class DocumentAnalysisResponse(BaseModel):
    """Análisis de contenido. No certifica la autenticidad legal del documento."""

    method: str
    text_confidence: float
    pages: int
    lines: int
    text_excerpt: str
    detected_type: str
    classification_score: int
    classification_keywords: list[str]
    fields: DocumentFieldsOut
    engine: str
    version: str
    processing_ms: int
