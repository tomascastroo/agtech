from __future__ import annotations

import hmac
import time
from dataclasses import asdict
from typing import Annotated

import cv2
import numpy as np
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
    status,
)
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
from ..domain.scan_processing import BLURRY_SHARPNESS, frame_quality, process_scan, track_frames
from ..domain.sentinel2 import (
    PROCESSING_VERSION,
    NdviResult,
    Scene,
    SceneNotFoundError,
    VegetationThresholds,
)
from ..domain.tracking import TRACKER_VERSION, LineSpec
from ..infrastructure.document_reader import UnreadableDocumentError, read_document
from ..infrastructure.image_io import DecodedImage, InvalidImageError, decode_image
from ..infrastructure.sentinel_catalog import CatalogUnavailableError
from ..infrastructure.sentinel_reader import PolygonOutsideSceneError, analyze_scene
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
    ScanBoxOut,
    ScanCrossingOut,
    ScanFrameOut,
    ScanMetricsOut,
    ScanPenOut,
    ScanProcessResponse,
    ScanTrackOut,
    ScanTrackResponse,
    SceneOut,
    SceneSearchRequest,
    TrackedBoxOut,
    TrackedFrameOut,
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


def _scan_model(settings: Settings) -> ModelInfo:
    base = _model_info(_active_detector_model(settings))
    return base.model_copy(
        update={"code": f"{base.code}+scan", "version": f"{base.version}+{TRACKER_VERSION}"}
    )


SCAN_LIMITATIONS = {
    "FIXED": [
        "Cuenta los animales cuyo recorrido cruza la línea de conteo; supone que todo el rodeo "
        "declarado pasa por el punto filmado (manga, tranquera, puerta de corral).",
        "Sin re-identificación por apariencia: animales pegados que el detector une en una caja "
        "cuentan como uno; un animal oculto mucho tiempo que reaparece es un track nuevo.",
        "Parámetros de detección y seguimiento no calibrados con escaneos de campo.",
    ],
    "SWEEP": [
        "Barrido desde un punto: cuenta los animales que cruzaron la línea central mientras la "
        "cámara giraba. Es una COTA INFERIOR: no ve animales ocultos, lejanos ni fuera del arco "
        "barrido, y no estima el stock total del establecimiento.",
        "Si el operador camina durante el barrido aparece paralaje y el conteo pierde validez.",
        "Parámetros de detección y seguimiento no calibrados con escaneos de campo.",
    ],
    "PEN": [
        "Escáner de corral: cuenta los animales QUIETOS visibles (corral, aguada, agrupamiento) "
        "como animales únicos; un animal que reaparece en el mismo lugar se cuenta una vez. Es "
        "una COTA INFERIOR: los animales tapados por otros o fuera de lo recorrido no se ven.",
        "Une vistas solo por posición tras compensar el movimiento de la cámara (sin "
        "re-identificación por apariencia): animales que se desplazan mucho entre vistas pueden "
        "contarse dos veces, y dos animales que ocupan el mismo lugar en momentos distintos, una.",
        "Parámetros de detección, seguimiento y unión no calibrados con escaneos de campo.",
    ],
    "PHOTO": [
        "Fotos del mismo grupo: cuenta animales únicos. Solo se suman zonas de fotos que se "
        "solapan entre sí (registradas por coincidencia de puntos); fotos que no se pueden unir "
        "no se suman (se toma el máximo) para no contar dos veces. Es una COTA INFERIOR.",
        "Los animales ocultos detrás de otros no se cuentan.",
        "Parámetros de detección no calibrados con fotos de campo.",
    ],
}


def _decode_frame(data: bytes, settings: Settings) -> np.ndarray:
    if len(data) > settings.scan_max_frame_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Cuadro demasiado grande")
    bgr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Cuadro ilegible")
    h, w = bgr.shape[:2]
    scale = settings.scan_max_frame_side_px / max(h, w)
    if scale < 1:
        bgr = cv2.resize(bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return bgr


def _frame_out(index: int, detections, quality, shift) -> ScanFrameOut:
    return ScanFrameOut(
        index=index,
        detections=[
            ScanBoxOut(
                x=int(d.x1),
                y=int(d.y1),
                width=int(d.width),
                height=int(d.height),
                score=round(d.score, 4),
                label=d.label,
            )
            for d in detections[:MAX_DETECTIONS_RETURNED]
        ],
        sharpness=quality.sharpness,
        brightness=quality.brightness,
        camera_shift=(round(shift[0], 2), round(shift[1], 2)) if shift is not None else None,
    )


@router.post("/scans/process", response_model=ScanProcessResponse)
async def process_scan_frames(
    settings: SettingsDep,
    frames: Annotated[list[UploadFile], File()],
    key_frames: Annotated[list[UploadFile] | None, File()] = None,
    mode: Annotated[str, Form(pattern="^(FIXED|SWEEP|PEN|PHOTO)$")] = "FIXED",
    line_orientation: Annotated[str, Form(pattern="^(vertical|horizontal)$")] = "vertical",
    line_position: Annotated[float, Form(ge=0.05, le=0.95)] = 0.5,
) -> ScanProcessResponse:
    """Conteo oficial: cuadros (en orden) → YOLOX → compensación de cámara → tracker → conteo
    por línea (FIXED/SWEEP) o animales únicos (PEN/PHOTO), con métricas de calidad."""
    started = time.perf_counter()
    if settings.detector != "yolox":
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "El escáner requiere YOLOX")
    if len(frames) > settings.scan_max_frames:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Demasiados cuadros")
    try:
        detector = get_detector(settings)
    except ModelNotAvailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    decoded = [
        _decode_frame(await f.read(settings.scan_max_frame_bytes + 1), settings) for f in frames
    ]
    keys = [
        _decode_frame(await f.read(settings.scan_max_frame_bytes + 1), settings)
        for f in key_frames or []
    ]
    classes = LIVESTOCK_CLASS_SETS[settings.detector_class_set]
    # Fotos: pocas y de mayor resolución → teselado (animales chicos), como el conteo por imagen.
    tiling = TilingParams() if mode == "PHOTO" else TilingParams(tile_size=0)

    def detect(image: np.ndarray) -> list[Detection]:
        return detector.detect(
            image,
            score_threshold=settings.scan_score_threshold,
            class_ids=classes,
            tiling=tiling,
        )[0]

    line = LineSpec(orientation=line_orientation, position=line_position)  # type: ignore[arg-type]
    try:
        result = await run_in_threadpool(process_scan, decoded, detect, mode, line)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    key_results = await run_in_threadpool(lambda: [(detect(k), frame_quality(k)) for k in keys])
    count = result.count
    return ScanProcessResponse(
        mode=mode,
        net_count=count.net_count,
        positive_crossings=count.positive_crossings,
        negative_crossings=count.negative_crossings,
        max_simultaneous=count.max_simultaneous,
        confirmed_tracks=count.confirmed_tracks,
        confidence=result.pen.confidence if result.pen is not None else count.confidence,
        frames_processed=count.frames,
        width=result.frame_size[0],
        height=result.frame_size[1],
        line_orientation=line_orientation,
        line_position=line_position,
        camera_pan_px=round(sum(dx for dx, _ in result.shifts), 1) if result.shifts else None,
        blurry_frames=sum(1 for q in result.quality if q.sharpness < BLURRY_SHARPNESS),
        tracks=[ScanTrackOut(**asdict(t)) for t in count.tracks],
        crossings=[ScanCrossingOut(**asdict(e)) for e in count.events],
        frames=[
            _frame_out(i, d, q, result.shifts[i] if result.shifts else None)
            for i, (d, q) in enumerate(zip(result.detections, result.quality, strict=True))
        ],
        key_frames=[_frame_out(i, d, q, None) for i, (d, q) in enumerate(key_results)],
        warnings=result.warnings,
        limitations=SCAN_LIMITATIONS[mode],
        score_threshold=settings.scan_score_threshold,
        observed=result.observed,
        method=result.pen.method if result.pen is not None else "LINE_CROSSING_NET",
        pen=ScanPenOut(**{k: v for k, v in asdict(result.pen).items() if k != "confidence"})
        if result.pen is not None
        else None,
        metrics=ScanMetricsOut(**asdict(result.metrics)),  # type: ignore[arg-type]
        tracker=TRACKER_VERSION,
        model=_scan_model(settings),
        processing_ms=_elapsed_ms(started),
    )


# Ventana de una captura de Manga + RFID: pocos cuadros alrededor de la lectura de caravana.
TRACK_MAX_FRAMES = 48


@router.post("/scans/track", response_model=ScanTrackResponse)
async def track_scan_frames(
    settings: SettingsDep,
    frames: Annotated[list[UploadFile], File()],
) -> ScanTrackResponse:
    """Detección (YOLOX) + seguimiento (ByteTrack) + calidad por cuadro. Solo percepción: no
    reconoce animales ni decide a qué caravana corresponde un bovino."""
    started = time.perf_counter()
    if settings.detector != "yolox":
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "El seguimiento requiere YOLOX")
    if len(frames) > TRACK_MAX_FRAMES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Demasiados cuadros")
    try:
        detector = get_detector(settings)
    except ModelNotAvailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    decoded = [
        _decode_frame(await f.read(settings.scan_max_frame_bytes + 1), settings) for f in frames
    ]
    classes = LIVESTOCK_CLASS_SETS[settings.detector_class_set]
    no_tiling = TilingParams(tile_size=0)

    def detect(image: np.ndarray) -> list[Detection]:
        return detector.detect(
            image,
            score_threshold=settings.scan_score_threshold,
            class_ids=classes,
            tiling=no_tiling,
        )[0]

    try:
        tracked, (width, height) = await run_in_threadpool(track_frames, decoded, detect)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return ScanTrackResponse(
        frames=[
            TrackedFrameOut(
                index=f.index,
                detections=[
                    TrackedBoxOut(
                        x=int(b.x1),
                        y=int(b.y1),
                        width=int(b.x2 - b.x1),
                        height=int(b.y2 - b.y1),
                        score=round(b.score, 4),
                        label=b.label,
                        track_id=b.track_id,
                        confirmed=b.confirmed,
                    )
                    for b in f.boxes[:MAX_DETECTIONS_RETURNED]
                ],
                sharpness=f.quality.sharpness,
                brightness=f.quality.brightness,
            )
            for f in tracked
        ],
        width=width,
        height=height,
        score_threshold=settings.scan_score_threshold,
        tracker=TRACKER_VERSION,
        model=_scan_model(settings),
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
