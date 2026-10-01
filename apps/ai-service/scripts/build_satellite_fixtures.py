"""Lotes y series NDVI reales (Sentinel-2 L2A) para los activos agrícolas de la demo.

Para cada activo se busca, cerca del establecimiento declarado, un lote cuyo patrón temporal de
NDVI corresponda al cultivo (p. ej. trigo: vegetación activa en agosto y septiembre; maíz
temprano: vegetación en agosto y suelo desnudo a fines de septiembre por barbecho y siembra).
El lote se delimita segmentando el NDVI real y se vectoriza a coordenadas geográficas. Luego se
calcula la serie temporal con el mismo pipeline que usa la verificación (máscara SCL, NDVI,
estadísticas) y se guardan los resultados y las vistas previas como datos de la demo.

Uso: uv run python scripts/build_satellite_fixtures.py [--only CLAVE]
Salida: infra/seed-assets/satellite/real/<clave>/manifest.json y PNG por escena.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import cv2
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import transform as warp_transform
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from agro_vision.domain.sentinel2 import (  # noqa: E402
    PROCESSING_VERSION,
    SCL_VALID,
    Scene,
    VegetationThresholds,
    compute_ndvi,
    reflectance,
    utm_epsg,
)
from agro_vision.infrastructure.sentinel_catalog import SentinelCatalog  # noqa: E402
from agro_vision.infrastructure.sentinel_reader import GDAL_ENV, analyze_scene  # noqa: E402

OUT = ROOT.parents[1] / "infra" / "seed-assets" / "satellite" / "real"


@dataclass(frozen=True)
class Target:
    key: str
    asset: str
    center: tuple[float, float]  # lon, lat
    # Ventanas (inicio, fin) de las dos fechas de referencia y condición sobre el NDVI.
    reference: tuple[tuple[str, str], tuple[str, str]]
    rule: str
    condition: Callable[[np.ndarray, np.ndarray], np.ndarray]
    area_ha: tuple[float, float]
    ndvi_threshold: float
    series: tuple[tuple[str, str], ...]
    radius_m: int = 3500
    # Apertura morfológica (px): mayor para separar chacras unidas por cortinas de álamos.
    open_px: int = 3
    min_compactness: float = 0.7


TARGETS = (
    Target(
        key="los-alamos-trigo",
        asset="Trigo — Campaña 2026/27 (Los Álamos)",
        center=(-61.912, -33.759),
        reference=(("2026-08-01", "2026-08-31"), ("2026-09-10", "2026-09-30")),
        rule="NDVI ago ≥ 0.55 y NDVI sep ≥ 0.70",
        condition=lambda a, b: (a >= 0.55) & (b >= 0.7),
        area_ha=(60, 400),
        ndvi_threshold=0.4,
        series=(("2026-06-01", "2026-09-30"),),
    ),
    Target(
        key="los-ceibos-maiz",
        asset="Maíz temprano — Campaña 2026/27 (Los Ceibos)",
        center=(-60.585, -33.901),
        reference=(("2026-08-01", "2026-08-12"), ("2026-09-15", "2026-09-30")),
        rule="NDVI ago ≥ 0.40 y NDVI fin de sep ≤ 0.32 (secado de cobertura y siembra)",
        condition=lambda a, b: (a >= 0.4) & (b <= 0.32),
        area_ha=(30, 400),
        ndvi_threshold=0.4,
        series=(("2026-06-01", "2026-09-30"),),
        radius_m=6000,
    ),
    Target(
        key="las-marias-forestal",
        asset="Eucalyptus grandis (Las Marías)",
        center=(-58.30, -31.78),
        reference=(("2026-07-01", "2026-08-31"), ("2026-09-01", "2026-09-30")),
        rule="NDVI ≥ 0.75 en invierno y primavera, variación ≤ 0.08",
        condition=lambda a, b: (a >= 0.75) & (b >= 0.75) & (np.abs(a - b) <= 0.08),
        area_ha=(40, 300),
        ndvi_threshold=0.5,
        series=(("2026-05-01", "2026-09-30"),),
        radius_m=6000,
    ),
    Target(
        key="don-jose-vinedo",
        asset="Viñedo Malbec (Finca Don José)",
        center=(-68.921, -33.078),
        reference=(("2026-01-01", "2026-02-28"), ("2026-09-01", "2026-09-30")),
        rule="NDVI verano ≥ 0.45 y NDVI sep ≤ 0.30 (caducifolio)",
        condition=lambda a, b: (a >= 0.45) & (b <= 0.3),
        area_ha=(15, 150),
        ndvi_threshold=0.3,
        series=(("2025-12-01", "2026-03-31"), ("2026-08-01", "2026-09-30")),
    ),
    Target(
        key="san-jose-frutales",
        asset="Montes de pera Williams (San José)",
        center=(-67.827, -38.979),
        reference=(("2026-01-01", "2026-02-28"), ("2026-09-01", "2026-09-30")),
        rule="NDVI verano ≥ 0.50 y NDVI sep ≤ 0.55 (caducifolio)",
        condition=lambda a, b: (a >= 0.5) & (b <= 0.55),
        area_ha=(4, 150),
        ndvi_threshold=0.35,
        radius_m=5000,
        open_px=5,
        min_compactness=0.6,
        series=(("2025-12-01", "2026-03-31"), ("2026-08-01", "2026-09-30")),
    ),
)


def _d(text: str) -> date:
    return date.fromisoformat(text)


def window_geometry(
    center: tuple[float, float], radius_m: int
) -> tuple[dict, int, tuple[float, float]]:
    lon, lat = center
    epsg = utm_epsg(lon, lat)
    xs, ys = warp_transform("EPSG:4326", f"EPSG:{epsg}", [lon], [lat])
    cx, cy = xs[0], ys[0]
    ring_x = [cx - radius_m, cx + radius_m, cx + radius_m, cx - radius_m, cx - radius_m]
    ring_y = [cy - radius_m, cy - radius_m, cy + radius_m, cy + radius_m, cy - radius_m]
    lons, lats = warp_transform(f"EPSG:{epsg}", "EPSG:4326", ring_x, ring_y)
    geometry = {"type": "Polygon", "coordinates": [[list(p) for p in zip(lons, lats, strict=True)]]}
    return geometry, epsg, (cx, cy)


def candidate_scenes(
    catalog: SentinelCatalog, geometry: dict, window: tuple[str, str]
) -> list[Scene]:
    scenes = catalog.search(geometry, _d(window[0]), _d(window[1]), 30, 20)
    if not scenes:
        raise RuntimeError(f"Sin escenas despejadas en {window}")
    return sorted(scenes, key=lambda s: s.cloud_cover)


def read_ndvi(scene: Scene, bounds: tuple[float, float, float, float], shape: tuple[int, int]):
    with rasterio.Env(**GDAL_ENV):
        arrays = {}
        for name, asset in (("red", scene.red), ("nir", scene.nir), ("scl", scene.scl)):
            with rasterio.open(asset.href) as ds:
                # boundless: la ventana puede exceder el tile; lo exterior queda como nodata (0)
                # en lugar de desplazar la lectura.
                arrays[name] = ds.read(
                    1, window=from_bounds(*bounds, transform=ds.transform), out_shape=shape,
                    resampling=Resampling.nearest, boundless=True, fill_value=0,
                )  # fmt: skip
    ndvi = compute_ndvi(
        reflectance(arrays["red"], scene.red), reflectance(arrays["nir"], scene.nir)
    )
    valid = np.isin(arrays["scl"], list(SCL_VALID)) & (arrays["red"] > 0) & np.isfinite(ndvi)
    return ndvi, valid


def find_parcel(target: Target, catalog: SentinelCatalog) -> dict:
    geometry, epsg, (cx, cy) = window_geometry(target.center, target.radius_m)
    candidates_a = candidate_scenes(catalog, geometry, target.reference[0])
    candidates_b = candidate_scenes(catalog, geometry, target.reference[1])
    size = 2 * target.radius_m // 10
    r = target.radius_m

    def window_in(scene: Scene) -> tuple[float, float, float, float] | None:
        # La ventana debe quedar dentro del tile: si cruza un borde, se desplaza hacia adentro.
        with rasterio.Env(**GDAL_ENV), rasterio.open(scene.red.href) as ds:
            if ds.crs.to_epsg() != epsg:
                return None
            left, bottom, right, top = ds.bounds
        x = min(max(cx, left + r + 200), right - r - 200)
        y = min(max(cy, bottom + r + 200), top - r - 200)
        return (x - r, y - r, x + r, y + r)

    def covering(scene: Scene, bounds: tuple[float, float, float, float]):
        ndvi, valid = read_ndvi(scene, bounds, (size, size))
        return (ndvi, valid) if valid.mean() >= 0.85 else None

    # Una escena puede tener poca nubosidad y no cubrir la ventana (borde de órbita): se
    # elige la primera que realmente tiene datos, y la segunda fecha sobre la misma ventana.
    for scene_a in candidates_a[:12]:
        bounds = window_in(scene_a)
        if bounds is None or (found_a := covering(scene_a, bounds)) is None:
            continue
        found_b = next(
            ((scene_b, hit) for scene_b in candidates_b[:12] if (hit := covering(scene_b, bounds))),
            None,
        )
        if found_b:
            break
    else:
        raise RuntimeError("Ninguna escena cubre la ventana")
    a, valid_a = found_a
    scene_b, (b, valid_b) = found_b
    mask = target.condition(a, b) & valid_a & valid_b
    kernel = np.ones((target.open_px, target.open_px), np.uint8)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, kernel)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=4)
    candidates = []
    for i in range(1, count):
        area_ha = stats[i, cv2.CC_STAT_AREA] * 100 / 10_000
        if not target.area_ha[0] <= area_ha <= target.area_ha[1]:
            continue
        component = (labels == i).astype(np.uint8)
        points = cv2.findNonZero(component)
        (_, _), (rw, rh), _ = cv2.minAreaRect(points)
        # Compacidad respecto del rectángulo rotado mínimo: los lotes suelen no estar
        # alineados con la grilla de píxeles.
        compactness = stats[i, cv2.CC_STAT_AREA] / max(rw * rh, 1)
        if compactness < target.min_compactness:
            continue  # se descartan formas irregulares (bordes, caminos, mezcla de lotes)
        distance = float(np.hypot(*(centroids[i] - size / 2)))
        candidates.append((distance - 2 * compactness * size / 10, i, area_ha, compactness))
    if not candidates:
        raise RuntimeError(f"Sin lote que cumpla '{target.rule}' en {target.key}")
    _, label, area_ha, compactness = min(candidates)
    component = cv2.erode((labels == label).astype(np.uint8), np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = cv2.approxPolyDP(max(contours, key=cv2.contourArea), 1.5, True)[:, 0, :]
    px = bounds[0] + (contour[:, 0] + 0.5) * 10
    py = bounds[3] - (contour[:, 1] + 0.5) * 10
    lons, lats = warp_transform(f"EPSG:{epsg}", "EPSG:4326", px.tolist(), py.tolist())
    ring = [[round(x, 6), round(y, 6)] for x, y in zip(lons, lats, strict=True)]
    ring.append(ring[0])
    return {
        "polygon": {"type": "Polygon", "coordinates": [ring]},
        "segmentation": {
            "rule": target.rule,
            "scenes": [scene_a.scene_id, scene_b.scene_id],
            "component_area_ha": round(area_ha, 1),
            "compactness": round(float(compactness), 3),
        },
    }


def build_series(
    target: Target, catalog: SentinelCatalog, polygon: dict, out_dir: Path
) -> list[dict]:
    thresholds = VegetationThresholds(ndvi_vegetated=target.ndvi_threshold)
    observations = []
    for start, end in target.series:
        for scene in sorted(
            catalog.search(polygon, _d(start), _d(end), 60, 40), key=lambda s: s.acquired_at
        ):
            try:
                result = analyze_scene(scene, polygon, thresholds, include_previews=True)
            except ValueError:
                continue
            if result.valid_pixels == 0 and result.cloud_pixels == 0:
                continue  # fuera de la franja de esa órbita
            data = asdict(result)
            previews = data.pop("previews")
            for kind, encoded in previews.items():
                (out_dir / f"{scene.scene_id}_{kind}.png").write_bytes(base64.b64decode(encoded))
            data["acquired_at"] = scene.acquired_at.isoformat()
            data["scene"] = {
                "scene_id": scene.scene_id,
                "platform": scene.platform,
                "tile": scene.tile,
                "scene_cloud_cover": round(scene.cloud_cover, 2),
                "processing_baseline": scene.processing_baseline,
                "catalog": scene.catalog,
            }
            data["previews"] = sorted(previews)
            observations.append(data)
            print(
                f"   {scene.acquired_at.date()} nubes {result.cloud_cover_pct:5.1f}% "
                f"NDVI {result.ndvi_mean} veg {result.vegetation_pct}% "
                f"{'✓' if result.usable else '·'}"
            )
    # Dos tiles solapados pueden cubrir el lote el mismo día: se conserva el de mayor cobertura.
    by_day: dict[str, dict] = {}
    for obs in observations:
        day = obs["acquired_at"][:10]
        if day not in by_day or obs["valid_fraction"] > by_day[day]["valid_fraction"]:
            by_day[day] = obs
    for obs in observations:
        if by_day[obs["acquired_at"][:10]] is not obs:
            for kind in obs["previews"]:
                (out_dir / f"{obs['scene']['scene_id']}_{kind}.png").unlink(missing_ok=True)
    return [by_day[day] for day in sorted(by_day)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args()
    catalog = SentinelCatalog("aws-inventory", "https://earth-search.aws.element84.com/v1")
    for target in TARGETS:
        if args.only and target.key not in args.only:
            continue
        print(f"→ {target.key}")
        out_dir = OUT / target.key
        out_dir.mkdir(parents=True, exist_ok=True)
        parcel = find_parcel(target, catalog)
        print(f"   lote {parcel['segmentation']}")
        series = build_series(target, catalog, parcel["polygon"], out_dir)
        manifest = {
            "key": target.key,
            "asset": target.asset,
            "source": "Copernicus Sentinel-2 L2A (ESA), COG en AWS Open Data (sentinel-cogs)",
            "processing_version": PROCESSING_VERSION,
            "ndvi_threshold": target.ndvi_threshold,
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            **parcel,
            "observations": series,
        }
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
