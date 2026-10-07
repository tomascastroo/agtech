#!/usr/bin/env bash
# Herramienta de administración dentro del contenedor de la API (alta de organización y usuarios).
#   scripts/prod/admin.sh create-organization --name "Banco X" --kind BANK --tax-id 30-12345678-9 \
#     --admin-email ana@bancox.com.ar --admin-name "Ana Pérez"
#   scripts/prod/admin.sh create-user --organization 30-12345678-9 --email luis@bancox.com.ar \
#     --name "Luis Gómez" --role RISK_ANALYST
#   scripts/prod/admin.sh list-organizations
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file infra/prod/.env \
  exec -T api node dist/database/admin-cli.js "$@"
