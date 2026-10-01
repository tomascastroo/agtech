"""Lectura por ventana de los COG de Sentinel-2 (sólo se descargan los bloques del lote)."""

from __future__ import annotations

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import WindowError
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from rasterio.windows import Window, from_bounds

from ..domain.sentinel2 import (
    SCL_CLOUD,
    NdviResult,
    Scene,
    VegetationThresholds,
    ndvi_preview,
    polygon_area_m2,
    summarize,
    visual_preview,
)
from .sentinel_catalog import ALLOWED_HOSTS

GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_MULTIRANGE": "YES",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "1",
    "VSI_CACHE": "TRUE",
}
PAD_PX = 3


class PolygonOutsideSceneError(ValueError):
    """El lote no se superpone con la escena."""


def _projected_polygons(
    geometry: dict, epsg: int
) -> tuple[dict, list[list[list[tuple[float, float]]]]]:
    projected = transform_geom("EPSG:4326", f"EPSG:{epsg}", geometry)
    polygons = (
        [projected["coordinates"]] if projected["type"] == "Polygon" else projected["coordinates"]
    )
    return projected, [
        [[(float(x), float(y)) for x, y in ring] for ring in polygon] for polygon in polygons
    ]


def _check(href: str) -> str:
    if not ALLOWED_HOSTS.match(href):
        raise ValueError("Origen de datos no permitido")
    return href


def analyze_scene(
    scene: Scene, geometry: dict, thresholds: VegetationThresholds, include_previews: bool = True
) -> NdviResult:
    projected, polygons = _projected_polygons(geometry, scene.epsg)
    xs = [x for poly in polygons for ring in poly for x, _ in ring]
    ys = [y for poly in polygons for ring in poly for _, y in ring]
    area_ha = sum(polygon_area_m2(poly) for poly in polygons) / 10_000

    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(_check(scene.red.href)) as red_ds:
            window = (
                from_bounds(min(xs), min(ys), max(xs), max(ys), transform=red_ds.transform)
                .round_offsets(op="floor")
                .round_lengths(op="ceil")
            )
            window = Window(
                window.col_off - PAD_PX,
                window.row_off - PAD_PX,
                window.width + 2 * PAD_PX,
                window.height + 2 * PAD_PX,
            )
            try:
                window = window.intersection(Window(0, 0, red_ds.width, red_ds.height))
            except WindowError as exc:
                raise PolygonOutsideSceneError(scene.scene_id) from exc
            if window.width <= 0 or window.height <= 0:
                raise PolygonOutsideSceneError(scene.scene_id)
            transform = red_ds.window_transform(window)
            shape = (int(window.height), int(window.width))
            red = red_ds.read(1, window=window)
            bounds = rasterio.windows.bounds(window, red_ds.transform)
        with rasterio.open(_check(scene.nir.href)) as nir_ds:
            nir = nir_ds.read(1, window=window)
        with rasterio.open(_check(scene.scl.href)) as scl_ds:
            scl = scl_ds.read(
                1,
                window=from_bounds(*bounds, transform=scl_ds.transform),
                out_shape=shape,
                resampling=Resampling.nearest,
            )
        inside = geometry_mask([projected], out_shape=shape, transform=transform, invert=True)
        result, ndvi, valid = summarize(
            scene=scene,
            red_dn=red,
            nir_dn=nir,
            scl=scl,
            inside=inside,
            polygon_area_ha=area_ha,
            thresholds=thresholds,
        )
        if include_previews:
            cloud = np.isin(scl, list(SCL_CLOUD))
            result.previews["ndvi"] = ndvi_preview(ndvi, valid, inside, cloud)
            if scene.visual:
                with rasterio.open(_check(scene.visual)) as tci:
                    rgb = tci.read(
                        (1, 2, 3),
                        window=from_bounds(*bounds, transform=tci.transform),
                        out_shape=(3, *shape),
                    )
                result.previews["visual"] = visual_preview(np.moveaxis(rgb, 0, -1), inside)
    return result
