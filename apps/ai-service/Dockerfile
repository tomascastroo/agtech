# syntax=docker/dockerfile:1
# Servicio de visión computacional (FastAPI + OpenCV headless), dependencias fijadas con uv.lock.

FROM python:3.13-slim AS build
# Opcional: CA adicional para redes con proxy de inspección TLS (no se copia a la imagen final).
#   docker build --secret id=extra_ca,src=/ruta/ca.crt ...
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then cat /run/secrets/extra_ca >> /etc/ssl/certs/ca-certificates.crt; fi
ENV PIP_CERT=/etc/ssl/certs/ca-certificates.crt SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
RUN pip install --no-cache-dir uv==0.8.17
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-editable
# Pesos YOLOX-S oficiales (Apache-2.0) desde la release de GitHub, verificados por SHA-256.
COPY scripts/download_models.py ./scripts/
RUN /app/.venv/bin/python scripts/download_models.py yolox_s --dir /app/models

FROM python:3.13-slim AS runtime
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1
# libexpat: dependencia nativa de GDAL incluido en la rueda de rasterio (lectura de COG Sentinel-2).
# INSTALL_SYSTEM_LIBS=false solo para entornos sin acceso a los repositorios de Debian (la
# biblioteca debe montarse en el contenedor).
ARG INSTALL_SYSTEM_LIBS=true
RUN --mount=type=secret,id=extra_ca,required=false \
    [ "$INSTALL_SYSTEM_LIBS" != "true" ] || { sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && CA=""; if [ -f /run/secrets/extra_ca ]; then CA="-o Acquire::https::CAInfo=/run/secrets/extra_ca"; fi \
    && apt-get $CA update && apt-get $CA install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*; }
RUN useradd --system --uid 10001 --no-create-home agro
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY --from=build /app/models /app/models
ENV AI_SERVICE_MODELS_DIR=/app/models
USER agro
EXPOSE 8000
CMD ["uvicorn", "agro_vision.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
