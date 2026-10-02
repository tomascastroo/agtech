# Desarrollo por producto: bovinos y agricultura

AgroGarantías es **una sola aplicación**. El trabajo de cada producto se separa por branch, no
copiando servicios:

```
                main  (plataforma compartida, siempre estable)
                 │
       ┌─────────┴──────────┐
       ↓                    ↓
 feature/bovinos      feature/agricultura
```

- **`feature/bovinos`:** solo trabajo ganadero, que se detalla abajo.
- **`feature/agricultura`:** creada desde `main`. Incluye Sentinel-2, NDVI,
  cultivos y los demás activos no bovinos.
- **Llegada a `main`:** cada branch llega a `main` por PR, sin squash y sin reescribir historial.
- **Cambios en lo compartido:** un cambio que necesitan los dos productos se hace en un PR
  propio contra `main`, y después cada branch mergea `main`. No se duplica.

## Qué es de cada producto

La arquitectura existente ya separa por módulo y por estrategia de verificación (una por tipo de
activo). No se movieron archivos para forzar una estructura `bovine/`: hacerlo generaría
conflictos de renombre con cualquier trabajo en paralelo.

### Bovinos (`feature/bovinos`)

| Capa | Dónde |
|---|---|
| **Escáner** (fijo/paso, barrido, corral, fotos, manga + RFID), sesiones, cuadros y conteo oficial | `apps/api/src/modules/scans/` · migraciones `1795…-bovine-scanner`, `1796…-livestock-scanner-modes`, `1797…-chute-rfid` |
| **RFID**, animales, visual + RFID y monitoreo del rodeo | `apps/api/src/modules/animals/` |
| **Verificación ganadera** | `verification/application/pipeline/strategies/livestock-counting.strategy.ts` · `verification/domain/unique-count.ts` · `verification/domain/livestock-history.ts` |
| **Tipos de producción** (feedlot, cría, pastoreo) | `assets/domain/livestock-profile.ts` |
| **Visión bovina** (servicio de IA) | `domain/{tracking,pen_count,scan_processing,livestock,counting}.py` · `/v1/scans/process`, `/v1/animals/count` · `/v1/scans/track` · `scripts/generate_{passage,sweep,chute}_video.py`, `generate_tracker_fixture.py`, `generate_cattle_composites.py`, `benchmark_cattle.py` |
| **Web: celular** | `apps/web/src/lib/scanner/` · `components/scanner/` · `app/escaner/` |
| **Web: banco** | `components/domain/{ScansPanel,LivestockMonitorPanel,RfidReadings,BovineIndividualsPanel}.tsx` |
| **Tests** | `api/test/{bovine-scanner,chute-rfid}.int-spec.ts` · `web/e2e/04-bovine-scanner.spec.ts`, `05-livestock-modes.spec.ts`, `06-chute-rfid.spec.ts` · `ai-service/tests/test_{tracking,scans,pen_count,counting}.py` |
| **Docs** | `docs/scanner.md` · `docs/phone-testing.md` · `scripts/phone-test.sh` |

### Agricultura (`feature/agricultura`)

| Capa | Dónde |
|---|---|
| **Satélite** (Sentinel-2, NDVI, serie temporal) | `apps/api/src/modules/satellite/` · `verification/.../vegetation-area.strategy.ts` |
| **Servicio de IA** | `domain/sentinel2.py` · `infrastructure/sentinel_*.py` · `/v1/satellite/*` · `scripts/build_satellite_fixtures.py` |
| **Activos no bovinos** del catálogo | `CULTIVOS`, `VINEDOS`, `FRUTALES`, `FORESTAL`, `SILOBOLSAS`, `SILOS`, `MAQUINARIA`, `INFRAESTRUCTURA`, `RESERVORIOS`, `OTROS` |

### Compartido (cambios por PR propio contra `main`)

- **Plataforma:**
  - autenticación, usuarios, roles y organizaciones (multi-tenancy);
  - auditoría y almacenamiento;
  - salud, colas, configuración y la API base.
- **Negocio:** establecimientos, solicitudes de garantía, portal del productor, documentos (OCR),
  datos externos (SENASA), alertas, scoring, reportes y monitoreo programado.
- **Evidencia y verificación (lo transversal):** el registro de evidencia inmutable, el pipeline
  con sus estrategias, la calidad de imagen y el puerto de visión `ComputerVisionProvider`.
  En el servicio de IA: `domain/{detection,image_quality,change_detection,documents,models_registry}.py`.
- **Dispositivos:** cámaras y lectores.
- **Web:** componentes UI generales (`components/ui`), el cliente API y los badges de estado.
- **Infraestructura:** Docker, compose, scripts, seed demo y la infraestructura de tests.

## Archivos compartidos que atienden a los dos productos

Se mantienen compartidos. Cada producto toca solo su rama del archivo.

| Archivo | Qué mezcla | Regla |
|---|---|---|
| `api/.../guarantee-requests/application/guarantee-requests.service.ts` | Detalle de la solicitud: escaneos y perfil ganadero (BOVINOS) junto con los datos del lote (vegetación) | Agregar campos por tipo de activo detrás de su condición. No cambiar lo común sin PR a `main` |
| `api/.../assets/domain/{asset.types,asset-status}.ts`, `evidence-guidance.ts` | Catálogo de todos los tipos de activo | Cada producto edita solo sus entradas |
| `api/.../reports/application/report-data.builder.ts`, `alerts/domain/alert-evaluation.ts` | Secciones o reglas por estrategia | Ídem |
| `api/.../computer-vision/` (puerto y adaptadores) | Conteo de animales y escaneo junto con análisis de imagen y detección de cambios | Métodos por capacidad. Agregar, no modificar los del otro producto |
| `api/src/database/seed/` | Datos demo de todos los activos | Cada producto, sus datos |
| `ai-service/src/agro_vision/api/{routes,schemas}.py` | Endpoints de los dos productos | Ídem |
| `web/src/lib/api/types.ts` | Tipos de toda la API | Agregar tipos nuevos al final de su bloque |
| `web/src/app/(app)/assets/[id]/AssetDetailView.tsx`, `requests/[id]/RequestDetailView.tsx`, `settings/SettingsView.tsx` | Pestañas o paneles por tipo de activo | Cada panel detrás de su condición (`LIVESTOCK` / `BOVINOS`, `VEGETATION_AREA`) |
| `docs/architecture.md`, `README.md` | Todo el producto | Secciones por producto |

Conviene que estos archivos vayan a `main` seguido (PR chicos), para que la otra branch los
reciba pronto y los conflictos sean mínimos.

## Comandos

```bash
# Seguir con bovinos
git fetch origin
git checkout feature/bovinos
git pull origin feature/bovinos
git merge origin/main                     # traer lo compartido nuevo (merge, sin rebase)

# Checks antes de cada push
pnpm infra:up                             # PostgreSQL, Redis y MinIO para la integración
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm format:check
pnpm test:ai && pnpm lint:ai              # servicio de IA
git push origin feature/bovinos           # nunca --force

# Llevar bovinos a main: PR feature/bovinos → main (merge commit, sin squash)

# Trabajar en agricultura (la branch ya existe, creada desde main)
git checkout feature/agricultura && git pull origin feature/agricultura

# Arreglo de algo compartido: branch chica desde main → PR a main → merge de main en cada feature
git checkout -b chore/<tema> origin/main
```
