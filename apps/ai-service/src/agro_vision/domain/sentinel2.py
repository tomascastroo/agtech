"""Sentinel-2 L2A: localización de tiles MGRS, catálogo de escenas y análisis NDVI.

Fuente: colección Sentinel-2 L2A en formato COG del Registro de Datos Abiertos de AWS
(bucket público `sentinel-cogs`, mantenido por Element 84), sin credenciales. El catálogo se
consulta por la API STAC de Earth Search o, si no está disponible, leyendo directamente los
ítems STAC publicados en el bucket.

NDVI = (NIR − RED) / (NIR + RED) con B08 (NIR, 10 m) y B04 (rojo, 10 m) en reflectancia de
superficie. Se excluyen los píxeles inválidos o con nubes según la capa de clasificación de
escena (SCL, 20 m, remuestreada por vecino más cercano).
"""

from __future__ import annotations

import base64
import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime

import cv2
import numpy as np

PROCESSING_VERSION = "agro-ndvi/1.0.0"
PIXEL_AREA_M2 = 100.0  # 10 m × 10 m

# Clases SCL (ESA Sen2Cor).
SCL_NO_DATA, SCL_SATURATED = 0, 1
SCL_VALID = frozenset(
    {2, 4, 5, 6, 7}
)  # sombra topográfica, vegetación, suelo, agua, sin clasificar
SCL_CLOUD = frozenset({3, 8, 9, 10})  # sombra de nube, nube media/alta, cirros
SCL_SNOW = 11

SCENE_ID = re.compile(r"^S2[ABCD]_(\d{1,2})([C-X])([A-Z]{2})_(\d{8})_(\d+)_L2A$")
LAT_BANDS = "CDEFGHJKLMNPQRSTUVWX"
COLUMN_SETS = ("ABCDEFGH", "JKLMNPQR", "STUVWXYZ")
ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUV"


class SceneNotFoundError(LookupError):
    """La escena no existe en el catálogo."""


def utm_epsg(lon: float, lat: float) -> int:
    zone = int((lon + 180) // 6) + 1
    return (32700 if lat < 0 else 32600) + zone


def mgrs_tile(lon: float, lat: float, easting: float, northing: float) -> str:
    """Identificador del tile Sentinel-2 (cuadrícula MGRS de 100 km) que contiene el punto.

    `easting`/`northing` son las coordenadas UTM del punto en su zona (con falso norte de
    10.000 km en el hemisferio sur).
    """
    if not -80 <= lat < 84:
        raise ValueError("Latitud fuera del rango cubierto por MGRS/UTM")
    zone = int((lon + 180) // 6) + 1
    band = LAT_BANDS[min(int((lat + 80) // 8), len(LAT_BANDS) - 1)]
    column = COLUMN_SETS[(zone - 1) % 3][int(easting // 100_000) - 1]
    row_offset = 0 if zone % 2 == 1 else 5
    row = ROW_LETTERS[(int(northing // 100_000) + row_offset) % 20]
    return f"{zone}{band}{column}{row}"


def candidate_tiles(lon: float, lat: float, easting: float, northing: float) -> list[str]:
    """Tiles Sentinel-2 que pueden contener el punto, del más probable al menos probable.

    Los tiles miden 109,8 km y se extienden 9,8 km al este y al norte de su cuadrado MGRS, por lo
    que un punto cercano al borde oeste o sur también cae en el tile vecino. Además, cerca del
    límite entre bandas de latitud el nombre del tile puede usar la banda contigua.
    """
    zone = int((lon + 180) // 6) + 1
    band_index = min(int((lat + 80) // 8), len(LAT_BANDS) - 1)
    columns = COLUMN_SETS[(zone - 1) % 3]
    row_offset = 0 if zone % 2 == 1 else 5
    col = int(easting // 100_000) - 1
    row = int(northing // 100_000)
    tiles: list[str] = []
    for dc, dr in ((0, 0), (-1, 0), (0, -1), (-1, -1)):
        if not 0 <= col + dc < len(columns):
            continue
        square = f"{columns[col + dc]}{ROW_LETTERS[(row + dr + row_offset) % 20]}"
        for db in (0, -1, 1):
            if 0 <= band_index + db < len(LAT_BANDS):
                tile = f"{zone}{LAT_BANDS[band_index + db]}{square}"
                if tile not in tiles:
                    tiles.append(tile)
    return tiles


@dataclass(frozen=True)
class BandAsset:
    href: str
    scale: float
    offset: float
    nodata: float | None


@dataclass(frozen=True)
class Scene:
    scene_id: str
    platform: str
    acquired_at: datetime
    tile: str
    cloud_cover: float
    epsg: int
    processing_baseline: str | None
    red: BandAsset
    nir: BandAsset
    scl: BandAsset
    visual: str | None
    catalog: str


def parse_item(item: dict, catalog: str) -> Scene:
    """Escena a partir de un ítem STAC de la colección sentinel-2-l2a (Earth Search v1)."""
    props, assets = item["properties"], item["assets"]
    # Desde la línea de base 04.00 los productos L2A suman 1000 a los valores digitales. Si Earth
    # Search ya armonizó los COG (`earthsearch:boa_offset_applied`), los datos están en
    # reflectancia × 10.000 y el offset declarado en raster:bands no debe volver a aplicarse
    # (verificado empíricamente: p1 del rojo en vegetación ≈ 226, imposible con el offset +1000).
    offset_applied = bool(props.get("earthsearch:boa_offset_applied"))

    aliases = {"red": ("red", "B04"), "nir": ("nir", "B08"), "scl": ("scl", "SCL")}

    def band(key: str) -> BandAsset:
        # Ítems antiguos usan los nombres de banda (B04, B08, SCL) como claves.
        asset = next((assets[k] for k in aliases[key] if k in assets), None)
        if asset is None:
            raise KeyError(f"El ítem {item['id']} no tiene la banda {key}")
        info = (asset.get("raster:bands") or [{}])[0]
        return BandAsset(
            href=asset["href"],
            scale=float(info.get("scale", 1.0)),
            offset=0.0 if offset_applied else float(info.get("offset", 0.0)),
            nodata=info.get("nodata"),
        )

    if "mgrs:utm_zone" in props:
        tile = f"{props['mgrs:utm_zone']}{props['mgrs:latitude_band']}{props['mgrs:grid_square']}"
    else:  # ítems antiguos sin la extensión mgrs: se deriva del identificador
        match = SCENE_ID.match(item["id"])
        if not match:
            raise ValueError(f"No se puede determinar el tile de {item['id']}")
        tile = f"{int(match.group(1))}{match.group(2)}{match.group(3)}"
    zone = int(re.match(r"\d+", tile).group())  # type: ignore[union-attr]
    epsg = int(props.get("proj:epsg") or (32700 if tile[len(str(zone))] < "N" else 32600) + zone)
    return Scene(
        scene_id=item["id"],
        platform=props.get("platform", ""),
        acquired_at=datetime.fromisoformat(props["datetime"].replace("Z", "+00:00")),
        tile=tile,
        cloud_cover=float(props.get("eo:cloud_cover", 100.0)),
        epsg=epsg,
        processing_baseline=props.get("s2:processing_baseline"),
        red=band("red"),
        nir=band("nir"),
        scl=band("scl"),
        visual=(assets.get("visual") or assets.get("TCI") or {}).get("href"),
        catalog=catalog,
    )


def dedupe_scenes(scenes: list[Scene]) -> list[Scene]:
    """Una escena por tile y fecha: si hay reprocesamientos, se conserva el más reciente."""
    best: dict[tuple[str, date], Scene] = {}
    for scene in scenes:
        key = (scene.tile, scene.acquired_at.date())
        current = best.get(key)
        if current is None or scene.scene_id > current.scene_id:
            best[key] = scene
    return sorted(best.values(), key=lambda s: s.acquired_at, reverse=True)


@dataclass(frozen=True)
class VegetationThresholds:
    ndvi_vegetated: float = 0.4
    max_cloud_cover_pct: float = 20.0
    min_valid_fraction: float = 0.6


@dataclass
class NdviResult:
    scene_id: str
    acquired_at: datetime
    polygon_pixels: int
    valid_pixels: int
    cloud_pixels: int
    polygon_area_ha: float
    cloud_cover_pct: float
    valid_fraction: float
    ndvi_mean: float | None
    ndvi_median: float | None
    ndvi_min: float | None
    ndvi_max: float | None
    ndvi_p10: float | None
    ndvi_p90: float | None
    ndvi_std: float | None
    vegetated_pixels: int
    vegetation_pct: float | None
    vegetated_area_observed_ha: float
    vegetated_area_estimated_ha: float | None
    usable: bool
    quality: str
    confidence: float
    issues: list[str] = field(default_factory=list)
    previews: dict[str, str] = field(default_factory=dict)  # PNG en base64


def reflectance(dn: np.ndarray, asset: BandAsset) -> np.ndarray:
    return dn.astype(np.float32) * asset.scale + asset.offset


def compute_ndvi(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    denominator = nir + red
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = np.where(denominator > 1e-6, (nir - red) / denominator, np.nan)
    return np.clip(ndvi, -1.0, 1.0)


def polygon_area_m2(rings: list[list[tuple[float, float]]]) -> float:
    """Área de un polígono (anillo exterior menos huecos) en coordenadas proyectadas."""

    def ring_area(ring: list[tuple[float, float]]) -> float:
        xs = np.array([p[0] for p in ring])
        ys = np.array([p[1] for p in ring])
        return float(abs(np.dot(xs, np.roll(ys, -1)) - np.dot(ys, np.roll(xs, -1))) / 2)

    if not rings:
        return 0.0
    return max(0.0, ring_area(rings[0]) - sum(ring_area(r) for r in rings[1:]))


def harmonize_offset(
    scene: Scene, red_dn: np.ndarray, nir_dn: np.ndarray, valid: np.ndarray
) -> tuple[BandAsset, BandAsset]:
    """Verifica empíricamente si el offset BOA (−1000 desde la línea de base 04.00) ya fue aplicado.

    La metadata de algunos ítems no lo indica o es inconsistente. Si hay valores del rojo menores
    que el offset (en suelo y vegetación el mínimo raw es ≥ 1000), los datos ya están armonizados
    y no se vuelve a restar; si todos son ≥ 1000, se aplica el offset declarado.
    """
    if scene.red.offset >= 0 or not valid.any():
        return scene.red, scene.nir
    floor = -scene.red.offset / scene.red.scale  # 1000 DN
    harmonized = float(np.percentile(red_dn[valid], 1)) < floor
    if not harmonized:
        return scene.red, scene.nir
    return (
        BandAsset(scene.red.href, scene.red.scale, 0.0, scene.red.nodata),
        BandAsset(scene.nir.href, scene.nir.scale, 0.0, scene.nir.nodata),
    )


def summarize(
    *,
    scene: Scene,
    red_dn: np.ndarray,
    nir_dn: np.ndarray,
    scl: np.ndarray,
    inside: np.ndarray,
    polygon_area_ha: float,
    thresholds: VegetationThresholds,
) -> tuple[NdviResult, np.ndarray, np.ndarray]:
    """Estadísticas NDVI sobre los píxeles del polígono. Devuelve también NDVI y máscara válida."""
    nodata = (red_dn == 0) | (nir_dn == 0) | (scl == SCL_NO_DATA) | (scl == SCL_SATURATED)
    cloud = np.isin(scl, list(SCL_CLOUD)) & inside
    valid = inside & ~nodata & np.isin(scl, list(SCL_VALID))
    red_asset, nir_asset = harmonize_offset(scene, red_dn, nir_dn, valid)
    ndvi = compute_ndvi(reflectance(red_dn, red_asset), reflectance(nir_dn, nir_asset))
    valid &= np.isfinite(ndvi)

    polygon_pixels = int(inside.sum())
    valid_pixels = int(valid.sum())
    cloud_pixels = int(cloud.sum())
    cloud_pct = 100.0 * cloud_pixels / max(polygon_pixels, 1)
    valid_fraction = valid_pixels / max(polygon_pixels, 1)
    values = ndvi[valid]
    vegetated = int((values >= thresholds.ndvi_vegetated).sum())
    vegetation_pct = 100.0 * vegetated / valid_pixels if valid_pixels else None

    issues: list[str] = []
    if cloud_pct > thresholds.max_cloud_cover_pct:
        issues.append("CLOUD_COVER_ABOVE_LIMIT")
    if valid_fraction < thresholds.min_valid_fraction:
        issues.append("INSUFFICIENT_VALID_PIXELS")
    if polygon_pixels == 0:
        issues.append("POLYGON_OUTSIDE_SCENE")
    usable = not issues
    quality = (
        "GOOD"
        if usable and cloud_pct <= thresholds.max_cloud_cover_pct / 2
        else "ACCEPTABLE"
        if usable
        else "LOW_CONFIDENCE"
    )

    def stat(fn) -> float | None:  # noqa: ANN001
        return round(float(fn(values)), 4) if values.size else None

    result = NdviResult(
        scene_id=scene.scene_id,
        acquired_at=scene.acquired_at,
        polygon_pixels=polygon_pixels,
        valid_pixels=valid_pixels,
        cloud_pixels=cloud_pixels,
        polygon_area_ha=round(polygon_area_ha, 2),
        cloud_cover_pct=round(cloud_pct, 2),
        valid_fraction=round(valid_fraction, 4),
        ndvi_mean=stat(np.mean),
        ndvi_median=stat(np.median),
        ndvi_min=stat(np.min),
        ndvi_max=stat(np.max),
        ndvi_p10=stat(lambda v: np.percentile(v, 10)),
        ndvi_p90=stat(lambda v: np.percentile(v, 90)),
        ndvi_std=stat(np.std),
        vegetated_pixels=vegetated,
        vegetation_pct=round(vegetation_pct, 2) if vegetation_pct is not None else None,
        vegetated_area_observed_ha=round(vegetated * PIXEL_AREA_M2 / 10_000, 2),
        vegetated_area_estimated_ha=(
            round(polygon_area_ha * vegetation_pct / 100, 2) if vegetation_pct is not None else None
        ),
        usable=usable,
        quality=quality,
        confidence=round(valid_fraction * (0.95 if usable else 0.5), 4),
        issues=issues,
    )
    return result, ndvi, valid


def _png_base64(image_bgra: np.ndarray, scale: int) -> str:
    if scale > 1:
        image_bgra = cv2.resize(
            image_bgra,
            (image_bgra.shape[1] * scale, image_bgra.shape[0] * scale),
            interpolation=cv2.INTER_NEAREST,
        )
    ok, encoded = cv2.imencode(".png", image_bgra)
    if not ok:
        raise RuntimeError("No fue posible codificar la vista previa")
    return base64.b64encode(encoded.tobytes()).decode("ascii")


def preview_scale(shape: tuple[int, ...]) -> int:
    return max(1, min(4, math.ceil(480 / max(shape[0], shape[1], 1))))


def ndvi_preview(ndvi: np.ndarray, valid: np.ndarray, inside: np.ndarray, cloud: np.ndarray) -> str:
    """NDVI coloreado (rojo → amarillo → verde), nubes en gris, exterior transparente."""
    stops = np.array(
        [
            [-0.2, 165, 0, 38],
            [0.2, 253, 174, 97],
            [0.45, 255, 255, 191],
            [0.7, 102, 189, 99],
            [0.9, 0, 104, 55],
        ]
    )
    values = np.nan_to_num(ndvi, nan=0.0)
    rgb = np.stack([np.interp(values, stops[:, 0], stops[:, i]) for i in (1, 2, 3)], axis=-1)
    bgra = np.zeros((*ndvi.shape, 4), dtype=np.uint8)
    bgra[..., :3] = rgb[..., ::-1].astype(np.uint8)
    bgra[..., 3] = np.where(inside, 255, 0)
    bgra[cloud & inside] = (190, 190, 190, 255)
    bgra[inside & ~valid & ~cloud] = (60, 60, 60, 255)
    return _png_base64(bgra, preview_scale(ndvi.shape))


def visual_preview(rgb: np.ndarray, inside: np.ndarray) -> str:
    """Color verdadero (TCI) con el contorno del polígono."""
    bgra = np.zeros((*rgb.shape[:2], 4), dtype=np.uint8)
    bgra[..., :3] = rgb[..., ::-1]
    bgra[..., 3] = 255
    scale = preview_scale(rgb.shape)
    if scale > 1:
        bgra = cv2.resize(
            bgra, (bgra.shape[1] * scale, bgra.shape[0] * scale), interpolation=cv2.INTER_NEAREST
        )
        inside = cv2.resize(
            inside.astype(np.uint8), (bgra.shape[1], bgra.shape[0]), interpolation=cv2.INTER_NEAREST
        )
    contours, _ = cv2.findContours(
        inside.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    cv2.drawContours(bgra, contours, -1, (0, 255, 255, 255), 2)
    return _png_base64(bgra, 1)
