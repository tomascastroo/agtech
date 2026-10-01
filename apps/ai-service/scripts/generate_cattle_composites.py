"""Escenas de demostración de rodeo: composición SINTÉTICA con recortes de bovinos REALES.

No existen datos públicos de las cámaras de un establecimiento con 1.500 cabezas, por lo que la
demo de La Esperanza usa composiciones: recortes de bovinos de fotografías reales de Open Images
V7 (CC BY 2.0, autores en el manifiesto), segmentados con GrabCut y pegados con borde suave sobre
una pastura procedural, con escala según la profundidad. Cada escena registra su verdad de campo
(cajas de cada animal pegado), y el conteo lo produce el detector real (YOLOX) en la verificación.

Además se evalúa el detector sobre las escenas (conteo denso con verdad de campo exacta) y el
resultado se guarda en benchmarks/cattle-composites.json.

Uso: uv run python scripts/generate_cattle_composites.py
"""

from __future__ import annotations

import csv
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from benchmark_cattle import CACHE, CATTLE_LABELS, match  # noqa: E402

from agro_vision.domain.detection import TilingParams, YoloxOnnxDetector  # noqa: E402
from agro_vision.domain.livestock import count_livestock  # noqa: E402

OUT = ROOT.parents[1] / "infra" / "seed-assets" / "cameras"
BENCH = ROOT / "benchmarks"
SEED = 20260924
WIDTH, HEIGHT = 2400, 1500
# Seis cámaras de La Esperanza; la suma (1.490) es la verdad de campo del rodeo simulado.
SCENES = (
    ("CAM-LE-01", "Aguada Norte", 252),
    ("CAM-LE-02", "Aguada Sur", 247),
    ("CAM-LE-03", "Manga y corrales", 250),
    ("CAM-LE-04", "Potrero 7", 244),
    ("CAM-LE-05", "Potrero 4", 249),
    ("CAM-LE-06", "Bajo del arroyo", 248),
)
# El Trébol (820 declaradas) con cuatro cámaras.
EXTRA = (
    ("CAM-ET-01", "Aguada Este", 205),
    ("CAM-ET-02", "Potrero 2", 198),
    ("CAM-ET-03", "Potrero 5", 210),
    ("CAM-ET-04", "Corral de encierre", 199),
)


@dataclass
class Crop:
    image_id: str
    rgba: np.ndarray
    author: str
    license: str


def load_crops(limit: int = 420) -> list[Crop]:
    meta: dict[str, dict[str, str]] = {}
    for split in ("validation", "test"):
        with (CACHE / f"{split}-images-with-rotation.csv").open() as fh:
            for row in csv.DictReader(fh):
                meta[row["ImageID"]] = row
    crops: list[Crop] = []
    for split in ("validation", "test"):
        with (CACHE / f"{split}-annotations-bbox.csv").open() as fh:
            for row in csv.DictReader(fh):
                if row["LabelName"] not in CATTLE_LABELS:
                    continue
                if "1" in (
                    row["IsOccluded"],
                    row["IsTruncated"],
                    row["IsGroupOf"],
                    row["IsDepiction"],
                ):
                    continue
                path = CACHE / "images" / f"{row['ImageID']}.jpg"
                if not path.exists():
                    continue
                image = cv2.imread(str(path))
                h, w = image.shape[:2]
                x1, y1 = int(float(row["XMin"]) * w), int(float(row["YMin"]) * h)
                x2, y2 = int(float(row["XMax"]) * w), int(float(row["YMax"]) * h)
                if min(x2 - x1, y2 - y1) < 80:
                    continue
                rgba = segment(image, (x1, y1, x2, y2))
                if rgba is not None:
                    info = meta.get(row["ImageID"], {})
                    crops.append(
                        Crop(row["ImageID"], rgba, info.get("Author", ""), info.get("License", ""))
                    )
                if len(crops) >= limit:
                    return crops
    return crops


def segment(image: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray | None:
    """Recorta el animal con GrabCut inicializado en la caja y suaviza el borde."""
    x1, y1, x2, y2 = box
    pad = int(0.08 * max(x2 - x1, y2 - y1))
    h, w = image.shape[:2]
    cx1, cy1, cx2, cy2 = max(0, x1 - pad), max(0, y1 - pad), min(w, x2 + pad), min(h, y2 + pad)
    patch = image[cy1:cy2, cx1:cx2]
    scale = 220 / max(patch.shape[:2])
    if scale < 1:
        patch = cv2.resize(patch, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    else:
        scale = 1.0
    rect = (
        int((x1 - cx1) * scale),
        int((y1 - cy1) * scale),
        max(2, int((x2 - x1) * scale)),
        max(2, int((y2 - y1) * scale)),
    )
    mask = np.zeros(patch.shape[:2], np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(patch, mask, rect, bgd, fgd, 4, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None
    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    if alpha.mean() < 255 * 0.15:
        return None
    alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (5, 5), 0)
    ys, xs = np.nonzero(alpha > 20)
    rgba = np.dstack([patch, alpha])[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    return rgba


def pasture(rng: np.random.Generator) -> np.ndarray:
    """Pastura procedural: ruido multiescala con tonos de pasto y parches de suelo."""
    field = np.zeros((HEIGHT, WIDTH), np.float32)
    for scale, weight in ((8, 0.5), (32, 0.3), (128, 0.2)):
        noise = rng.random((HEIGHT // scale + 2, WIDTH // scale + 2)).astype(np.float32)
        field += weight * cv2.resize(noise, (WIDTH, HEIGHT), interpolation=cv2.INTER_CUBIC)
    grass = np.array([60, 125, 95], np.float32)  # BGR
    dry = np.array([95, 150, 160], np.float32)
    mix = np.clip(field[..., None] * 1.2 - 0.1, 0, 1)
    image = grass * (1 - mix) + dry * mix
    image += rng.normal(0, 7, image.shape).astype(np.float32)
    return np.clip(image, 0, 255).astype(np.uint8)


def compose(
    count: int, crops: list[Crop], rng: np.random.Generator
) -> tuple[np.ndarray, list, set]:
    image = pasture(rng)
    boxes: list[tuple[int, int, int, int]] = []
    used: set[str] = set()
    attempts = 0
    while len(boxes) < count and attempts < count * 60:
        attempts += 1
        crop = crops[int(rng.integers(len(crops)))]
        y = int(rng.uniform(40, HEIGHT - 60))
        depth = 0.55 + 0.6 * (y / HEIGHT)  # más grandes hacia abajo (perspectiva)
        target_h = int(rng.uniform(70, 95) * depth)
        rgba = crop.rgba
        scale = target_h / rgba.shape[0]
        rgba = cv2.resize(rgba, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        if rng.random() < 0.5:
            rgba = rgba[:, ::-1]
        h, w = rgba.shape[:2]
        x = int(rng.uniform(0, WIDTH - w))
        y = min(y, HEIGHT - h)
        box = (x, y, x + w, y + h)
        if any(_iou(box, b) > 0.05 for b in boxes):
            continue
        alpha = rgba[..., 3:4].astype(np.float32) / 255
        region = image[y : y + h, x : x + w].astype(np.float32)
        image[y : y + h, x : x + w] = (rgba[..., :3] * alpha + region * (1 - alpha)).astype(
            np.uint8
        )
        boxes.append(box)
        used.add(crop.image_id)
    if len(boxes) < count:
        raise RuntimeError("No hay espacio para ubicar todos los animales")
    return image, boxes, used


def _iou(a: tuple[int, ...], b: tuple[int, ...]) -> float:
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union else 0.0


def main() -> None:
    rng = np.random.default_rng(SEED)
    crops = load_crops()
    print(f"recortes reales: {len(crops)}")
    detector = YoloxOnnxDetector(
        ROOT / "models" / "yolox_s.onnx", name="yolox_s", version="0.1.1rc0"
    )
    tiling = TilingParams(tile_size=640, overlap=0.2, min_ratio=2.5)
    manifest, evaluation = [], []
    for serial, label, count in SCENES + EXTRA:
        image, boxes, used = compose(count, crops, rng)
        cv2.imwrite(str(OUT / f"{serial}.jpg"), image, [cv2.IMWRITE_JPEG_QUALITY, 88])
        started = time.perf_counter()
        result = count_livestock(
            detector,
            image,
            score_threshold=0.12,
            tiled_score_threshold=0.4,
            class_set="livestock",
            tiling=tiling,
        )
        elapsed = (time.perf_counter() - started) * 1000
        tp = match(result.detections, np.array(boxes, dtype=np.float32))
        evaluation.append(
            {
                "serial": serial,
                "ground_truth": count,
                "detected": result.count,
                "abs_error": abs(result.count - count),
                "precision": round(tp / max(result.count, 1), 4),
                "recall": round(tp / count, 4),
                "confidence": result.confidence,
                "inference_passes": result.inference_passes,
                "processing_ms": round(elapsed),
            }
        )
        manifest.append(
            {
                "serial": serial,
                "label": label,
                "ground_truth": count,
                "model_count": result.count,
                "model_confidence": result.confidence,
                "model": "yolox-s-coco 0.1.1rc0-onnx",
                "score_threshold": result.score_threshold,
                "synthetic_composite": True,
                "source_images": sorted(used),
                "boxes": boxes,
                "detections": [
                    [round(d.x1), round(d.y1), round(d.x2), round(d.y2), round(d.score, 3)]
                    for d in result.detections
                ],
            }
        )
        print(f"{serial}: verdad {count} · detectados {result.count} · {elapsed:.0f} ms")
    attributions = {c.image_id: {"author": c.author, "license": c.license} for c in crops}
    (OUT / "composites.json").write_text(
        json.dumps(
            {
                "description": (
                    "Composición sintética: recortes de bovinos de fotografías reales de "
                    "Open Images V7 pegados sobre pastura procedural. Verdad de campo por "
                    "escena en 'ground_truth'."
                ),
                "seed": SEED,
                "scenes": manifest,
                "attributions": {k: attributions[k] for s in manifest for k in s["source_images"]},
            },
            ensure_ascii=False,
        )
    )
    total_truth = sum(e["ground_truth"] for e in evaluation)
    total_detected = sum(e["detected"] for e in evaluation)
    (BENCH / "cattle-composites.json").write_text(
        json.dumps(
            {
                "dataset": "Composiciones sintéticas densas (recortes reales de Open Images V7)",
                "model": "yolox_s, clases livestock, umbral 0.40 con mosaico 640 (solape 0.2)",
                "threshold_calibration": (
                    "umbral elegido en las escenas CAM-ET (El Trébol); CAM-LE se reporta"
                ),
                "scenes": evaluation,
                "total_ground_truth": total_truth,
                "total_detected": total_detected,
                "total_relative_error": round((total_detected - total_truth) / total_truth, 4),
                "mae": round(sum(e["abs_error"] for e in evaluation) / len(evaluation), 2),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    print(f"total: verdad {total_truth} · detectados {total_detected}")
    update_manifest()


def update_manifest() -> None:
    """Actualiza las cámaras del manifiesto del seed con las composiciones y su conteo real."""
    from agro_vision.domain.image_quality import assess_quality

    composites = json.loads((OUT / "composites.json").read_text())
    manifest_path = OUT.parent / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    cameras = []
    for scene in composites["scenes"]:
        quality = assess_quality(cv2.imread(str(OUT / f"{scene['serial']}.jpg")))
        cameras.append(
            {
                "serial": scene["serial"],
                "label": scene["label"],
                "file": f"cameras/{scene['serial']}.jpg",
                "ground_truth_animals": scene["ground_truth"],
                "measured_count": scene["model_count"],
                "confidence": scene["model_confidence"],
                "model": scene["model"],
                "score_threshold": scene.get("score_threshold"),
                "detections": scene.get("detections", []),
                "synthetic_composite": True,
                "quality": {
                    "width": quality.width,
                    "height": quality.height,
                    "sharpness": quality.sharpness,
                    "brightness": quality.brightness,
                    "contrast": quality.contrast,
                    "dhash": quality.dhash,
                    "score": quality.quality_score,
                    "issues": quality.issues,
                },
            }
        )
    manifest["cameras"] = cameras
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    if "--manifest-only" in sys.argv:
        update_manifest()
    else:
        main()
