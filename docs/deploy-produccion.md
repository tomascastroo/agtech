# Despliegue en un servidor (piloto con una entidad real)

Esta guía deja AgroGarantías funcionando en un servidor propio, con HTTPS, sin datos demo y con backups diarios. Alcanza para un piloto con una entidad. No es una arquitectura de alta disponibilidad (ver "Qué no cubre").

## 1. Qué hace falta

- **Un servidor Linux** con Docker y Docker Compose v2.24 o superior.
  - Sugerido para el piloto: 4 vCPU, 8 GB de RAM y 80 GB de disco SSD.
  - El servicio de visión (YOLOX) es el que más memoria usa.
- **Dos dominios** apuntando a la IP del servidor (registros DNS tipo A):
  - `APP_DOMAIN` (por ejemplo `app.agrogarantias.com.ar`): la web del banco, el productor y el inspector.
  - `FILES_DOMAIN` (por ejemplo `archivos.agrogarantias.com.ar`): fotos, documentos e informes, servidos con URLs firmadas que vencen a los pocos minutos.
- **Los puertos 80 y 443 abiertos.** No hay que abrir ningún otro: la base de datos, Redis, el almacenamiento, la API y el servicio de visión quedan en la red interna de Docker.

## 2. Primera instalación

```bash
git clone <repo> /opt/agrogarantias && cd /opt/agrogarantias
cp infra/prod/.env.example infra/prod/.env
# Completar APP_DOMAIN, FILES_DOMAIN y ACME_EMAIL, y reemplazar los valores CAMBIAR:
scripts/prod/gen-secrets.sh        # imprime secretos aleatorios para pegar en infra/prod/.env
scripts/prod/deploy.sh             # construye, levanta y espera a que la web responda
```

En el primer arranque:
- Caddy obtiene los certificados HTTPS de Let's Encrypt.
- El servicio `migrate` aplica las migraciones y carga **solo el catálogo base**: roles, tipos de activo, fuentes de evidencia y reglas de alerta. No carga datos demo.

## 3. Alta de la entidad y sus usuarios

```bash
scripts/prod/admin.sh create-organization --name "Banco Piloto" --kind BANK \
  --tax-id 30-12345678-9 --admin-email ana@bancopiloto.com.ar --admin-name "Ana Pérez"

scripts/prod/admin.sh create-user --organization 30-12345678-9 \
  --email luis@bancopiloto.com.ar --name "Luis Gómez" --role RISK_ANALYST

scripts/prod/admin.sh list-organizations
```

- **Contraseña inicial:** se genera al azar y se muestra una sola vez. Entregala por un canal seguro.
- **Roles disponibles:** `ADMIN`, `RISK_ANALYST`, `AUDITOR` y `VIEWER`. Los productores no se dan de alta así: se crean solos al aceptar la invitación de una solicitud.
- **Auditoría:** cada alta queda registrada en `audit_logs`.

## 4. Backups

```bash
scripts/prod/backup.sh                   # base (pg_dump) + archivos, con SHA-256
scripts/prod/restore.sh backups/AAAAMMDD-HHMM   # pide confirmación: reemplaza los datos actuales
```

Para programarlo todos los días, con `crontab -e`:

```
0 3 * * * /opt/agrogarantias/scripts/prod/backup.sh >> /var/log/agro-backup.log 2>&1
```

- **Copia fuera del servidor:** los backups quedan en `backups/` y se conservan 14 días. Copialos a otro lugar (otro servidor o un bucket) con `rclone` o similar. Un backup que vive solo en el mismo servidor no protege ante la pérdida del servidor.
- **Restauración de prueba:** hacé una al menos una vez antes de arrancar el piloto.

## 5. Actualizar

```bash
git pull && scripts/prod/deploy.sh
```

Las migraciones se aplican solas al arrancar (`migrate`). Hacé un backup antes de cada actualización.

## 6. Monitoreo mínimo

- **Salud:** `https://APP_DOMAIN/login` responde 200 si la web y la API están arriba. Configurá un monitor externo (UptimeRobot, Better Stack o similar) contra esa URL.
- **Logs:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file infra/prod/.env logs -f api worker`. Son JSON y no incluyen los tokens de los links de productor o inspector.
- **Disco:** vigilá el volumen de archivos y los backups.

## 7. Qué controla esta configuración

| Control | Cómo |
|---|---|
| HTTPS obligatorio | Caddy redirige HTTP a HTTPS y envía HSTS |
| Secretos fuertes | La API no arranca en producción con secretos de desarrollo ni sin `COOKIE_SECURE=true` |
| Sin datos ficticios | `SEED_DEMO_PASSWORD` vacío, `DEMO_MODE=disabled` y sin credenciales demo en el login |
| Superficie mínima | Solo Caddy publica puertos (80/443) |
| Archivos privados | Los archivos solo se descargan con URL firmada y con vencimiento: sin firma, 403 |

Probado en local: HTTPS con certificado (emisor interno de Caddy para `*.localhost`), redirección de HTTP a HTTPS, HSTS, y URL firmada a través del proxy (200 con firma, 403 sin firma).

## 8. Qué no cubre (decidir según el piloto)

- **Alta disponibilidad:** es un solo servidor. Si se cae, se cae el servicio. Para producción plena conviene base de datos y almacenamiento gestionados (por ejemplo, PostgreSQL gestionado y un bucket S3) y al menos dos instancias de la web y la API.
- **Requisitos de la entidad:** muchas entidades financieras exigen evaluar al proveedor tecnológico (requisitos del BCRA sobre gestión de riesgos de tecnología y tercerización), y pueden pedir alojamiento en una nube en particular, una ubicación de datos o pruebas de penetración externas. Preguntalo al inicio.
- **Integración SENASA:** requiere convenio y credenciales. Sin ellas, el registro se muestra como SIMULADO (con `REGISTRY_PROVIDER=mock`) o sin conexión.
- **Envío de emails:** las invitaciones son links que se comparten por el canal que elija la entidad. No hay un servidor de correo configurado.
