"""Catálogo de escenas Sentinel-2 L2A (AWS Open Data, sin credenciales).

Dos accesos al mismo catálogo:
- `earth-search`: API STAC de Element 84 (`/v1/search`, colección `sentinel-2-l2a`).
- `aws-inventory`: los ítems STAC publicados junto a los COG en el bucket `sentinel-cogs`,
  listados por tile MGRS y mes. Útil cuando la API STAC no es accesible.
`auto` usa la API STAC y recurre al inventario ante un error de red.
"""

from __future__ import annotations

import json
import logging
import re
import ssl
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime

from rasterio.warp import transform as warp_transform

from ..domain.sentinel2 import (
    SCENE_ID,
    Scene,
    SceneNotFoundError,
    candidate_tiles,
    dedupe_scenes,
    mgrs_tile,
    parse_item,
    utm_epsg,
)

log = logging.getLogger(__name__)

BUCKET = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
PREFIX = "sentinel-s2-l2a-cogs"
S3_NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
ALLOWED_HOSTS = re.compile(r"^https://sentinel-cogs\.s3\.us-west-2\.amazonaws\.com/")


class CatalogUnavailableError(RuntimeError):
    """El catálogo no respondió."""


def _get(url: str, timeout: float, data: bytes | None = None, attempts: int = 4) -> bytes:
    if not url.startswith("https://"):
        raise ValueError("Sólo se admiten URLs https")
    request = urllib.request.Request(  # noqa: S310 - esquema validado arriba
        url,
        data=data,
        headers={
            "content-type": "application/json",
            "accept": "application/json",
            "user-agent": "agrogarantias-agro-vision",
        },
    )
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(  # noqa: S310 - esquema validado arriba
                request, timeout=timeout, context=ssl.create_default_context()
            ) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise SceneNotFoundError(url) from exc
            # S3 responde 503 (SlowDown) ante ráfagas: se reintenta con espera exponencial.
            if exc.code in {429, 500, 502, 503, 504} and attempt < attempts - 1:
                time.sleep(0.5 * 2**attempt)
                continue
            raise CatalogUnavailableError(f"{url}: HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt < attempts - 1:
                time.sleep(0.5 * 2**attempt)
                continue
            raise CatalogUnavailableError(f"{url}: {exc}") from exc
    raise CatalogUnavailableError(url)


def outer_rings(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    if geometry["type"] == "MultiPolygon":
        return [polygon[0] for polygon in geometry["coordinates"]]
    raise ValueError("Se espera un Polygon o MultiPolygon")


def centroid(geometry: dict) -> tuple[float, float]:
    """Centroide de vértices (suficiente para elegir el tile que contiene el lote)."""
    points = [pt for ring in outer_rings(geometry) for pt in ring[:-1]]
    return sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)


def tile_for_geometry(geometry: dict) -> str:
    return tiles_for_geometry(geometry)[0]


def tiles_for_geometry(geometry: dict) -> list[str]:
    lon, lat = centroid(geometry)
    epsg = utm_epsg(lon, lat)
    xs, ys = warp_transform("EPSG:4326", f"EPSG:{epsg}", [lon], [lat])
    return [mgrs_tile(lon, lat, xs[0], ys[0]), *candidate_tiles(lon, lat, xs[0], ys[0])]


def _months(start: date, end: date) -> list[tuple[int, int]]:
    months, year, month = [], start.year, start.month
    while (year, month) <= (end.year, end.month):
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


class SentinelCatalog:
    def __init__(self, mode: str, earth_search_url: str, timeout: float = 20.0) -> None:
        if mode not in {"auto", "earth-search", "aws-inventory"}:
            raise ValueError(f"Catálogo Sentinel-2 desconocido: {mode}")
        self.mode = mode
        self.earth_search_url = earth_search_url.rstrip("/")
        self.timeout = timeout
        self._tile_exists: dict[str, bool] = {}

    def search(
        self, geometry: dict, start: date, end: date, max_scene_cloud: float, limit: int
    ) -> list[Scene]:
        if self.mode in {"auto", "earth-search"}:
            try:
                return self._search_stac(geometry, start, end, max_scene_cloud, limit)
            except CatalogUnavailableError as exc:
                if self.mode == "earth-search":
                    raise
                log.warning("API STAC no disponible (%s); se usa el inventario del bucket", exc)
        return self._search_inventory(geometry, start, end, max_scene_cloud, limit)

    def get(self, scene_id: str) -> Scene:
        match = SCENE_ID.match(scene_id)
        if not match:
            raise SceneNotFoundError(scene_id)
        zone, band, square, day, _ = match.groups()
        when = datetime.strptime(day, "%Y%m%d")
        folder = f"{PREFIX}/{int(zone)}/{band}/{square}/{when.year}/{when.month}/{scene_id}"
        url = f"{BUCKET}/{folder}/{scene_id}.json"
        return parse_item(json.loads(_get(url, self.timeout)), "aws-inventory")

    def _search_stac(
        self, geometry: dict, start: date, end: date, max_cloud: float, limit: int
    ) -> list[Scene]:
        body = {
            "collections": ["sentinel-2-l2a"],
            "intersects": geometry,
            "datetime": f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
            "query": {"eo:cloud_cover": {"lte": max_cloud}},
            "sortby": [{"field": "properties.datetime", "direction": "desc"}],
            "limit": min(limit * 2, 100),
        }
        payload = json.loads(
            _get(f"{self.earth_search_url}/search", self.timeout, json.dumps(body).encode())
        )
        scenes = [parse_item(item, "earth-search") for item in payload.get("features", [])]
        return [s for s in dedupe_scenes(scenes) if ALLOWED_HOSTS.match(s.red.href)][:limit]

    def _existing_tiles(self, geometry: dict) -> list[str]:
        tiles: list[str] = []
        for tile in dict.fromkeys(tiles_for_geometry(geometry)):
            if tile not in self._tile_exists:
                prefix = f"{PREFIX}/{tile[:-3]}/{tile[-3]}/{tile[-2:]}/"
                xml = _get(
                    f"{BUCKET}/?list-type=2&delimiter=/&max-keys=1&prefix={prefix}", self.timeout
                )
                self._tile_exists[tile] = b"<CommonPrefixes>" in xml
            if self._tile_exists[tile]:
                tiles.append(tile)
        return tiles

    def _search_inventory(
        self, geometry: dict, start: date, end: date, max_cloud: float, limit: int
    ) -> list[Scene]:
        candidates: list[str] = []
        for tile in self._existing_tiles(geometry):
            zone, band, square = tile[:-3], tile[-3], tile[-2:]
            for year, month in reversed(_months(start, end)):
                prefix = f"{PREFIX}/{zone}/{band}/{square}/{year}/{month}/"
                xml = _get(f"{BUCKET}/?list-type=2&delimiter=/&prefix={prefix}", self.timeout)
                # Respuesta de S3 por TLS desde un host fijo de AWS (no es entrada de usuario).
                nodes = ET.fromstring(xml).findall("s3:CommonPrefixes/s3:Prefix", S3_NS)  # noqa: S314
                for node in nodes:
                    scene_id = (node.text or "").rstrip("/").split("/")[-1]
                    match = SCENE_ID.match(scene_id)
                    if match and start <= datetime.strptime(match.group(4), "%Y%m%d").date() <= end:
                        candidates.append(scene_id)
        scenes: list[Scene] = []
        for scene_id in sorted(set(candidates), key=lambda s: s.split("_")[2], reverse=True):
            if len(scenes) >= limit * 3:
                break
            try:
                scene = self.get(scene_id)
            except (SceneNotFoundError, CatalogUnavailableError, KeyError, ValueError) as exc:
                log.warning("Ítem descartado %s: %s", scene_id, exc)
                continue
            if scene.cloud_cover <= max_cloud:
                scenes.append(scene)
        # Varios tiles pueden cubrir el lote: se conservan todos (el análisis descarta los que
        # no tienen datos sobre el polígono) y se ordenan por fecha.
        return sorted(scenes, key=lambda s: s.acquired_at, reverse=True)[: limit * 2]
