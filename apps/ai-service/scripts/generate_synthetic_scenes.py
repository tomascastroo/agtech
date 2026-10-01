"""Genera las escenas sintéticas de desarrollo usadas por el seed y los proveedores simulados.

Las imágenes son SINTÉTICAS: representan tomas cenitales de cámaras de campo y vistas NDVI
satelitales. Se generan de forma determinística (semillas fijas) para que el conteo de la
demo sea reproducible. No representan establecimientos reales.

Uso:
    uv run python scripts/generate_synthetic_scenes.py --out ../../infra/seed-assets
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

WIDTH, HEIGHT = 1280, 800
OVERLAY_HEIGHT = 26
MIN_CENTER_DISTANCE = 27.0
EDGE_MARGIN = 14
JPEG_QUALITY = 90


@dataclass(frozen=True)
class CameraScene:
    serial: str
    label: str
    animals: int
    seed: int
    soil_patches: int = 1


# Los conteos de CAM-LE-* suman 1.482 cabezas para el rodeo demo de "La Esperanza".
CAMERA_SCENES: tuple[CameraScene, ...] = (
    CameraScene("CAM-LE-01", "Aguada Norte", 262, 101),
    CameraScene("CAM-LE-02", "Aguada Sur", 248, 102),
    CameraScene("CAM-LE-03", "Potrero 4", 251, 103, soil_patches=0),
    CameraScene("CAM-LE-04", "Potrero 7", 239, 104, soil_patches=0),
    CameraScene("CAM-LE-05", "Manga y corrales", 245, 105, soil_patches=2),
    CameraScene("CAM-LE-06", "Bajo del arroyo", 237, 106),
    # Rodeo de "El Trébol" (812 cabezas en 4 zonas).
    CameraScene("CAM-ET-01", "Aguada principal", 205, 201),
    CameraScene("CAM-ET-02", "Potrero La Loma", 198, 202, soil_patches=0),
    CameraScene("CAM-ET-03", "Corrales", 210, 203, soil_patches=2),
    CameraScene("CAM-ET-04", "Bajo del arroyo", 199, 204),
)

# Tonos BGR de pelajes frecuentes en rodeos de cría (Angus negro/colorado, Hereford).
COAT_COLORS = ((28, 26, 30), (38, 48, 92), (30, 52, 118), (45, 40, 60))


def pasture(rng: np.random.Generator) -> np.ndarray:
    """Pastura con variación de luminosidad correlacionada entre canales (sombras de nubes,
    relieve) y variación leve de tono, manteniendo el índice de exceso de verde positivo."""
    base = np.array((52, 128, 84), dtype=np.float32)
    low = cv2.resize(
        rng.normal(0, 1, (HEIGHT // 40, WIDTH // 40)).astype(np.float32),
        (WIDTH, HEIGHT),
        interpolation=cv2.INTER_CUBIC,
    )
    brightness = 1.0 + np.clip(low, -2.5, 2.5)[..., None] * 0.12
    hue = cv2.resize(
        rng.normal(0, 1, (HEIGHT // 8, WIDTH // 8)).astype(np.float32),
        (WIDTH, HEIGHT),
        interpolation=cv2.INTER_LINEAR,
    )[..., None] * (2, 7, 3)
    fine = rng.normal(0, 3.5, (HEIGHT, WIDTH, 3)).astype(np.float32)
    return np.clip(base * brightness + hue + fine, 0, 255)


def draw_soil(img: np.ndarray, rng: np.random.Generator, count: int) -> list[tuple[int, int, int]]:
    patches = []
    for _ in range(count):
        cx = int(rng.integers(220, WIDTH - 220))
        cy = int(rng.integers(200, HEIGHT - 160))
        radius = int(rng.integers(70, 110))
        cv2.ellipse(
            img,
            (cx, cy),
            (radius, int(radius * 0.7)),
            float(rng.uniform(0, 180)),
            0,
            360,
            (88, 112, 140),
            -1,
        )
        # Bebedero dentro del área de suelo desnudo (aguada).
        cv2.rectangle(img, (cx - 40, cy - 9), (cx + 40, cy + 9), (150, 150, 145), -1)
        patches.append((cx, cy, radius + 18))
    return patches


def draw_fence(img: np.ndarray, rng: np.random.Generator) -> None:
    y0 = int(rng.integers(OVERLAY_HEIGHT + 40, HEIGHT - 40))
    y1 = int(np.clip(y0 + rng.integers(-60, 60), OVERLAY_HEIGHT + 20, HEIGHT - 20))
    cv2.line(img, (0, y0), (WIDTH - 1, y1), (120, 125, 120), 1, lineType=cv2.LINE_8)


def place_animals(n: int, rng: np.random.Generator, exclusions: list[tuple[int, int, int]]):
    herd_centers = [
        (rng.uniform(200, WIDTH - 200), rng.uniform(OVERLAY_HEIGHT + 160, HEIGHT - 160))
        for _ in range(4)
    ]
    placed: list[tuple[float, float]] = []
    attempts = 0
    while len(placed) < n:
        attempts += 1
        if attempts > n * 4000:
            raise RuntimeError("No se pudo ubicar la cantidad de animales solicitada")
        cx, cy = herd_centers[int(rng.integers(0, len(herd_centers)))]
        x = rng.normal(cx, 190)
        y = rng.normal(cy, 140)
        if not (EDGE_MARGIN <= x <= WIDTH - EDGE_MARGIN):
            continue
        if not (OVERLAY_HEIGHT + EDGE_MARGIN <= y <= HEIGHT - EDGE_MARGIN):
            continue
        if any(math.hypot(x - px, y - py) < pr for px, py, pr in exclusions):
            continue
        if any(math.hypot(x - px, y - py) < MIN_CENTER_DISTANCE for px, py in placed):
            continue
        placed.append((x, y))
    return placed


def draw_animal(img: np.ndarray, x: float, y: float, rng: np.random.Generator) -> None:
    angle = float(rng.uniform(0, 180))
    color = COAT_COLORS[int(rng.integers(0, len(COAT_COLORS)))]
    body = (int(rng.integers(9, 11)), int(rng.integers(4, 6)))
    cv2.ellipse(img, (int(x), int(y)), body, angle, 0, 360, color, -1)
    rad = math.radians(angle)
    hx = int(x + math.cos(rad) * (body[0] + 2))
    hy = int(y + math.sin(rad) * (body[0] + 2))
    cv2.circle(img, (hx, hy), 3, color, -1)


def overlay(img: np.ndarray, scene: CameraScene) -> None:
    cv2.rectangle(img, (0, 0), (WIDTH, OVERLAY_HEIGHT), (18, 18, 18), -1)
    text = f"{scene.serial}  {scene.label}  SINTETICO / DESARROLLO"
    cv2.putText(img, text, (10, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (235, 235, 235), 1, cv2.LINE_AA)


def render_camera_scene(scene: CameraScene) -> np.ndarray:
    rng = np.random.default_rng(scene.seed)
    img = pasture(rng)
    exclusions = draw_soil(img, rng, scene.soil_patches)
    img = img.astype(np.uint8)
    draw_fence(img, rng)
    for x, y in place_animals(scene.animals, rng, exclusions):
        draw_animal(img, x, y, rng)
    overlay(img, scene)
    return img


NDVI_STOPS = (
    (0.10, (60, 70, 165)),
    (0.30, (70, 160, 225)),
    (0.50, (90, 215, 230)),
    (0.65, (90, 190, 120)),
    (0.85, (40, 120, 30)),
)


def ndvi_colormap(ndvi: np.ndarray) -> np.ndarray:
    xs = np.array([s[0] for s in NDVI_STOPS])
    out = np.zeros((*ndvi.shape, 3), dtype=np.float32)
    for channel in range(3):
        ys = np.array([s[1][channel] for s in NDVI_STOPS], dtype=np.float32)
        out[..., channel] = np.interp(ndvi, xs, ys)
    return out.astype(np.uint8)


def render_ndvi(seed: int, base_ndvi: float, stressed_fraction: float, rows: bool) -> np.ndarray:
    rng = np.random.default_rng(seed)
    h, w = 600, 800
    field = np.full((h, w), base_ndvi, dtype=np.float32)
    noise = cv2.resize(
        rng.normal(0, 1, (h // 30, w // 30)).astype(np.float32),
        (w, h),
        interpolation=cv2.INTER_CUBIC,
    )
    field += noise * 0.04
    if rows:
        stripes = (np.sin(np.arange(w) / 3.0) * 0.03).astype(np.float32)
        field += stripes[None, :]
    if stressed_fraction > 0:
        stress_w = int(w * stressed_fraction * 1.6)
        field[:, w - stress_w :] -= 0.32
    field = np.clip(field, 0.05, 0.9)
    img = ndvi_colormap(field)
    mask = np.zeros((h, w), dtype=np.uint8)
    polygon = np.array([[40, 50], [760, 30], [770, 560], [60, 575]], dtype=np.int32)
    cv2.fillPoly(mask, [polygon], 255)
    background = np.full_like(img, (205, 205, 200))
    img = np.where(mask[..., None] == 255, img, background)
    cv2.polylines(img, [polygon], True, (255, 255, 255), 2, cv2.LINE_AA)
    return img


SATELLITE_SCENES = (
    ("los-alamos-soja", 401, 0.78, 0.0, True),
    ("don-jose-vinedo-anterior", 402, 0.70, 0.0, True),
    ("don-jose-vinedo-actual", 402, 0.70, 0.11, True),
    ("san-jose-frutales", 403, 0.74, 0.0, False),
    ("los-ceibos-maiz", 404, 0.81, 0.0, True),
    ("las-marias-forestal", 405, 0.83, 0.0, False),
)


def bare_field(rng: np.random.Generator) -> np.ndarray:
    base = np.array((92, 120, 140), dtype=np.float32)
    low = cv2.resize(
        rng.normal(0, 1, (HEIGHT // 40, WIDTH // 40)).astype(np.float32),
        (WIDTH, HEIGHT),
        interpolation=cv2.INTER_CUBIC,
    )
    img = base * (1.0 + np.clip(low, -2, 2)[..., None] * 0.06)
    img += rng.normal(0, 3.0, (HEIGHT, WIDTH, 3)).astype(np.float32)
    return np.clip(img, 0, 255).astype(np.uint8)


def render_silobags(seed: int, label: str) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = bare_field(rng)
    for i in range(9):
        y = 120 + i * 68
        x0 = int(rng.integers(140, 220))
        length = int(rng.integers(780, 900))
        cv2.rectangle(img, (x0, y), (x0 + length, y + 30), (236, 238, 240), -1)
        cv2.line(img, (x0, y + 15), (x0 + length, y + 15), (210, 212, 214), 1)
        cv2.circle(img, (x0, y + 15), 15, (236, 238, 240), -1)
        cv2.circle(img, (x0 + length, y + 15), 15, (236, 238, 240), -1)
    overlay(img, CameraScene("SAT-OBJ", label, 0, seed))
    return img


def render_silos(seed: int, label: str) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = bare_field(rng)
    cv2.rectangle(img, (120, 160), (1160, 700), (150, 150, 146), -1)
    for i in range(4):
        cx = 260 + i * 220
        cv2.circle(img, (cx, 330), 82, (200, 204, 206), -1)
        cv2.circle(img, (cx, 330), 82, (120, 124, 126), 3)
        cv2.circle(img, (cx, 330), 14, (90, 94, 96), -1)
    cv2.rectangle(img, (240, 500), (1040, 640), (88, 92, 104), -1)
    overlay(img, CameraScene("CAM-OBJ", label, 0, seed))
    return img


def render_machinery(seed: int, label: str) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = bare_field(rng)
    cv2.rectangle(img, (200, 150), (1080, 680), (160, 160, 156), -1)
    cv2.rectangle(img, (420, 290), (860, 540), (40, 150, 190), -1)
    cv2.rectangle(img, (300, 330), (420, 500), (60, 70, 70), -1)
    cv2.rectangle(img, (520, 330), (700, 430), (210, 220, 225), -1)
    for cx in (480, 800):
        cv2.rectangle(img, (cx - 40, 250), (cx + 40, 290), (30, 30, 30), -1)
        cv2.rectangle(img, (cx - 40, 540), (cx + 40, 580), (30, 30, 30), -1)
    overlay(img, CameraScene("CAM-OBJ", label, 0, seed))
    return img


def render_shed(seed: int, label: str) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = bare_field(rng)
    cv2.rectangle(img, (230, 200), (1050, 600), (180, 184, 186), -1)
    for x in range(230, 1050, 24):
        cv2.line(img, (x, 200), (x, 600), (150, 154, 156), 2)
    cv2.line(img, (230, 400), (1050, 400), (120, 124, 126), 3)
    overlay(img, CameraScene("CAM-OBJ", label, 0, seed))
    return img


OBJECT_SCENES = (
    ("silobolsas-los-alamos", render_silobags, 501, "Silobolsas Lote 3"),
    ("silos-la-aurora", render_silos, 502, "Planta de silos"),
    ("cosechadora-don-alberto", render_machinery, 503, "Cosechadora axial"),
    ("galpon-la-aurora", render_shed, 504, "Galpon de acopio"),
)


def measure(path: Path) -> dict[str, object]:
    """Mide la imagen guardada con el mismo código que usa el servicio en producción."""
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
    from agro_vision.domain.counting import count_animals
    from agro_vision.domain.image_quality import assess_quality

    image = cv2.imread(str(path))
    quality = assess_quality(image)
    result = count_animals(image)
    return {
        "measured_count": result.count,
        "confidence": result.confidence,
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    cameras_dir = args.out / "cameras"
    satellite_dir = args.out / "satellite"
    cameras_dir.mkdir(parents=True, exist_ok=True)
    satellite_dir.mkdir(parents=True, exist_ok=True)

    objects_dir = args.out / "objects"
    objects_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, list[dict[str, object]]] = {"cameras": [], "satellite": [], "objects": []}
    composites = cameras_dir / "composites.json"
    previous = args.out / "manifest.json"
    if composites.exists() and previous.exists():
        # Las cámaras demo son composiciones con recortes reales (generate_cattle_composites.py).
        manifest["cameras"] = json.loads(previous.read_text())["cameras"]
    for scene in () if manifest["cameras"] else CAMERA_SCENES:
        path = cameras_dir / f"{scene.serial}.jpg"
        cv2.imwrite(str(path), render_camera_scene(scene), [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        manifest["cameras"].append(
            {
                "serial": scene.serial,
                "label": scene.label,
                "file": f"cameras/{path.name}",
                "ground_truth_animals": scene.animals,
                **measure(path),
            }
        )
    for name, renderer, seed, label in OBJECT_SCENES:
        path = objects_dir / f"{name}.jpg"
        cv2.imwrite(str(path), renderer(seed, label), [cv2.IMWRITE_JPEG_QUALITY, 88])
        manifest["objects"].append(
            {"name": name, "label": label, "file": f"objects/{path.name}", **measure(path)}
        )
    for name, seed, base, stressed, rows in SATELLITE_SCENES:
        path = satellite_dir / f"{name}.jpg"
        cv2.imwrite(
            str(path), render_ndvi(seed, base, stressed, rows), [cv2.IMWRITE_JPEG_QUALITY, 88]
        )
        manifest["satellite"].append({"name": name, "file": f"satellite/{path.name}"})

    manifest_path = args.out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Escenas generadas en {args.out}")  # noqa: T201


if __name__ == "__main__":
    main()
