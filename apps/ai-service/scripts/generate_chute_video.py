"""Video SINTÉTICO de manga individual para probar Manga + RFID (E2E con cámara falsa).

Compone un video con recortes de bovinos de fotografías REALES de Open Images V7 (CC BY 2.0,
autores en el manifiesto), segmentados como en generate_cattle_composites.py: UN bovino por vez
entra a la manga, queda quieto unos segundos frente a la cámara y sale; después el siguiente.
Sirve para validar el flujo (detección → seguimiento → estado "esperando RFID" → asociación), NO
para medir precisión en campo. No hay identidad visual: cada animal es solo "un bovino".

Solo usa recortes que YOLOX detecta con confianza tanto en el servidor (YOLOX-S) como en el
celular (YOLOX-Nano): el video prueba el flujo, no la capacidad de detección.

Requiere el caché de Open Images (scripts/benchmark_cattle.py), los pesos ONNX de YOLOX-S
(.cache/models) y YOLOX-Nano (apps/web/public/models) y ffmpeg con libx264.

Uso: uv run python scripts/generate_chute_video.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_cattle_composites import load_crops, pasture  # noqa: E402

from agro_vision.domain.detection import TilingParams, YoloxOnnxDetector  # noqa: E402
from agro_vision.domain.livestock import LIVESTOCK_CLASS_SETS  # noqa: E402

OUT_DIR = ROOT.parents[1] / "infra" / "seed-assets" / "videos"
NAME = "manga-individual-sintetico"
SEED = 20261003
WIDTH, HEIGHT, FPS = 640, 480, 12
ANIMALS = 4
ENTER_S, STILL_S, EXIT_S, GAP_S = 1.5, 9.0, 1.5, 1.5
MIN_SCORE = 0.6
DETECTORS = {
    "yolox_s": ROOT / ".cache" / "models" / "yolox_s.onnx",
    "yolox_nano": ROOT.parents[1] / "apps" / "web" / "public" / "models" / "yolox_nano.onnx",
}


def place(background: np.ndarray, rgba: np.ndarray, x: int) -> np.ndarray:
    frame = background.copy()
    h, w = rgba.shape[:2]
    y = (HEIGHT - h) // 2 + int(HEIGHT * 0.03)
    x0, x1 = max(0, x), min(WIDTH, x + w)
    if x1 > x0:
        part = rgba[:, x0 - x : x1 - x]
        alpha = part[..., 3:4].astype(np.float32) / 255
        region = frame[y : y + h, x0:x1].astype(np.float32)
        frame[y : y + h, x0:x1] = (part[..., :3] * alpha + region * (1 - alpha)).astype(np.uint8)
    return frame


def resize_for_chute(rgba: np.ndarray, target_w: int) -> np.ndarray:
    scale = target_w / rgba.shape[1]
    rgba = cv2.resize(rgba, None, fx=scale, fy=scale)
    if rgba.shape[0] > int(HEIGHT * 0.7):
        s = int(HEIGHT * 0.7) / rgba.shape[0]
        rgba = cv2.resize(rgba, None, fx=s, fy=s)
    return rgba


def main() -> None:
    rng = np.random.default_rng(SEED)
    crops = load_crops(limit=60)
    background = cv2.resize(pasture(rng), (WIDTH, HEIGHT), interpolation=cv2.INTER_AREA)
    # Manga: dos tablas horizontales arriba y abajo.
    for y in (int(HEIGHT * 0.12), int(HEIGHT * 0.9)):
        cv2.rectangle(background, (0, y - 6), (WIDTH, y + 6), (60, 80, 100), -1)

    detectors = [
        YoloxOnnxDetector(path, name=name, version="selection") for name, path in DETECTORS.items()
    ]
    classes = LIVESTOCK_CLASS_SETS["livestock"]

    def detected(frame: np.ndarray) -> bool:
        for detector in detectors:
            found, _ = detector.detect(
                frame, score_threshold=0.3, class_ids=classes, tiling=TilingParams(tile_size=0)
            )
            if len(found) != 1 or found[0].score < MIN_SCORE:
                return False
        return True

    animals = []
    for i in rng.permutation(len(crops)):
        crop = crops[int(i)]
        rgba = resize_for_chute(crop.rgba, int(rng.uniform(300, 360)))
        if not detected(place(background, rgba, (WIDTH - rgba.shape[1]) // 2)):
            continue
        animals.append(
            {
                "rgba": rgba,
                "source": crop.image_id,
                "author": crop.author,
                "license": crop.license,
            }
        )
        if len(animals) == ANIMALS:
            break
    if len(animals) < ANIMALS:
        raise RuntimeError("No hay suficientes recortes detectados con confianza")

    per_animal = ENTER_S + STILL_S + EXIT_S + GAP_S
    total_frames = int(round(ANIMALS * per_animal * FPS)) + FPS
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / f"{NAME}.mp4"
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("Se requiere ffmpeg con libx264")
    # Argumentos fijos definidos en este script (sin entrada externa).
    ffmpeg = subprocess.Popen(  # noqa: S603
        [
            ffmpeg_bin, "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS),
            "-i", "-",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "24",
            "-movflags", "+faststart", str(target),
        ],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    assert ffmpeg.stdin
    still_windows = []
    for frame_index in range(total_frames):
        t = frame_index / FPS
        k = int(t // per_animal)
        x = WIDTH
        rgba = animals[min(k, ANIMALS - 1)]["rgba"]
        if k < ANIMALS:
            w = rgba.shape[1]
            local = t - k * per_animal
            center_x = (WIDTH - w) // 2
            if local < ENTER_S:
                x = int(-w + (center_x + w) * local / ENTER_S)
            elif local < ENTER_S + STILL_S:
                # Quieto con un leve balanceo (respiración / cabeza), como en la manga real.
                x = center_x + int(3 * np.sin(local * 2.0))
            elif local < ENTER_S + STILL_S + EXIT_S:
                x = int(center_x + (WIDTH - center_x) * (local - ENTER_S - STILL_S) / EXIT_S)
        frame = place(background, rgba, x)
        ffmpeg.stdin.write(frame.tobytes())
    for k in range(ANIMALS):
        start = k * per_animal + ENTER_S
        still_windows.append([round(start, 2), round(start + STILL_S, 2)])
    ffmpeg.stdin.close()
    if ffmpeg.wait() != 0:
        raise RuntimeError("ffmpeg falló")

    manifest = {
        "description": (
            "Video SINTÉTICO de manga individual: recortes de bovinos de fotografías reales de "
            "Open Images V7; un bovino por vez entra, queda quieto y sale. Sirve para probar el "
            "flujo Manga + RFID con cámara falsa; no mide precisión en campo."
        ),
        "file": target.name,
        "seed": SEED,
        "width": WIDTH,
        "height": HEIGHT,
        "fps": FPS,
        "frames": total_frames,
        "animals": ANIMALS,
        "still_windows_s": still_windows,
        "synthetic": True,
        "attribution": sorted({(a["source"], a["author"], a["license"]) for a in animals}),
    }
    (OUT_DIR / f"{NAME}.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print(f"{target} ({target.stat().st_size // 1024} KB, {total_frames} cuadros)")


if __name__ == "__main__":
    main()
