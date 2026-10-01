from __future__ import annotations

import logging
import re
import time
import uuid

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from . import __version__
from .api.routes import router
from .api.schemas import HealthResponse
from .config import get_settings
from .logging_setup import configure_logging, request_id_var

logger = logging.getLogger("agro_vision")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="AgroGarantías — Servicio de visión computacional",
        version=__version__,
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url=None,
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if REQUEST_ID_PATTERN.match(incoming) else str(uuid.uuid4())
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            response: Response = await call_next(request)
        except Exception:
            logger.exception("unhandled_error", extra={"context": {"path": request.url.path}})
            response = JSONResponse({"detail": "Error interno"}, status_code=500)
        finally:
            request_id_var.reset(token)
        response.headers["x-request-id"] = request_id
        if not request.url.path.startswith("/health"):
            logger.info(
                "request",
                extra={
                    "context": {
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "duration_ms": int((time.perf_counter() - started) * 1000),
                    }
                },
            )
        return response

    @app.get("/health/live", response_model=HealthResponse, include_in_schema=False)
    def live() -> HealthResponse:
        return HealthResponse(status="ok", service="ai-service", version=__version__)

    @app.get("/health/ready", response_model=HealthResponse, include_in_schema=False)
    def ready() -> HealthResponse:
        return HealthResponse(status="ok", service="ai-service", version=__version__)

    app.include_router(router)
    return app


app = create_app()
