#!/usr/bin/env bash
# Genera secretos aleatorios para infra/prod/.env (se imprimen; redirigí a un archivo seguro).
#   scripts/prod/gen-secrets.sh >> infra/prod/.env
set -euo pipefail
rand() { openssl rand -base64 "$1" | tr -d '\n/+=' | cut -c1-"$2"; }
echo "POSTGRES_PASSWORD=$(rand 48 40)"
echo "MINIO_ROOT_PASSWORD=$(rand 48 40)"
echo "JWT_ACCESS_SECRET=$(rand 64 64)"
echo "AI_SERVICE_TOKEN=$(rand 48 48)"
