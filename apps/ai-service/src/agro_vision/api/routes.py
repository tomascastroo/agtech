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
from ..domain.detection import Detection, TilingParams
from ..domain.documents import DOCUMENT_ANALYZER_VERSION, classify, extract_fields
from ..domain.image_quality import assess_quality
from ..domain.livestock import LIVESTOCK_CLASS_SETS, count_livestock
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
from ..domain.tracking import TRACKER_VERSION, TrackerParams, count_video
from ..infrastructure.document_reader import UnreadableDocumentError, read_document
from ..infrastructure.image_io import DecodedImage, InvalidImageError, decode_image
from ..infrastructure.sentinel_catalog import CatalogUnavailableError
from ..infrastructure.sentinel_reader import PolygonOutsideSceneError, analyze_scene
from ..infrastructure.video_reader import UnreadableVideoError, sample_frames
from ..runtime import ModelNotAvailableError, get_catalog, get_detector
from .schemas import (
    ChangeResponse,
    CountResponse,
    DetectionOut,
    DocumentAnalysisResponse,
    DocumentFieldsOut,
    ExifInfo,
    ImageAnalysisResponse,
    ModelInfo,
    NdviObservationOut,
    NdviRequest,
    ObservationsRequest,
    ObservationsResponse,
    SceneOut,
    SceneSearchRequest,
    VideoCountResponse,
    VideoFrameDetectionsOut,
    VideoTrackOut,
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


def _video_model(settings: Settings) -> ModelInfo:
    base = _model_info(_active_detector_model(settings))
    name, version = TRACKER_VERSION.split("/")
    return base.model_copy(
        update={"code": f"{base.code}+{name}", "version": f"{base.version}+{version}"}
    )


VIDEO_LIMITATIONS = {
    "passage": [
        "Cuenta los animales cuyo recorrido cruza la línea central del cuadro; supone que todo el "
        "rodeo pasa por el punto de paso filmado.",
        "Sin re-identificación por apariencia: un animal que retrocede y vuelve a cruzar después "
        "de perderse varios cuadros puede contarse dos veces; animales pegados pueden contarse "
        "como uno.",
        "Parámetros de seguimiento no calibrados con video de campo.",
    ],
    "overview": [
        "Vista general: se informa el máximo de animales visibles en un mismo cuadro (cota "
        "inferior). No estima el stock total del establecimiento.",
        "Los tracks confirmados se informan como cota superior: oclusiones y animales que salen y "
        "vuelven a entrar al cuadro generan identidades nuevas.",
    ],
}


@router.post("/animals/count-video", response_model=VideoCountResponse)
async def count_in_video(
    settings: SettingsDep,
    file: Annotated[UploadFile, File()],
    mode: Annotated[str, Query(pattern="^(passage|overview)$")] = "passage",
) -> VideoCountResponse:
    """Video → cuadros muestreados → YOLOX por cuadro → seguimiento → conteo sin duplicados."""
    started = time.perf_counter()
    if settings.detector != "yolox":
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "El conteo en video requiere YOLOX"
        )
    data = await file.read(settings.video_max_upload_bytes + 1)
    if len(data) > settings.video_max_upload_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Video demasiado grande")
    try:
        detector = get_detector(settings)
    except ModelNotAvailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    try:
        video = await run_in_threadpool(
            sample_frames,
            data,
            target_fps=settings.video_sample_fps,
            max_frames=settings.video_max_frames,
            max_side_px=settings.video_max_side_px,
        )
    except UnreadableVideoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    classes = LIVESTOCK_CLASS_SETS[settings.detector_class_set]
    no_tiling = TilingParams(tile_size=0)

    def detect_all() -> list[list[Detection]]:
        return [
            detector.detect(
                frame,
                score_threshold=settings.video_score_threshold,
                class_ids=classes,
                tiling=no_tiling,
            )[0]
            for frame in video.frames
        ]

    per_frame = await run_in_threadpool(detect_all)
    boxes = [[(d.x1, d.y1, d.x2, d.y2, d.score) for d in frame] for frame in per_frame]
    counted = count_video(boxes, (video.width, video.height), TrackerParams())
    peak_index = counted.detections_per_frame.index(counted.max_simultaneous)
    passage = mode == "passage"
    return VideoCountResponse(
        mode=mode,
        count=counted.line_crossings if passage else counted.max_simultaneous,
        method="LINE_CROSSING" if passage else "MAX_SIMULTANEOUS",
        confidence=counted.crossing_confidence if passage else counted.overview_confidence,
        line_crossings=counted.line_crossings,
        max_simultaneous=counted.max_simultaneous,
        confirmed_tracks=counted.confirmed_tracks,
        axis=counted.axis,
        line_position=counted.line_position,
        frames_processed=counted.frames,
        source_fps=video.source_fps,
        sampled_fps=video.sampled_fps,
        duration_s=video.duration_s,
        truncated=video.truncated,
        width=video.width,
        height=video.height,
        detections_per_frame=counted.detections_per_frame,
        tracks=[VideoTrackOut(**asdict(t)) for t in counted.tracks],
        peak_frame=VideoFrameDetectionsOut(
            frame=peak_index,
            detections=[
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
                for d in per_frame[peak_index][:MAX_DETECTIONS_RETURNED]
            ],
        ),
        score_threshold=settings.video_score_threshold,
        limitations=VIDEO_LIMITATIONS[mode]
        + (
            [f"Video truncado: se analizaron los primeros {counted.frames} cuadros muestreados."]
            if video.truncated
            else []
        ),
        model=_video_model(settings),
        processing_ms=_elapsed_ms(started),
    )


@router.post("/documents/analyze", response_model=DocumentAnalysisResponse)
async def analyze_document(
    settings: SettingsDep, file: Annotated[UploadFile, File()]
) -> DocumentAnalysisResponse:
    """OCR o capa de texto + clasificación + campos (RENSPA, CUIT, titular, fechas)."""
    started = time.perf_counter()
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Archivo demasiado grande")
    try:
        doc = await run_in_threadpool(read_document, data)
    except UnreadableDocumentError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    fields = extract_fields(doc.text)
    classification = classify(doc.text)
    return DocumentAnalysisResponse(
        method=doc.method,
        text_confidence=doc.confidence,
        pages=doc.pages,
        lines=doc.lines,
        text_excerpt=doc.text[:4000],
        detected_type=classification.document_type,
        classification_score=classification.score,
        classification_keywords=classification.matched,
        fields=DocumentFieldsOut(**asdict(fields)),
        engine="pdfium-text" if doc.method == "PDF_TEXT" else "rapidocr-onnxruntime",
        version=DOCUMENT_ANALYZER_VERSION,
        processing_ms=_elapsed_ms(started),
    )
