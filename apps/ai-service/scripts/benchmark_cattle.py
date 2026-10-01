"""Benchmark de detección y conteo de bovinos sobre fotografías reales (Open Images V7).

Datos: imágenes de las particiones validation y test de Open Images V7 con la etiqueta
"Cattle" (/m/01xq0k1) o "Bull" (/m/0cnyhnx), anotaciones de cajas CC BY 4.0 (Google) e
imágenes CC BY 2.0 (autores en Flickr; se registran en el manifiesto). Se excluyen las
imágenes con cajas "group-of", donde el conteo exacto no está anotado.

Protocolo: el umbral de confianza se elige en validation (mínimo error absoluto medio de
conteo) y las métricas se reportan sobre test con ese umbral fijo.

Uso:
    uv run python scripts/benchmark_cattle.py --models yolox_tiny yolox_s yolox_m
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from agro_vision.domain.detection import (  # noqa: E402
    Detection,
    TilingParams,
    YoloxOnnxDetector,
    box_iou_matrix,
)
from agro_vision.domain.livestock import LIVESTOCK_CLASS_SETS  # noqa: E402

CACHE = ROOT / ".cache" / "openimages"
MODELS = ROOT / ".cache" / "models"
OUT = ROOT / "benchmarks"
CATTLE_LABELS = {"/m/01xq0k1", "/m/0cnyhnx"}
BASE = "https://storage.googleapis.com/openimages"
FILES = {
    "validation-annotations-bbox.csv": f"{BASE}/v5/validation-annotations-bbox.csv",
    "test-annotations-bbox.csv": f"{BASE}/v5/test-annotations-bbox.csv",
    "validation-images-with-rotation.csv": (
        f"{BASE}/2018_04/validation/validation-images-with-rotation.csv"
    ),
    "test-images-with-rotation.csv": f"{BASE}/2018_04/test/test-images-with-rotation.csv",
}
THRESHOLDS = (0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5)


@dataclass
class Sample:
    image_id: str
    split: str
    boxes: list[tuple[float, float, float, float]]  # normalizadas xyxy
    meta: dict[str, str]

    @property
    def path(self) -> Path:
        return CACHE / "images" / f"{self.image_id}.jpg"


def fetch(url: str, target: Path) -> None:
    if target.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".part")
    # URLs fijas https de Open Images (GCS/S3).
    with urllib.request.urlopen(url, timeout=120) as response, tmp.open("wb") as fh:  # noqa: S310
        fh.write(response.read())
    tmp.rename(target)


def load_samples() -> list[Sample]:
    for name, url in FILES.items():
        fetch(url, CACHE / name)
    samples: list[Sample] = []
    for split in ("validation", "test"):
        by_image: dict[str, list[dict[str, str]]] = {}
        with (CACHE / f"{split}-annotations-bbox.csv").open() as fh:
            for row in csv.DictReader(fh):
                if row["LabelName"] in CATTLE_LABELS:
                    by_image.setdefault(row["ImageID"], []).append(row)
        clean = {k: v for k, v in by_image.items() if all(r["IsGroupOf"] == "0" for r in v)}
        meta: dict[str, dict[str, str]] = {}
        with (CACHE / f"{split}-images-with-rotation.csv").open() as fh:
            for row in csv.DictReader(fh):
                if row["ImageID"] in clean:
                    meta[row["ImageID"]] = row
        for image_id, rows in sorted(clean.items()):
            info = meta.get(image_id, {})
            if info.get("Rotation") not in (None, "", "0.0", "0"):
                continue  # evita imágenes cuya orientación requiere rotación
            samples.append(
                Sample(
                    image_id=image_id,
                    split=split,
                    boxes=[
                        (float(r["XMin"]), float(r["YMin"]), float(r["XMax"]), float(r["YMax"]))
                        for r in rows
                    ],
                    meta=info,
                )
            )
    return samples


def download_images(samples: list[Sample]) -> list[Sample]:
    def task(sample: Sample) -> Sample | None:
        url = f"https://s3.amazonaws.com/open-images-dataset/{sample.split}/{sample.image_id}.jpg"
        try:
            fetch(url, sample.path)
            return sample
        except Exception as exc:  # noqa: BLE001 - se informa y se excluye la imagen
            print(f"  sin descarga {sample.image_id}: {exc}", file=sys.stderr)
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        return [s for s in pool.map(task, samples) if s is not None]


def match(pred: list[Detection], truth: np.ndarray, iou_threshold: float = 0.5) -> int:
    """Verdaderos positivos con asignación greedy por score (criterio PASCAL VOC)."""
    if not pred or len(truth) == 0:
        return 0
    boxes = np.array([[d.x1, d.y1, d.x2, d.y2] for d in sorted(pred, key=lambda d: -d.score)])
    iou, _ = box_iou_matrix(boxes, truth)
    used = np.zeros(len(truth), dtype=bool)
    tp = 0
    for row in iou:
        candidates = np.where(~used & (row >= iou_threshold))[0]
        if len(candidates):
            used[candidates[row[candidates].argmax()]] = True
            tp += 1
    return tp


def evaluate(results: list[dict], threshold: float) -> dict[str, float]:
    errors, abs_errors, tp, fp, fn, total_true, total_pred = [], [], 0, 0, 0, 0, 0
    for r in results:
        kept = [d for d in r["detections"] if d.score >= threshold]
        truth = r["truth"]
        t = match(kept, truth)
        tp += t
        fp += len(kept) - t
        fn += len(truth) - t
        total_true += len(truth)
        total_pred += len(kept)
        errors.append(len(kept) - len(truth))
        abs_errors.append(abs(len(kept) - len(truth)))
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    herd = [
        abs(e) / len(r["truth"])
        for e, r in zip(errors, results, strict=True)
        if len(r["truth"]) >= 5
    ]
    return {
        "images": len(results),
        "animals": total_true,
        "detected": total_pred,
        "mae": round(statistics.fmean(abs_errors), 3),
        "mean_error": round(statistics.fmean(errors), 3),
        "total_relative_error": round((total_pred - total_true) / max(total_true, 1), 4),
        "herd_images": len(herd),
        "herd_mean_relative_error": round(statistics.fmean(herd), 4) if herd else None,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(2 * precision * recall / max(precision + recall, 1e-9), 4),
    }


def run_model(model: str, samples: list[Sample], class_ids: frozenset[int], tile_size: int) -> dict:
    detector = YoloxOnnxDetector(MODELS / f"{model}.onnx", name=model, version="0.1.1rc0")
    per_split: dict[str, list[dict]] = {"validation": [], "test": []}
    timings = []
    for sample in samples:
        image = cv2.imread(str(sample.path), cv2.IMREAD_COLOR)
        if image is None:
            continue
        h, w = image.shape[:2]
        started = time.perf_counter()
        detections, _ = detector.detect(
            image,
            score_threshold=min(THRESHOLDS),
            class_ids=class_ids,
            tiling=TilingParams(tile_size=tile_size),
        )
        timings.append((time.perf_counter() - started) * 1000)
        truth = np.array([[b[0] * w, b[1] * h, b[2] * w, b[3] * h] for b in sample.boxes])
        per_split[sample.split].append(
            {"id": sample.image_id, "detections": detections, "truth": truth}
        )
    sweep = {f"{t:.2f}": evaluate(per_split["validation"], t) for t in THRESHOLDS}
    best = min(THRESHOLDS, key=lambda t: (sweep[f"{t:.2f}"]["mae"], -sweep[f"{t:.2f}"]["f1"]))
    test = evaluate(per_split["test"], best)
    return {
        "model": model,
        "input_size": list(detector.input_size),
        "execution_provider": detector.execution_provider,
        "selected_threshold": best,
        "validation_sweep": sweep,
        "test": test,
        "latency_ms": {
            "mean": round(statistics.fmean(timings), 1),
            "p50": round(statistics.median(timings), 1),
            "p95": round(sorted(timings)[int(len(timings) * 0.95) - 1], 1),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=["yolox_tiny", "yolox_s", "yolox_m"])
    parser.add_argument("--class-sets", nargs="+", default=["cow", "livestock"])
    parser.add_argument("--tile-sizes", nargs="+", type=int, default=[0, 640])
    parser.add_argument("--output", default="cattle-openimages.json")
    args = parser.parse_args()

    samples = download_images(load_samples())
    print(f"imágenes: {len(samples)} · animales: {sum(len(s.boxes) for s in samples)}")
    OUT.mkdir(exist_ok=True)
    with (OUT / "openimages-cattle-manifest.csv").open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            ["image_id", "split", "animals", "license", "author", "original_url", "landing_url"]
        )
        for s in samples:
            writer.writerow([
                s.image_id, s.split, len(s.boxes),
                s.meta.get("License", ""), s.meta.get("Author", ""),
                s.meta.get("OriginalURL", ""), s.meta.get("OriginalLandingURL", ""),
            ])  # fmt: skip

    report = {
        "dataset": (
            "Open Images V7 (validation para calibrar, test para reportar), "
            "etiquetas Cattle/Bull, sin group-of"
        ),
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "iou_threshold": 0.5,
        "runs": [],
    }
    for model in args.models:
        for class_set in args.class_sets:
            for tile_size in args.tile_sizes:
                print(f"→ {model} / {class_set} / mosaico {tile_size or 'no'}")
                run = run_model(model, samples, LIVESTOCK_CLASS_SETS[class_set], tile_size)
                run["class_set"] = class_set
                run["tile_size"] = tile_size
                report["runs"].append(run)
                t = run["test"]
                print(
                    f"   umbral {run['selected_threshold']} · MAE {t['mae']} · "
                    f"P {t['precision']} · "
                    f"R {t['recall']} · error total {t['total_relative_error']:+.1%} · "
                    f"{run['latency_ms']['mean']} ms"
                )
    (OUT / args.output).write_text(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
