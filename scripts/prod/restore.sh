#!/usr/bin/env bash
# Restaura un backup creado por backup.sh. BORRA los datos actuales: pide confirmación.
#   scripts/prod/restore.sh backups/20261007-0300
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR=${1:?Indicá la carpeta del backup}
[ -f "$DIR/db.dump" ] && [ -f "$DIR/files.tar.gz" ] || { echo "Backup incompleto en $DIR"; exit 1; }
(cd "$DIR" && sha256sum -c SHA256SUMS)
read -r -p "Esto reemplaza la base y los archivos actuales por $DIR. Escribí RESTAURAR: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado"; exit 1; }
# shellcheck disable=SC1091
source infra/prod/.env
compose() { docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file infra/prod/.env "$@"; }
compose stop api worker web
compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$DIR/db.dump"
VOLUME=$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)minio-data$' | head -1)
compose stop minio
docker run --rm -v "$VOLUME":/data -v "$PWD/$DIR":/backup:ro alpine \
  sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/files.tar.gz -C /data'
compose up -d
echo "Restaurado desde $DIR"
