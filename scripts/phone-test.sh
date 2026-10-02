#!/usr/bin/env bash
# Prueba del Escáner de Bovinos desde un celular real.
#
# Levanta el stack local con Docker, abre un túnel HTTPS temporal de Cloudflare (la cámara del
# celular solo funciona en HTTPS), configura WEB_ORIGIN con esa URL para que los links de
# invitación apunten al túnel, verifica todos los servicios e imprime la URL para el celular.
# No hace deploy: el túnel muere al cortar este script (Ctrl+C) y la URL cambia en cada corrida.
#
# Uso:  ./scripts/phone-test.sh            (primera vez construye las imágenes: ~10-15 min)
#       ./scripts/phone-test.sh --no-build (si las imágenes ya están construidas)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BUILD="--build"
[[ "${1:-}" == "--no-build" ]] && BUILD=""
WEB_PORT="${WEB_PORT:-3000}"
TUNNEL_LOG="$(mktemp -t agro-tunnel.XXXXXX)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. Requisitos -------------------------------------------------------------------------------
say "1/6 Verificando requisitos"
command -v docker >/dev/null || fail "Falta Docker (Docker Desktop o Docker Engine)."
docker info >/dev/null 2>&1 || fail "Docker está instalado pero no está corriendo."
docker compose version >/dev/null 2>&1 || fail "Falta 'docker compose' (v2)."
if ! command -v cloudflared >/dev/null; then
  fail "Falta cloudflared. Instalalo:
  macOS:   brew install cloudflared
  Windows: winget install --id Cloudflare.cloudflared
  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
fi
echo "Docker y cloudflared OK"

# --- 2. Túnel HTTPS ------------------------------------------------------------------------------
say "2/6 Abriendo túnel HTTPS (Cloudflare Quick Tunnel, gratis y sin cuenta)"
cloudflared tunnel --no-autoupdate --url "http://localhost:${WEB_PORT}" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
cleanup() {
  kill "$TUNNEL_PID" 2>/dev/null || true
  echo
  echo "Túnel cerrado. El stack sigue corriendo (docker compose down para apagarlo)."
}
trap cleanup EXIT
URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  [[ -n "$URL" ]] && break
  kill -0 "$TUNNEL_PID" 2>/dev/null || { cat "$TUNNEL_LOG"; fail "cloudflared terminó sin abrir el túnel."; }
  sleep 1
done
[[ -n "$URL" ]] || { cat "$TUNNEL_LOG"; fail "No se obtuvo la URL del túnel."; }
echo "Túnel: $URL"

# --- 3. Variables --------------------------------------------------------------------------------
say "3/6 Configurando .env (WEB_ORIGIN = URL del túnel)"
[[ -f .env ]] || { cp .env.example .env; echo "Se creó .env a partir de .env.example"; }
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    # Portable entre GNU y BSD sed.
    sed -i.bak -E "s|^${key}=.*|${key}=${value}|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$key" "$value" >>.env
  fi
}
set_env WEB_ORIGIN "$URL"
echo "WEB_ORIGIN=$URL"

# --- 4. Stack ------------------------------------------------------------------------------------
say "4/6 Levantando el stack (docker compose up -d ${BUILD})"
# shellcheck disable=SC2086
docker compose up -d $BUILD
# La API lee WEB_ORIGIN al arrancar (links de invitación): se recrea con el valor nuevo.
docker compose up -d --force-recreate --no-deps api >/dev/null

# --- 5. Verificaciones ---------------------------------------------------------------------------
say "5/6 Verificando servicios"
wait_for() {
  local name="$1" cmd="$2"
  for _ in $(seq 1 90); do
    if eval "$cmd" >/dev/null 2>&1; then echo "  ✓ $name"; return 0; fi
    sleep 2
  done
  fail "$name no respondió (docker compose logs para ver el detalle)."
}
wait_for "API (/health/ready: base de datos, Redis, almacenamiento)" \
  "docker compose exec -T api wget -qO- http://127.0.0.1:4000/health/ready"
wait_for "Servicio de IA (YOLOX)" \
  "docker compose exec -T ai-service python -c \"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health/ready',timeout=3)\""
wait_for "Worker (procesa verificaciones y escaneos)" \
  "[ \"\$(docker compose ps worker --format '{{.State}}')\" = running ]"
wait_for "Web local (http://localhost:${WEB_PORT})" "curl -fsS http://localhost:${WEB_PORT}/login"
wait_for "Web por el túnel ($URL)" "curl -fsS $URL/login"
wait_for "Modelo del escáner por el túnel" "curl -fsSI $URL/models/yolox_nano.onnx"
wait_for "Motor ONNX Runtime por el túnel" "curl -fsSI $URL/ort/ort.webgpu.min.mjs"
grep -q "^WEB_ORIGIN=${URL}$" .env || fail "WEB_ORIGIN no quedó configurado."

# --- 6. Instrucciones ----------------------------------------------------------------------------
say "6/6 Listo"
PASSWORD="$(grep -E '^SEED_DEMO_PASSWORD=' .env | cut -d= -f2- || true)"
cat <<EOF

  URL para el CELULAR:   $URL
  URL para la PC:        $URL   (o http://localhost:${WEB_PORT})

  Entidad (PC):  maria.lopez@bancodelcampo.com.ar  /  ${PASSWORD:-<SEED_DEMO_PASSWORD de .env>}

  1. En la PC: Solicitudes de garantía → Nueva solicitud (tipo Bovinos) → copiá el link de invitación.
  2. Mandate el link al celular (WhatsApp/mail) y abrilo: aceptá y creá tu acceso de productor.
  3. Declará establecimiento y rodeo → "Escáner de bovinos" → "Escanear rodeo".
  Guía completa: docs/phone-testing.md

  Dejá esta terminal abierta mientras probás (Ctrl+C cierra el túnel).
EOF
if command -v qrencode >/dev/null; then qrencode -t ANSIUTF8 "$URL"; fi
wait "$TUNNEL_PID"
