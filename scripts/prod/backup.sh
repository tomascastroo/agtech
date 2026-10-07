#!/usr/bin/env bash
# Backup de la base (pg_dump comprimido) y de los archivos (fotos, documentos, informes).
# Programarlo con cron, por ejemplo todos los días a las 3:
#   0 3 * * * /opt/agrogarantias/scripts/prod/backup.sh >> /var/log/agro-backup.log 2>&1
# Conserva BACKUP_KEEP_DAYS días (14 por defecto). Copiá backups/ fuera del servidor.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck disable=SC1091
source infra/prod/.env
STAMP=$(date +%Y%m%d-%H%M)
DIR=backups/$STAMP
mkdir -p "$DIR"
compose() { docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file infra/prod/.env "$@"; }
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom > "$DIR/db.dump"
VOLUME=$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)minio-data$' | head -1)
docker run --rm -v "$VOLUME":/data:ro -v "$PWD/$DIR":/backup alpine \
  tar czf /backup/files.tar.gz -C /data .
sha256sum "$DIR"/* > "$DIR/SHA256SUMS"
find backups -mindepth 1 -maxdepth 1 -type d -mtime +"${BACKUP_KEEP_DAYS:-14}" -exec rm -rf {} +
echo "Backup listo en $DIR ($(du -sh "$DIR" | cut -f1))"
