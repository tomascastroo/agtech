"""Configuración del servicio, leída exclusivamente desde variables de entorno."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_SERVICE_", extra="ignore")

    # Token compartido con la API. Vacío solo se permite en entorno de desarrollo/test.
    token: SecretStr = Field(default=SecretStr(""))
    environment: str = "development"
    max_upload_bytes: int = 25 * 1024 * 1024
    max_image_side_px: int = 12_000
    log_level: str = "INFO"

    # Conteo de animales: `yolox` (detector real, pesos ONNX) o `classical` (segmentación ExG,
    # válida sólo para las escenas sintéticas de desarrollo).
    detector: Literal["yolox", "classical"] = "yolox"
    models_dir: Path = Path("models")
    detector_model: str = "yolox_s"
    # Umbral y clases elegidos con el benchmark de scripts/benchmark_cattle.py.
    # Fotos completas: umbral que minimiza el MAE de conteo en Open Images (validation).
    detector_score_threshold: float = Field(default=0.12, ge=0.05, le=0.95)
    # Escenas grandes procesadas por mosaico (rodeos densos): calibrado en escenas de El Trébol.
    detector_tiled_score_threshold: float = Field(default=0.4, ge=0.05, le=0.95)
    detector_class_set: Literal["cow", "livestock"] = "livestock"
    detector_tile_size: int = Field(default=640, ge=0)
    detector_tile_overlap: float = Field(default=0.2, ge=0, le=0.5)
    # El mosaico se activa cuando el lado mayor supera tile_size × este factor.
    detector_tile_min_ratio: float = Field(default=2.5, ge=1)
    detector_threads: int = Field(default=0, ge=0)

    # Escáner de bovinos: reprocesamiento oficial de cuadros muestreados. Umbral NO calibrado
    # con escaneos de campo (ver docs/scanner.md).
    scan_max_frames: int = Field(default=1200, ge=10, le=5000)
    scan_max_frame_bytes: int = 3 * 1024 * 1024
    scan_max_frame_side_px: int = Field(default=1280, ge=320, le=3840)
    scan_score_threshold: float = Field(default=0.15, ge=0.05, le=0.95)

    # Sentinel-2 L2A (AWS Open Data).
    sentinel_catalog: Literal["auto", "earth-search", "aws-inventory"] = "auto"
    earth_search_url: str = "https://earth-search.aws.element84.com/v1"
    ndvi_vegetation_threshold: float = Field(default=0.4, ge=0, le=1)
    max_cloud_cover: float = Field(default=20.0, ge=0, le=100)
    min_valid_fraction: float = Field(default=0.6, ge=0, le=1)

    @property
    def auth_enabled(self) -> bool:
        return bool(self.token.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and not settings.auth_enabled:
        raise RuntimeError("AI_SERVICE_TOKEN es obligatorio en producción")
    return settings
