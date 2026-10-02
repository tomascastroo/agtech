"""Video SINTÉTICO de paso por manga para probar el conteo en video.

No hay videos públicos de mangas/tranqueras argentinas con conteo de referencia, por lo que este
script compone uno: recortes de bovinos de fotografías REALES de Open Images V7 (CC BY 2.0,
autores en el manifiesto), segmentados con GrabCut como en generate_cattle_composites.py, que
cruzan el cuadro de izquierda a derecha sobre una pastura procedural. La verdad de campo (cantidad
de animales que pasan) queda en el manifiesto. Sirve para validar el pipeline (decodificación →
YOLOX por cuadro → seguimiento → cruce de línea), NO para medir precisión en campo.

Requiere el caché de Open Images (scripts/benchmark_cattle.py) y ffmpeg con libx264.

Uso: uv run python scripts/generate_passage_video.py
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

OUT_DIR = ROOT.parents[1] / "infra" / "seed-assets" / "videos"
NAME = "paso-manga-sintetico"
SEED = 20261002
WIDTH, HEIGHT, FPS = 960, 540, 12
ANIMALS = 14
SPACING_FRAMES = 9  # separación de ingreso entre animales


def main() -> None:
    rng = np.random.default_rng(SEED)
    crops = load_crops(limit=60)
    background = cv2.resize(pasture(rng), (WIDTH, HEIGHT), interpolation=cv2.INTER_AREA)
    # Pasillo de la manga: franja más seca y dos líneas de alambrado.
    lane_top, lane_bottom = int(HEIGHT * 0.3), int(HEIGHT * 0.85)
    background[lane_top:lane_bottom] = (
        background[lane_top:lane_bottom].astype(np.float32) * 0.8 + np.array([40, 60, 80]) * 0.2
    ).astype(np.uint8)
    for y in (lane_top, lane_bottom):
        cv2.line(background, (0, y), (WIDTH, y), (70, 70, 70), 3)

    animals = []
    for i in range(ANIMALS):
        crop = crops[int(rng.integers(len(crops)))]
        target_h = int(rng.uniform(150, 190))
        rgba = cv2.resize(
            crop.rgba, None, fx=target_h / crop.rgba.shape[0], fy=target_h / crop.rgba.shape[0]
        )
        if rgba.shape[1] > 300:
            rgba = cv2.resize(rgba, None, fx=300 / rgba.shape[1], fy=300 / rgba.shape[1])
        animals.append(
            {
                "rgba": rgba,
                "start": i * SPACING_FRAMES,
                "speed": float(rng.uniform(24, 32)),  # px por cuadro (~2,3 m/s a esta escala)
                "y": int(rng.uniform(lane_top + 5, lane_bottom - rgba.shape[0] - 5)),
                "source": crop.image_id,
                "author": crop.author,
                "license": crop.license,
            }
        )

    total_frames = max(a["start"] for a in animals) + int((WIDTH + 320) / 24) + 2
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
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "26",
            "-movflags", "+faststart", str(target),
        ],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    assert ffmpeg.stdin
    for frame_index in range(total_frames):
        frame = background.copy()
        for a in animals:
            t = frame_index - a["start"]
            if t < 0:
                continue
            rgba = a["rgba"]
            h, w = rgba.shape[:2]
            x = int(-w + t * a["speed"])
            if x >= WIDTH:
                continue
            x0, x1 = max(0, x), min(WIDTH, x + w)
            if x1 <= x0:
                continue
            y = a["y"]
            part = rgba[:, x0 - x : x1 - x]
            alpha = part[..., 3:4].astype(np.float32) / 255
            region = frame[y : y + h, x0:x1].astype(np.float32)
            frame[y : y + h, x0:x1] = (part[..., :3] * alpha + region * (1 - alpha)).astype(
                np.uint8
            )
        ffmpeg.stdin.write(frame.tobytes())
    ffmpeg.stdin.close()
    if ffmpeg.wait() != 0:
        raise RuntimeError("ffmpeg falló")

    manifest = {
        "description": (
            "Video SINTÉTICO de paso por manga: recortes de bovinos de fotografías reales de "
            "Open Images V7 que cruzan el cuadro de izquierda a derecha sobre pastura procedural. "
            "Sirve para probar el pipeline de conteo en video; no mide precisión en campo."
        ),
        "file": target.name,
        "seed": SEED,
        "width": WIDTH,
        "height": HEIGHT,
        "fps": FPS,
        "frames": total_frames,
        "ground_truth_passing": ANIMALS,
        "synthetic": True,
        "attribution": sorted(
            {(a["source"], a["author"], a["license"]) for a in animals},
        ),
    }
    (OUT_DIR / f"{NAME}.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print(f"{target} ({target.stat().st_size // 1024} KB, {total_frames} cuadros)")


if __name__ == "__main__":
    main()
