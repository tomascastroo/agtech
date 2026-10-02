"""Videos SINTÉTICOS de barrido (escáner móvil) para probar el conteo neto del servidor.

Panorama de pastura procedural con bovinos quietos (recortes de fotografías REALES de Open
Images V7, CC BY 2.0, como en generate_cattle_composites.py) y una cámara que gira desde un
punto (traslación horizontal del cuadro, con temblor de mano). Dos variantes:
  - barrido-sintetico: un solo barrido de izquierda a derecha.
  - barrido-ida-vuelta-sintetico: avanza, retrocede sobre una zona ya escaneada y termina; el
    conteo NETO debe descontar los cruces de la vuelta atrás.
Verdad de campo (animales en el arco barrido) en el manifiesto. Prueba el pipeline; no mide
precisión en campo.

Uso: uv run python scripts/generate_sweep_video.py
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
SEED = 20261003
W, H, FPS = 960, 540, 12
PANO_W = 3600
ANIMALS = 12
PAN_PX_PER_FRAME = 16


def build_panorama(rng: np.random.Generator) -> tuple[np.ndarray, list[tuple[int, int, int, int]]]:
    tiles = [cv2.resize(pasture(rng), (1200, H), interpolation=cv2.INTER_AREA) for _ in range(3)]
    pano = np.concatenate(tiles, axis=1)
    pano = cv2.GaussianBlur(pano, (3, 3), 0)
    crops = load_crops(limit=60)
    boxes: list[tuple[int, int, int, int]] = []
    xs = np.linspace(W // 2 + 160, PANO_W - W // 2 - 160, ANIMALS).astype(int)
    for x in xs:
        crop = crops[int(rng.integers(len(crops)))]
        h = int(rng.uniform(130, 170))
        rgba = cv2.resize(crop.rgba, None, fx=h / crop.rgba.shape[0], fy=h / crop.rgba.shape[0])
        if rgba.shape[1] > 240:
            rgba = cv2.resize(rgba, None, fx=240 / rgba.shape[1], fy=240 / rgba.shape[1])
        ch, cw = rgba.shape[:2]
        x0 = int(x + rng.integers(-40, 40)) - cw // 2
        y0 = int(rng.uniform(150, H - ch - 60))
        alpha = rgba[..., 3:4].astype(np.float32) / 255
        region = pano[y0 : y0 + ch, x0 : x0 + cw].astype(np.float32)
        pano[y0 : y0 + ch, x0 : x0 + cw] = (rgba[..., :3] * alpha + region * (1 - alpha)).astype(
            np.uint8
        )
        boxes.append((x0, y0, x0 + cw, y0 + ch))
    return pano, boxes


def camera_path(revisit: bool) -> list[float]:
    end = PANO_W - W
    targets = [end * 0.6, end * 0.3, end] if revisit else [end]
    path, pos = [0.0] * 12, 0.0  # 1 s quieto al inicio
    for target in targets:
        while abs(pos - target) > PAN_PX_PER_FRAME / 2:
            pos += PAN_PX_PER_FRAME if target > pos else -PAN_PX_PER_FRAME
            path.append(pos)
    return path + [pos] * 12


def write(name: str, pano: np.ndarray, path: list[float], rng: np.random.Generator) -> Path:
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("Se requiere ffmpeg con libx264")
    target = OUT_DIR / f"{name}.mp4"
    # Argumentos fijos definidos en este script (sin entrada externa).
    proc = subprocess.Popen(  # noqa: S603
        [
            ffmpeg_bin, "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "26",
            "-movflags", "+faststart", str(target),
        ],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    assert proc.stdin
    padded = cv2.copyMakeBorder(pano, 8, 8, 0, 0, cv2.BORDER_REFLECT)
    for x in path:
        shake = int(rng.integers(-3, 4))
        frame = padded[8 + shake : 8 + shake + H, int(x) : int(x) + W]
        proc.stdin.write(np.ascontiguousarray(frame).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg falló")
    return target


def main() -> None:
    rng = np.random.default_rng(SEED)
    pano, boxes = build_panorama(rng)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "description": (
            "Videos SINTÉTICOS de barrido desde un punto: bovinos quietos (recortes reales de Open "
            "Images V7) en un panorama de pastura procedural; la cámara gira (traslación) con "
            "temblor de mano. Prueban el conteo neto del escáner móvil; no miden precisión en "
            "campo."
        ),
        "seed": SEED,
        "fps": FPS,
        "width": W,
        "height": H,
        "panorama_width": PANO_W,
        "ground_truth_in_swept_arc": ANIMALS,
        "animal_boxes_panorama": boxes,
        "videos": {},
        "synthetic": True,
    }
    for name, revisit in (("barrido-sintetico", False), ("barrido-ida-vuelta-sintetico", True)):
        path = camera_path(revisit)
        target = write(name, pano, path, rng)
        manifest["videos"][name] = {"file": target.name, "frames": len(path), "revisit": revisit}
        print(f"{target} ({target.stat().st_size // 1024} KB, {len(path)} cuadros)")
    (OUT_DIR / "barrido-sintetico.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1)
    )


if __name__ == "__main__":
    main()
