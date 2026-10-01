"""Detección de objetos con YOLOX (Megvii, Apache-2.0) exportado a ONNX.

El modelo se ejecuta con ONNX Runtime (CPU por defecto; GPU con el proveedor CUDA si está
disponible), sin dependencias de PyTorch. Para imágenes grandes con animales pequeños (tomas de
dron o cámaras de gran angular) la inferencia se hace por mosaicos solapados más una pasada
global, y las detecciones duplicadas en los bordes se fusionan.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

COCO_CLASSES: tuple[str, ...] = (
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog",
    "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
    "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
    "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant",
    "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
    "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors",
    "teddy bear", "hair drier", "toothbrush",
)  # fmt: skip

STRIDES = (8, 16, 32)


@dataclass(frozen=True)
class Detection:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float
    class_id: int

    @property
    def label(self) -> str:
        return COCO_CLASSES[self.class_id]

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1


@dataclass(frozen=True)
class TilingParams:
    """Mosaico en píxeles nativos de la imagen; 0 desactiva el mosaico."""

    tile_size: int = 640
    overlap: float = 0.2
    # Sólo se usa mosaico cuando el lado mayor supera tile_size × min_ratio.
    min_ratio: float = 1.5

    def applies_to(self, shape: tuple[int, int]) -> bool:
        return self.tile_size > 0 and max(shape) > self.tile_size * self.min_ratio


def letterbox(image_bgr: np.ndarray, size: tuple[int, int]) -> tuple[np.ndarray, float]:
    """Redimensiona conservando la proporción y rellena con gris 114 (preprocesado YOLOX)."""
    height, width = size
    ratio = min(height / image_bgr.shape[0], width / image_bgr.shape[1])
    resized = cv2.resize(
        image_bgr,
        (int(image_bgr.shape[1] * ratio), int(image_bgr.shape[0] * ratio)),
        interpolation=cv2.INTER_LINEAR,
    )
    padded = np.full((height, width, 3), 114, dtype=np.uint8)
    padded[: resized.shape[0], : resized.shape[1]] = resized
    tensor = np.ascontiguousarray(padded.transpose(2, 0, 1)[None], dtype=np.float32)
    return tensor, ratio


def decode_outputs(raw: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Convierte la salida cruda de YOLOX (offsets por celda) a cx, cy, w, h en píxeles."""
    grids, strides = [], []
    for stride in STRIDES:
        h, w = size[0] // stride, size[1] // stride
        xv, yv = np.meshgrid(np.arange(w), np.arange(h))
        grids.append(np.stack((xv, yv), 2).reshape(1, -1, 2))
        strides.append(np.full((1, h * w, 1), stride))
    grid = np.concatenate(grids, 1)
    stride = np.concatenate(strides, 1)
    decoded = raw.astype(np.float32).copy()
    decoded[..., :2] = (decoded[..., :2] + grid) * stride
    decoded[..., 2:4] = np.exp(decoded[..., 2:4]) * stride
    return decoded


def box_iou_matrix(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """IoU e intersección sobre el menor (IoS) entre dos conjuntos de cajas xyxy."""
    x1 = np.maximum(a[:, None, 0], b[None, :, 0])
    y1 = np.maximum(a[:, None, 1], b[None, :, 1])
    x2 = np.minimum(a[:, None, 2], b[None, :, 2])
    y2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area_a = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    area_b = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    union = area_a[:, None] + area_b[None, :] - inter
    smaller = np.minimum(area_a[:, None], area_b[None, :])
    return inter / np.maximum(union, 1e-9), inter / np.maximum(smaller, 1e-9)


def merge_detections(
    detections: list[Detection], iou_threshold: float = 0.5, ios_threshold: float = 0.8
) -> list[Detection]:
    """Supresión greedy agnóstica de clase por IoU o por contención (bordes de mosaico)."""
    if not detections:
        return []
    ordered = sorted(detections, key=lambda d: d.score, reverse=True)
    boxes = np.array([[d.x1, d.y1, d.x2, d.y2] for d in ordered], dtype=np.float32)
    iou, ios = box_iou_matrix(boxes, boxes)
    suppressed = np.zeros(len(ordered), dtype=bool)
    kept: list[Detection] = []
    for i, detection in enumerate(ordered):
        if suppressed[i]:
            continue
        kept.append(detection)
        suppressed |= (iou[i] > iou_threshold) | (ios[i] > ios_threshold)
    return kept


def tile_origins(length: int, tile: int, overlap: float) -> list[int]:
    if length <= tile:
        return [0]
    step = max(1, int(tile * (1 - overlap)))
    origins = list(range(0, length - tile, step))
    origins.append(length - tile)
    return sorted(set(origins))


class YoloxOnnxDetector:
    """Detector YOLOX en ONNX Runtime. Thread-safe para inferencia concurrente."""

    def __init__(
        self,
        model_path: Path,
        *,
        name: str,
        version: str,
        intra_op_threads: int = 0,
        providers: list[str] | None = None,
    ) -> None:
        import onnxruntime as ort  # importación diferida: el servicio arranca sin el modelo

        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        if intra_op_threads > 0:
            options.intra_op_num_threads = intra_op_threads
        available = ort.get_available_providers()
        chosen = [
            p
            for p in (providers or ["CUDAExecutionProvider", "CPUExecutionProvider"])
            if p in available
        ]
        self._session = ort.InferenceSession(str(model_path), options, providers=chosen)
        model_input = self._session.get_inputs()[0]
        self._input_name = model_input.name
        self.input_size: tuple[int, int] = (int(model_input.shape[2]), int(model_input.shape[3]))
        self.name = name
        self.version = version
        self.execution_provider = self._session.get_providers()[0]

    def _infer(
        self,
        image_bgr: np.ndarray,
        score_threshold: float,
        class_ids: frozenset[int] | None,
        nms_iou: float = 0.45,
    ) -> list[Detection]:
        tensor, ratio = letterbox(image_bgr, self.input_size)
        raw = self._session.run(None, {self._input_name: tensor})[0]
        predictions = decode_outputs(raw, self.input_size)[0]
        class_scores = predictions[:, 4:5] * predictions[:, 5:]
        class_id = class_scores.argmax(axis=1)
        score = class_scores[np.arange(len(class_scores)), class_id]
        keep = score >= score_threshold
        if class_ids is not None:
            keep &= np.isin(class_id, list(class_ids))
        boxes = predictions[keep, :4]
        xyxy = (
            np.stack(
                [
                    boxes[:, 0] - boxes[:, 2] / 2,
                    boxes[:, 1] - boxes[:, 3] / 2,
                    boxes[:, 0] + boxes[:, 2] / 2,
                    boxes[:, 1] + boxes[:, 3] / 2,
                ],
                axis=1,
            )
            / ratio
        )
        h, w = image_bgr.shape[:2]
        xyxy[:, [0, 2]] = xyxy[:, [0, 2]].clip(0, w)
        xyxy[:, [1, 3]] = xyxy[:, [1, 3]].clip(0, h)
        scores = score[keep]
        classes = class_id[keep]
        if len(xyxy) == 0:
            return []
        # NMS agnóstica de clase por pasada (antes de fusionar mosaicos).
        xywh = np.column_stack(
            [xyxy[:, 0], xyxy[:, 1], xyxy[:, 2] - xyxy[:, 0], xyxy[:, 3] - xyxy[:, 1]]
        )
        kept = cv2.dnn.NMSBoxes(xywh.tolist(), scores.tolist(), score_threshold, nms_iou)
        return [
            Detection(float(b[0]), float(b[1]), float(b[2]), float(b[3]), float(sc), int(c))
            for b, sc, c in zip(xyxy[kept], scores[kept], classes[kept], strict=True)
            if b[2] - b[0] >= 2 and b[3] - b[1] >= 2
        ]

    def detect(
        self,
        image_bgr: np.ndarray,
        *,
        score_threshold: float = 0.3,
        nms_iou: float = 0.45,
        class_ids: frozenset[int] | None = None,
        tiling: TilingParams | None = None,
    ) -> tuple[list[Detection], int]:
        """Devuelve las detecciones fusionadas y la cantidad de pasadas de inferencia."""
        tiling = tiling or TilingParams()
        h, w = image_bgr.shape[:2]
        candidates = self._infer(image_bgr, score_threshold, class_ids, nms_iou)
        passes = 1
        if tiling.applies_to((h, w)):
            # Con mosaico, la pasada global sólo aporta animales grandes (que un mosaico podría
            # cortar); los pequeños, vistos a resolución reducida, se toman de los mosaicos.
            candidates = [d for d in candidates if max(d.width, d.height) >= 0.5 * tiling.tile_size]
            for y in tile_origins(h, tiling.tile_size, tiling.overlap):
                for x in tile_origins(w, tiling.tile_size, tiling.overlap):
                    tile = image_bgr[y : y + tiling.tile_size, x : x + tiling.tile_size]
                    passes += 1
                    for d in self._infer(tile, score_threshold, class_ids, nms_iou):
                        candidates.append(
                            Detection(d.x1 + x, d.y1 + y, d.x2 + x, d.y2 + y, d.score, d.class_id)
                        )
        return merge_detections(candidates, iou_threshold=nms_iou), passes
