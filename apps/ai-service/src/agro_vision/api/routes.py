from __future__ import annotations

import hmac
import time
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status

from ..config import Settings, get_settings
from ..domain.change_detection import detect_changes
from ..domain.counting import CounterParams, count_animals
from ..domain.image_quality import assess_quality
from ..domain.models_registry import IMAGE_QUALITY, REGISTRY, ModelDescriptor
from ..infrastructure.image_io import DecodedImage, InvalidImageError, decode_image
from .schemas import (
    ChangeResponse,
    CountResponse,
    DetectionOut,
    ExifInfo,
    ImageAnalysisResponse,
    ModelInfo,
)

MAX_DETECTIONS_RETURNED = 500

SettingsDep = Annotated[Settings, Depends(get_settings)]


def require_internal_token(
    settings: SettingsDep,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    if not settings.auth_enabled:
        return
    expected = settings.token.get_secret_value()
    if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")


router = APIRouter(prefix="/v1", dependencies=[Depends(require_internal_token)])


def _model_info(model: ModelDescriptor) -> ModelInfo:
    return ModelInfo(**asdict(model))


async def _read_image(upload: UploadFile, settings: Settings) -> DecodedImage:
    data = await upload.read(settings.max_upload_bytes + 1)
    try:
        return decode_image(
            data, max_bytes=settings.max_upload_bytes, max_side_px=settings.max_image_side_px
        )
    except InvalidImageError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


def _analysis(image: DecodedImage, started: float) -> ImageAnalysisResponse:
    report = assess_quality(image.bgr)
    return ImageAnalysisResponse(
        format=image.format,
        width=report.width,
        height=report.height,
        sharpness=report.sharpness,
        brightness=report.brightness,
        contrast=report.contrast,
        dhash=report.dhash,
        quality_score=report.quality_score,
        issues=report.issues,
        exif=ExifInfo(**asdict(image.exif)),
        model=_model_info(IMAGE_QUALITY),
        processing_ms=_elapsed_ms(started),
    )


@router.get("/models", response_model=list[ModelInfo])
def list_models() -> list[ModelInfo]:
    return [_model_info(m) for m in REGISTRY]


@router.post("/images/analyze", response_model=ImageAnalysisResponse)
async def analyze_image(
    settings: SettingsDep, file: Annotated[UploadFile, File()]
) -> ImageAnalysisResponse:
    started = time.perf_counter()
    image = await _read_image(file, settings)
    return _analysis(image, started)


@router.post("/animals/count", response_model=CountResponse)
async def count(
    settings: SettingsDep,
    file: Annotated[UploadFile, File()],
    species: Annotated[str, Query(pattern="^(bovine)$")] = "bovine",
    min_area_px: Annotated[int | None, Query(ge=4, le=10_000)] = None,
    max_area_px: Annotated[int | None, Query(ge=8, le=100_000)] = None,
) -> CountResponse:
    started = time.perf_counter()
    image = await _read_image(file, settings)
    defaults = CounterParams()
    params = CounterParams(
        min_area_px=min_area_px or defaults.min_area_px,
        max_area_px=max_area_px or defaults.max_area_px,
    )
    if params.min_area_px >= params.max_area_px:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "min_area_px >= max_area_px")
    result = count_animals(image.bgr, params)
    return CountResponse(
        count=result.count,
        confidence=result.confidence,
        clustered_components=result.clustered_components,
        rejected_components=result.rejected_components,
        detections=[DetectionOut(**asdict(d)) for d in result.detections[:MAX_DETECTIONS_RETURNED]],
        detections_truncated=len(result.detections) > MAX_DETECTIONS_RETURNED,
        image=_analysis(image, started),
        model=_model_info(result.model),
        processing_ms=_elapsed_ms(started),
    )


@router.post("/changes/detect", response_model=ChangeResponse)
async def changes(
    settings: SettingsDep,
    before: Annotated[UploadFile, File()],
    after: Annotated[UploadFile, File()],
) -> ChangeResponse:
    started = time.perf_counter()
    image_before = await _read_image(before, settings)
    image_after = await _read_image(after, settings)
    result = detect_changes(image_before.bgr, image_after.bgr)
    return ChangeResponse(
        changed_fraction=result.changed_fraction,
        regions=[asdict(r) for r in result.regions],
        model=_model_info(result.model),
        processing_ms=_elapsed_ms(started),
    )


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
