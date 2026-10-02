# Escáner de Bovinos

El productor abre la cámara del celular y la usa como escáner: el sistema detecta bovinos en
vivo, los sigue entre cuadros y cuenta cada animal **una vez** cuando cruza una línea. Al
terminar, el escaneo se sincroniza (aunque se haya hecho sin señal) y el **servidor recalcula el
conteo oficial**. El número del celular es solo una referencia en pantalla: nunca es el
resultado oficial.

## Modos

| Modo | Uso | Qué cuenta | Cómo lo usa la verificación |
|---|---|---|---|
| **Escáner fijo / paso** (`FIXED`) | Celular quieto frente a una manga, tranquera o puerta de corral | Animales que cruzan la línea vertical (conteo neto) | **Comparable** con lo declarado (supone que pasa todo el rodeo) |
| **Escáner móvil / barrido** (`SWEEP`) | Operador quieto que gira despacio sobre el rodeo | Animales que cruzan la línea central mientras la cámara gira (conteo neto) | **Cota inferior**: si da menos que lo declarado, la verificación es *no concluyente* (cobertura parcial), no *rechazada* |
| **Escáner de corral** (`PEN`) | Animales **quietos**: corral, aguada, agrupamiento. Se apunta al grupo y, si no entra, se recorre despacio | **Animales únicos** observados (sin línea): un animal que se vuelve a ver se cuenta una vez | **Cota inferior** (los tapados por otros no se ven) |
| **Analizar foto** (`PHOTO`) | Una o varias fotos del mismo grupo (hasta 12) | **Animales únicos**: solo se suman zonas de fotos que se solapan | **Cota inferior** |

Avisos en vivo:
- **"Girá más despacio"**: velocidad de giro por encima de 45°/s, medida con giroscopio o brújula.
- **"Quedate quieto"**: el GPS registró un desplazamiento de más de 15 m durante el barrido.
- **"Mantené el celular quieto"**: el celular se movió en el modo fijo.
- **Arco barrido**: en grados, medido con la brújula.

## Arquitectura

```
CELULAR  /escaner/{solicitud}  (Next.js, pantalla completa, fuera del marco del portal)
 ├─ getUserMedia (cámara trasera) + requestVideoFrameCallback
 ├─ ONNX Runtime Web (WebGPU → WASM; en iOS solo WASM) + YOLOX-Nano 416 lib/scanner/detector.ts, yolox.ts
 ├─ Tracker estilo ByteTrack + conteo neto por línea                    lib/scanner/tracker.ts
 ├─ Cuadros muestreados 6/s, JPEG 640 px, SHA-256 → IndexedDB           lib/scanner/session.ts, store.ts
 ├─ Cuadros representativos cada 5 s (máx. 12), JPEG 1280 px
 ├─ GPS (inicio, desplazamiento), brújula/giroscopio, Wake Lock         lib/scanner/sensors.ts
 └─ Sincronización automática reanudable                                lib/scanner/sync.ts
        │ POST  /api/producer/me/requests/{id}/scans                (idempotente por id del celular)
        │ GET   /api/producer/me/requests/{id}/scans/{scanId}       (qué cuadros ya tiene el servidor)
        │ POST  …/scans/{scanId}/frames                             (por tipo+índice, con SHA-256)
        │ POST  …/scans/{scanId}/finalize                           (409 si faltan cuadros)
        ▼
API (NestJS, módulo scans) → scan_sessions, scan_frames (append-only) → MinIO/S3
        ▼ cola BullMQ "scans"
WORKER → ai-service POST /v1/scans/process
        YOLOX-S por cuadro → compensación de movimiento de cámara (flujo óptico + RANSAC,
        solo barrido) → mismo tracker (Python) → conteo neto oficial + calidad
        ▼
Evidencia inmutable type=SCAN (manifiesto JSON con el hash de cada cuadro y el resultado)
        ▼
Verificación (estrategia ganadera existente): conteo oficial del escaneo, agrupado con otras
evidencias para no duplicar; base del conteo CENSO (fijo) o COTA INFERIOR (barrido/fotos).
Si la solicitud ya fue enviada, un escaneo nuevo dispara una nueva verificación.
```

Qué se guarda y qué no:
- **No se guarda el video completo.** Se guardan los cuadros muestreados (alrededor de 6 por
  segundo, 640 px), hasta 12 cuadros representativos y un manifiesto con el SHA-256 de cada
  cuadro.
- Del celular se guarda su conteo preliminar, el backend (WebGPU o WASM), el modelo, los datos
  de GPS (inicio, desplazamiento, precisión), los del rumbo (inicio y arco) y las advertencias.
- El servidor verifica el hash de cada cuadro antes de procesarlo. Los cuadros no se pueden
  modificar (hay un trigger en la base).

### Memoria en el celular y escaneos cortados

- **iPhone/iPad, modo de bajo consumo:**
  - **Motor:** se usa WASM y no WebGPU. ONNX Runtime con WebGPU en WebKit hacía que iOS cerrara
    la página ("Ocurrió un problema varias veces").
  - **Paquete:** el liviano solo-WASM (`ort.wasm.min.mjs`, motor de ~14 MB) en lugar del
    asyncify de ~27 MB.
  - **Cámara:** 640×480.
  - **Inferencia:** como máximo 4 por segundo. El muestreo para el servidor sigue en 6/s.
  - **Para probar WebGPU:** agregá `?ia=webgpu` a la URL.
- **Precarga de motor y modelo:** baja de a un archivo, sin picos de memoria.
- **Cuadros en vuelo acotados:** como máximo hay 4 cuadros codificándose o guardándose a la vez.
  Si el teléfono no da abasto se saltea el cuadro (queda una advertencia) en lugar de acumular
  imágenes en memoria.
- **Una imagen a la vez:** la subida y la renumeración leen de IndexedDB de a un cuadro; nunca
  cargan todo el escaneo.
- **Mientras se escanea no se sube nada.**
- **Escaneos cortados:** el escaneo en curso se actualiza en el teléfono cada 10 s. Si la página
  se cierra sin FINALIZAR (el sistema la mató, se recargó, se cerró la pestaña), a los 60 s la
  sincronización lo cierra con los cuadros guardados, lo marca "Escaneo interrumpido" y lo sube.
  El conteo oficial lo hace igual el servidor. Si no llegó a guardarse ningún cuadro, se
  descarta.
- **Sesión:**
  - la sincronización en segundo plano nunca navega a /login (eso cortaba el escaneo);
  - si la sesión venció, el escaneo queda pendiente hasta volver a ingresar;
  - reusar un refresh token rotado hace menos de 60 s (dos pestañas, o una recarga tras un
    cierre) se trata como carrera y no revoca la sesión. Pasado ese tiempo, sí se trata como robo.

### Escáner de corral (animales quietos)

Mismo pipeline que los otros modos (cuadros muestreados → servidor), con otro conteo
(`ai-service/domain/pen_count.py`; versión preliminar en el celular: `web/lib/scanner/pen.ts`):

1. **Seguimiento con compensación de cámara.** YOLOX por cuadro, más el desplazamiento global de la
   cámara (flujo óptico + RANSAC, **sin los puntos de los animales**, como BoT-SORT) y el mismo
   tracker. En el celular el desplazamiento se estima con miniaturas de 96 px (SAD), sin
   giroscopio.
2. **Coordenadas del mundo.** Cada track confirmado (≥ 3 apariciones) se ubica restando el
   desplazamiento acumulado de la cámara; se toma la mediana.
3. **Unión conservadora de vistas.** Dos tracks que **nunca** estuvieron a la vez en cuadro y
   ocupan el mismo lugar del mundo (IoU ≥ 0,3 o centros cercanos) son el mismo animal visto de
   nuevo (al volver con la cámara o tras una oclusión) y cuentan una vez. Dos tracks vistos a la
   vez son siempre distintos.
4. **Observados** = grupos tras la unión. Nunca se suman detecciones por cuadro.
5. **Qué se mide además:** cobertura (vistas de ancho recorridas), revisita, oclusión (cajas
   superpuestas), animales chicos y animales en el borde de lo cubierto (el grupo sigue afuera).

### Analizar foto

- **Captura:** la cámara del celular (no la galería), para que la fecha, la hora y el GPS sean
  los de la toma.
- **En el teléfono:** cada foto se analiza en el teléfono (cajas y conteo preliminar) y se
  guarda en IndexedDB con SHA-256. Funciona sin señal.
- **Sincronización:** se sincroniza como una sesión `PHOTO`. Cada foto es a la vez el cuadro
  a contar y el representativo que ve el banco.
- **En el servidor:**
  - YOLOX-S con teselado (animales chicos);
  - las fotos se registran entre sí (ORB + RANSAC);
  - una cadena de fotos solapadas se une como un recorrido de cámara;
  - fotos que no se pueden unir **no se suman**: se toma el máximo.
- **Conteo preliminar en el teléfono:** el máximo por foto.

### Calidad de la evidencia (todos los modos)

El servidor mide sobre los cuadros (proporciones, sin juicio), y la API decide
(`scans/domain/scan.types.ts → assessScanQuality`):

| Estado | Cuándo | Efecto |
|---|---|---|
| **VALIDADO** | sin problemas medidos | se usa |
| **NO CONCLUYENTE** | desenfoque o exposición en más del 30 % de los cuadros, movimiento rápido, animales chicos, oclusión sobre el umbral, animales en el borde, fotos sin solapar, arco corto, operador que se movió, cruces de ida y vuelta en el escáner fijo | se usa como **cota inferior**, con las razones a la vista |
| **EVIDENCIA INSUFICIENTE** | muy corta (fijo 3 s; barrido y corral 5 s), sin animales, o más del 60 % de los cuadros inutilizables | **no se usa** (anomalía INFO, no implica faltante) |

Una evidencia parcial **nunca** se convierte sola en un rechazo.

Cada problema trae una instrucción concreta. En vivo, en el celular (ventana de 2 s), y en el
resultado del servidor para el próximo escaneo:
- **"Mové más lento"**
- **"Mantené el celular quieto"**
- **"Acercate"**
- **"Hay demasiados animales ocultos"**
- **"Falta cubrir otra zona"** (solo con la cámara quieta y animales en el borde)
- **"Buscá más luz"**
- **"Evitá el contraluz"**
- **"Escaneá más tiempo"**
- **"Quedate en un punto"**
- **"Usá el escáner de corral"**
- **"Tomá las fotos seguidas"**

### Tipo de producción (`assets/domain/livestock-profile.ts`)

Se deriva del `sistema_productivo` declarado:
- Feedlot → **FEEDLOT**
- Cría, Tambo y Ciclo completo → **CRÍA**
- Recría e Invernada → **PASTOREO**

No se agregan campos a la declaración.

| | Feedlot | Cría | Pastoreo |
|---|---|---|---|
| Modo recomendado | Corral (por corral) → fijo → fotos | Fijo (manga) → corral (aguada) → barrido | Barrido → corral → fotos |
| Censo (comparable con lo declarado) | Solo paso por la manga | Solo paso por la manga | Solo paso por la manga |
| Oclusión tolerada | 50 % (alta concentración esperable) | 35 % | 35 % |
| Zonas distintas | Escaneos de corral con GPS a más de 40 m (+ precisión) se suman: son corrales distintos | Regla general (300 m) | Regla general (300 m); además anomalía INFO: *no se afirma el stock total desde una vista* |

### Visual + RFID

`GET /assets/:id/livestock/reconciliation`. Compara los bovinos observados (último conteo
oficial) con las caravanas leídas en los últimos 30 días:
- **Coincidencias individuales:** solo si hay un escaneo fijo en la manga y lecturas REALES de
  un lector en ese mismo paso. Cada cruce de la línea se empareja con una caravana leída a ±3 s
  (`TIME_MATCH`). Así se obtienen las coincidencias, los observados sin RFID y las caravanas sin
  detección visual.
- **Sin ese paso simultáneo:** solo se comparan totales (`COUNTS_ONLY`) y las coincidencias
  figuran como *no determinables*. No se inventan.
- **Lecturas SIMULADAS** (demo): se informan aparte y nunca se concilian.
- **Lector físico:** no hay integración con hardware. Las lecturas reales llegan por el puente
  del lector (`POST /assets/:id/rfid/observations`).

### Monitoreo recurrente

`GET /assets/:id/livestock/history` devuelve una fila por verificación: **Fecha | Declarados |
Observados (manga o mínimo) | RFID | Cobertura | Estado**. Además detecta cambios relevantes
entre una verificación y la anterior (`verification/domain/livestock-history.ts`):

| Cambio | Severidad |
|---|---|
| Caída entre dos conteos en manga | ATENCIÓN (≥ 10 %), CRÍTICO (≥ 25 %) |
| Menos animales con cota inferior | INFO ("no prueba un faltante") |
| Más animales | INFO |
| Cambio de lo declarado | INFO |
| Menos caravanas RFID (≥ 10 %) | ATENCIÓN |
| Caída de la cobertura | INFO |
| Estado que empeora | ATENCIÓN, o CRÍTICO si pasa a rechazado |
| Estado que mejora | INFO |

El banco lo ve en el detalle de la solicitud y en *Activo → Identificación individual*.

### El tracker

Es el mismo algoritmo en Python (`ai-service/domain/tracking.py`) y en TypeScript
(`web/lib/scanner/tracker.ts`). Los dos se prueban contra el mismo fixture de 7 escenarios
sintéticos (`ai-service/tests/fixtures/scanner-tracks.json`).

- **Asociación en dos etapas por confianza** (idea de ByteTrack): primero las detecciones
  altas y después las bajas, que solo extienden tracks.
- **Predicción de velocidad constante** con un filtro alfa-beta, en lugar del Kalman completo.
  Como respaldo, asocia por distancia de centros cuando a baja tasa de cuadros no hay
  solapamiento.
- **Compensación de movimiento de cámara** (como BoT-SORT), solo en el servidor.
- **Conteo neto con histéresis.** Un cruce de un track sin confirmar solo cuenta cuando el
  track se confirma. Volver sobre una zona ya escaneada descuenta los cruces.

### Sin señal

- **Escaneo en curso:** no usa la red y sigue normalmente.
- **Al terminar:** queda guardado en el teléfono con estado **OFFLINE**.
- **Al volver la señal:** se sincroniza solo. Se dispara con el evento `online`, al volver a
  la pestaña o cada 20 s en todo el portal del productor, y pasa a **SINCRONIZANDO x/y**.
- **Si se corta la subida:** la próxima vuelta pregunta al servidor qué cuadros tiene y sube
  solo los que faltan. Reenviar un cuadro idéntico no lo duplica, y uno distinto con el mismo
  índice se rechaza.
- **Al final:** pasa a **PROCESANDO** y luego a **VERIFICADO EN SERVIDOR** con el conteo oficial.
- **Limpieza:** los cuadros se borran del teléfono cuando el servidor confirmó que los tiene
  todos.
- **Abrir el escáner sin señal:** hay que haberlo abierto una vez con conexión. Así quedan en
  caché, mediante el service worker `public/sw.js`, la página, el motor ONNX y el modelo
  (unos 30 MB la primera vez). La API nunca se cachea.

## Resultados medidos (sin datos de campo)

**Todo lo que sigue es sobre videos SINTÉTICOS.** Son recortes de bovinos de fotos reales de
Open Images sobre pastura procedural, generados con `ai-service/scripts/generate_passage_video.py`
y `generate_sweep_video.py`. Validan el pipeline, **no** la precisión en campo, que sigue
**sin medir**.

| Prueba | Verdad | Resultado |
|---|---|---|
| Manga, servidor, muestreo 3/s | 14 | 4 (por eso el muestreo por defecto es 6/s) |
| Manga, servidor, muestreo 4/s | 14 | 10 |
| Manga, servidor, muestreo 6/s | 14 | 12 |
| Manga, servidor, muestreo 12/s | 14 | 13 |
| Manga de punta a punta en Chromium con cámara falsa, 3 corridas: celular (YOLOX-Nano WASM, ~8 inferencias/s) | 14 | 12, 12, 12 |
| Mismas 3 corridas, conteo oficial del servidor | 14 | 12, 14, 12 (calidad COMPLETA; varía según qué cuadros se muestrean) |
| Barrido simple, servidor | 12 | 12 (paneo estimado 1.762 px vs 1.760 real) |
| Barrido con vuelta atrás, servidor (JPEG 75) | 12 | 12 (+4/−16: la revisita se descontó) |
| Barrido con vuelta atrás, servidor (JPEG 95) | 12 | 13 (un cruce de más por pérdida de identidad) |
| 7 escenarios del fixture de detecciones (Python y TS) | — | 7/7 exactos e idénticos en ambos lenguajes |
| **Corral**, servidor, barrido simple (animales quietos, 3,75 vistas) | 12 | 13 |
| **Corral**, servidor, barrido con vuelta atrás (revisita 58 %) | 12 | 13 (7 reapariciones unidas: la revisita no duplica) |
| **Corral** sobre la manga (animales caminando: fuera de su uso) | 14 | 7 (une animales que pasan por el mismo lugar: por eso el corral es para animales quietos) |
| **Corral** de punta a punta en Chromium con cámara falsa (el video se repite y "salta") | 12 | celular 15, servidor 16, NO CONCLUYENTE |
| Escáner fijo: cuadros marcados "cámara movida" en la manga (cámara quieta) | 0 % | 66 % antes de excluir los animales del flujo óptico, 3,5 % después |

Las pérdidas en la manga vienen de animales que el detector no ve en suficientes cuadros. No
hay calibración con video real de mangas argentinas.

## Cómo probarlo desde un celular real

**Guía paso a paso: [`docs/phone-testing.md`](phone-testing.md)** (script `scripts/phone-test.sh`).

El navegador solo abre la cámara en un **contexto seguro** (HTTPS), o en `localhost`.

1. **Levantar el stack** con `docker compose up -d --build`. El build de la web descarga y
   verifica YOLOX-Nano y copia ONNX Runtime a `public/`.
2. **Exponerlo por HTTPS.** La opción más simple, sin cuenta y gratis, es un túnel rápido de
   Cloudflare:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   # → https://<algo>.trycloudflare.com
   ```
   Para que los links de invitación apunten al túnel, definí `WEB_ORIGIN=https://<algo>.trycloudflare.com`
   en `.env` y reiniciá la API. Alternativas: `ngrok http 3000`, o un certificado local
   (mkcert) con un proxy HTTPS.
3. **Desde la PC (entidad):** iniciá sesión, creá una solicitud BOVINOS y copiá el link de
   invitación.
4. **En el celular**, abrí el link, aceptá, declará el establecimiento y el rodeo, y tocá
   **Escáner de bovinos → Escanear rodeo**.
5. **Elegí el modo y tocá *Iniciar escaneo*.** Aceptá los permisos de cámara y ubicación, y en
   iPhone también el de movimiento.
   - **Fijo:** apoyá el celular apuntando al paso.
   - **Barrido:** empezá a un costado del rodeo y girá despacio.
6. **Para probar el modo sin señal:** activá el modo avión a mitad del escaneo, terminá
   (aparece **OFFLINE**) y volvé a activar los datos (pasa a **SINCRONIZANDO** y luego a
   **VERIFICADO EN SERVIDOR**).
7. **En la PC:** el detalle de la solicitud muestra *Escaneos de bovinos*, con el conteo
   oficial, el del celular, la calidad, las advertencias y los cuadros representativos con las
   detecciones del servidor.

Requisitos del navegador:
- **WebGPU:** Chrome en Android 12+ o Safari en iOS 26.
- **Celulares sin WebGPU:** usan WASM, más lento, con un solo hilo porque no hay aislamiento
  cross-origin.
- **Rendimiento:** no medimos todavía en teléfonos reales. La interfaz muestra el backend y
  las inferencias por segundo.

### Prueba automatizada con cámara falsa

```bash
ffmpeg -i infra/seed-assets/videos/paso-manga-sintetico.mp4 \
  -vf "tpad=start_duration=4:start_mode=clone:stop_duration=3:stop_mode=clone" \
  -pix_fmt yuv420p /tmp/manga-camera.y4m
# Animales quietos (corral y fotos):
ffmpeg -i infra/seed-assets/videos/barrido-ida-vuelta-sintetico.mp4 \
  -vf "tpad=start_duration=3:start_mode=clone:stop_duration=3:stop_mode=clone" \
  -pix_fmt yuv420p /tmp/corral-camera.y4m
cd apps/web
SCANNER_FAKE_CAMERA=/tmp/manga-camera.y4m SCANNER_FAKE_CAMERA_STILL=/tmp/corral-camera.y4m \
  SEED_DEMO_PASSWORD=... npx playwright test e2e/04-bovine-scanner.spec.ts e2e/05-livestock-modes.spec.ts
```

## Costos

- No hay API paga de IA: YOLOX (Apache-2.0) y ONNX Runtime (MIT) corren en el celular y en
  la CPU del servidor.
- **Datos que consume el celular:**
  - la primera vez, el motor más el modelo: unos 30 MB sin comprimir;
  - por escaneo, unos 50–70 KB por cuadro × 6 por segundo, unos 18–25 MB por minuto, más los
    cuadros representativos.
- Si no hay señal, el escaneo se sube después, por WiFi o datos.

## Limitaciones y pendientes

- **Precisión en campo desconocida.** Hace falta un protocolo con escaneos reales contados a
  mano.
- **Detector genérico** (COCO), sin ajuste a ganado local. Los animales lejanos o pegados se
  pierden o se cuentan como uno.
- **Sin re-identificación por apariencia.** Un animal oculto mucho tiempo que reaparece y
  vuelve a cruzar puede contarse dos veces.
- **El barrido es siempre cota inferior.** No estima el stock de un campo de pastoreo.
- **Corral:**
  - une vistas solo por posición, sin apariencia;
  - animales que se mueven mucho entre vistas pueden contarse dos veces;
  - dos animales distintos que ocupan el mismo lugar en momentos distintos se cuentan una vez;
  - los animales tapados no se ven.
- **Fotos:** sin solapamiento detectable no se suman (se toma el máximo).
- **Umbrales sin calibrar con escaneos reales:** calidad, oclusión, unión de vistas y 40 m en
  feedlot.
- **El celular no compensa el movimiento de cámara** (el servidor sí). Su conteo en barrido es
  menos confiable y solo sirve como referencia en pantalla.
- **Escáner + RFID:**
  - la coincidencia por tiempo está implementada y probada con datos de prueba;
  - falta un lector físico y su puente;
  - los relojes del lector y del celular tienen que estar sincronizados (±3 s).
