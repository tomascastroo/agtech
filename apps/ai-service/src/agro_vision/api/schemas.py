from __future__ import annotations

from datetime import datetime

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


class CountResponse(BaseModel):
    count: int
    confidence: float = Field(ge=0, le=1)
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
