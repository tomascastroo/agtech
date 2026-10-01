from __future__ import annotations

import hmac
import time
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from ..config import Settings, get_settings
from ..domain.change_detection import detect_changes
from ..domain.counting import CounterParams, count_animals
from ..domain.detection import TilingParams
from ..domain.image_quality import assess_quality
from ..domain.livestock import count_livestock
from ..domain.models_registry import (
    IMAGE_QUALITY,
    NDVI_PROCESSOR,
    REGISTRY,
    ModelDescriptor,
    yolox_descriptor,
)
from ..domain.sentinel2 import (
    PROCESSING_VERSION,
    NdviResult,
    Scene,
    SceneNotFoundError,
    VegetationThresholds,
)
from ..infrastructure.image_io import DecodedImage, InvalidImageError, decode_image
from ..infrastructure.sentinel_catalog import CatalogUnavailableError
from ..infrastructure.sentinel_reader import PolygonOutsideSceneError, analyze_scene
from ..runtime import ModelNotAvailableError, get_catalog, get_detector
from .schemas import (
    ChangeResponse,
    CountResponse,
    DetectionOut,
    ExifInfo,
    ImageAnalysisResponse,
    ModelInfo,
    NdviObservationOut,
    NdviRequest,
    ObservationsRequest,
    ObservationsResponse,
    SceneOut,
    SceneSearchRequest,
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


def _active_detector_model(settings: Settings) -> ModelDescriptor:
    return yolox_descriptor(
        settings.detector_model,
        settings.detector_score_threshold,
        settings.detector_tiled_score_threshold,
        settings.detector_class_set,
        settings.detector_tile_size,
    )


@router.get("/models", response_model=list[ModelInfo])
def list_models(settings: SettingsDep) -> list[ModelInfo]:
    models = list(REGISTRY)
    if settings.detector == "yolox":
        models.insert(0, _active_detector_model(settings))
    return [_model_info(m) for m in models]


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
    """Validación → calidad → detección → filtro de confianza → conteo."""
    started = time.perf_counter()
    image = await _read_image(file, settings)
    if settings.detector == "yolox":
        try:
            detector = get_detector(settings)
        except ModelNotAvailableError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
        result = await run_in_threadpool(
            count_livestock,
            detector,
            image.bgr,
            score_threshold=settings.detector_score_threshold,
            tiled_score_threshold=settings.detector_tiled_score_threshold,
            class_set=settings.detector_class_set,
            tiling=TilingParams(
                tile_size=settings.detector_tile_size,
                overlap=settings.detector_tile_overlap,
                min_ratio=settings.detector_tile_min_ratio,
            ),
        )
        detections = [
            DetectionOut(
                x=int(d.x1),
                y=int(d.y1),
                width=int(d.width),
                height=int(d.height),
                area_px=int(d.width * d.height),
                estimated_animals=1,
                label=d.label,
                score=round(d.score, 4),
            )
            for d in result.detections
        ]
        return CountResponse(
            count=result.count,
            confidence=result.confidence,
            inference_passes=result.inference_passes,
            score_threshold=result.score_threshold,
            clustered_components=0,
            rejected_components=0,
            detections=detections[:MAX_DETECTIONS_RETURNED],
            detections_truncated=len(detections) > MAX_DETECTIONS_RETURNED,
            image=_analysis(image, started),
            model=_model_info(_active_detector_model(settings)),
            processing_ms=_elapsed_ms(started),
        )

    defaults = CounterParams()
    params = CounterParams(
        min_area_px=min_area_px or defaults.min_area_px,
        max_area_px=max_area_px or defaults.max_area_px,
    )
    if params.min_area_px >= params.max_area_px:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "min_area_px >= max_area_px")
    classical = count_animals(image.bgr, params)
    return CountResponse(
        count=classical.count,
        confidence=classical.confidence,
        clustered_components=classical.clustered_components,
        rejected_components=classical.rejected_components,
        detections=[
            DetectionOut(**asdict(d)) for d in classical.detections[:MAX_DETECTIONS_RETURNED]
        ],
        detections_truncated=len(classical.detections) > MAX_DETECTIONS_RETURNED,
        image=_analysis(image, started),
        model=_model_info(classical.model),
        processing_ms=_elapsed_ms(started),
    )


def _scene_out(scene: Scene) -> SceneOut:
    return SceneOut(
        scene_id=scene.scene_id,
        platform=scene.platform,
        acquired_at=scene.acquired_at,
        tile=scene.tile,
        cloud_cover=round(scene.cloud_cover, 2),
        processing_baseline=scene.processing_baseline,
        catalog=scene.catalog,
    )


def _thresholds(
    settings: Settings, vegetation_threshold: float | None = None
) -> VegetationThresholds:
    return VegetationThresholds(
        ndvi_vegetated=vegetation_threshold
        if vegetation_threshold is not None
        else settings.ndvi_vegetation_threshold,
        max_cloud_cover_pct=settings.max_cloud_cover,
        min_valid_fraction=settings.min_valid_fraction,
    )


@router.post("/satellite/scenes/search", response_model=list[SceneOut])
async def search_scenes(settings: SettingsDep, body: SceneSearchRequest) -> list[SceneOut]:
    catalog = get_catalog(settings.sentinel_catalog, settings.earth_search_url)
    try:
        scenes = await run_in_threadpool(
            catalog.search,
            body.geometry.model_dump(),
            body.start,
            body.end,
            body.max_scene_cloud_cover,
            body.limit,
        )
    except CatalogUnavailableError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Catálogo Sentinel-2 no disponible: {exc}"
        ) from exc
    return [_scene_out(s) for s in scenes]


def _observation_out(scene: Scene, ndvi: NdviResult, started: float) -> NdviObservationOut:
    return NdviObservationOut(
        scene=_scene_out(scene),
        **{k: v for k, v in asdict(ndvi).items() if k not in {"scene_id", "acquired_at"}},
        bands=["B04", "B08", "SCL"],
        processing_version=PROCESSING_VERSION,
        processing_ms=_elapsed_ms(started),
    )


@router.post("/satellite/ndvi", response_model=NdviObservationOut)
async def ndvi_for_scene(settings: SettingsDep, body: NdviRequest) -> NdviObservationOut:
    """NDVI de una escena concreta sobre el polígono (la escena se resuelve en el catálogo)."""
    started = time.perf_counter()
    catalog = get_catalog(settings.sentinel_catalog, settings.earth_search_url)
    try:
        scene = await run_in_threadpool(catalog.get, body.scene_id)
        result = await run_in_threadpool(
            analyze_scene,
            scene,
            body.geometry.model_dump(),
            _thresholds(settings, body.vegetation_threshold),
            body.include_previews,
        )
    except SceneNotFoundError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Escena inexistente: {body.scene_id}"
        ) from exc
    except PolygonOutsideSceneError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "El polígono no se superpone con la escena"
        ) from exc
    except CatalogUnavailableError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Catálogo Sentinel-2 no disponible: {exc}"
        ) from exc
    return _observation_out(scene, result, started)


@router.post("/satellite/observations", response_model=ObservationsResponse)
async def observations(settings: SettingsDep, body: ObservationsRequest) -> ObservationsResponse:
    """Escenas del período y NDVI sobre el polígono, de la más reciente hacia atrás."""
    started = time.perf_counter()
    catalog = get_catalog(settings.sentinel_catalog, settings.earth_search_url)
    geometry = body.geometry.model_dump()
    thresholds = _thresholds(settings, body.vegetation_threshold)
    try:
        scenes = await run_in_threadpool(
            catalog.search,
            geometry,
            body.start,
            body.end,
            body.max_scene_cloud_cover,
            body.max_scenes * 3,
        )
    except CatalogUnavailableError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Catálogo Sentinel-2 no disponible: {exc}"
        ) from exc
    results: list[NdviObservationOut] = []
    for scene in scenes:
        if len(results) >= body.max_scenes:
            break
        scene_started = time.perf_counter()
        try:
            ndvi = await run_in_threadpool(
                analyze_scene, scene, geometry, thresholds, body.include_previews
            )
        except (PolygonOutsideSceneError, SceneNotFoundError):
            continue
        if ndvi.polygon_pixels and ndvi.valid_pixels == 0 and ndvi.cloud_pixels == 0:
            continue  # el lote cae fuera de la franja adquirida por esa órbita
        results.append(_observation_out(scene, ndvi, scene_started))
        if body.stop_at_first_usable and ndvi.usable:
            break
    return ObservationsResponse(
        observations=results,
        scenes_considered=len(scenes),
        thresholds={
            "ndvi_vegetated": thresholds.ndvi_vegetated,
            "max_cloud_cover_pct": thresholds.max_cloud_cover_pct,
            "min_valid_fraction": thresholds.min_valid_fraction,
        },
        model=_model_info(NDVI_PROCESSOR),
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
