#!/usr/bin/env bash
# Construye y levanta (o actualiza) AgroGarantías en el servidor.
#   scripts/prod/deploy.sh            # primera vez o actualización
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=infra/prod/.env
[ -f "$ENV_FILE" ] || { echo "Falta $ENV_FILE (copiá infra/prod/.env.example)"; exit 1; }
if grep -q '=CAMBIAR' "$ENV_FILE"; then
  echo "Hay valores CAMBIAR en $ENV_FILE: generá secretos con scripts/prod/gen-secrets.sh"; exit 1
fi
compose() { docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"; }
compose build
compose up -d
echo "Esperando a que la web responda..."
for _ in $(seq 1 60); do
  if compose ps web --format '{{.Health}}' | grep -q healthy; then break; fi
  sleep 5
done
compose ps
# shellcheck disable=SC1090
source "$ENV_FILE"
echo "Listo: https://${APP_DOMAIN}"
echo "Primera vez: creá la organización con scripts/prod/admin.sh create-organization ..."
