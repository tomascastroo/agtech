"""Configuración del servicio, leída exclusivamente desde variables de entorno."""

from functools import lru_cache

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

    @property
    def auth_enabled(self) -> bool:
        return bool(self.token.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and not settings.auth_enabled:
        raise RuntimeError("AI_SERVICE_TOKEN es obligatorio en producción")
    return settings
