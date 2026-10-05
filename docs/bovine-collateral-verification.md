# Verificación continua de garantías bovinas

AgroGarantías es la **infraestructura de verificación continua de garantías bovinas**. Verifica,
monitorea, cruza evidencia, detecta inconsistencias, alerta, conserva un historial auditable y
decide cuándo hace falta una inspección presencial.

**No presta, no compra, no custodia ganado ni emite warrants.**

La IA no es el producto: la visión computacional es **una fuente de evidencia más**, junto con:
- la manga + RFID;
- la inspección humana;
- los documentos oficiales cargados;
- los movimientos.

Investigación de base: [`livestock-collateral-research.md`](livestock-collateral-research.md) y
[`livestock-collateral-executive-summary.md`](livestock-collateral-executive-summary.md).

## 1. Flujo

```
Entidad crea la solicitud (Bovinos) ──► nace la garantía AG-XXXX (PENDIENTE_DECLARACION)
Productor declara y envía ──────────────► declaración v1 CONGELADA (PENDIENTE_VERIFICACION)
Verificación inicial (pipeline) ─────────► Asset Passport: score, riesgo, cobertura, agenda
Monitoreo recurrente ────────────────────► evidencia nueva / movimientos / inspecciones
Cruce de evidencias + motor ─────────────► ¿todo cierra?
   sí ─► VERIFICADA / EN_MONITOREO (sigue el monitoreo)
   no ─► alerta ─► más evidencia o inspección ─► estado nuevo ─► passport / PDF
```

Cada uno de estos hechos dispara una evaluación del motor:
- una verificación del pipeline;
- una inspección;
- un movimiento;
- una corrección de la declaración;
- un documento;
- un cambio de datos legales o de valuación;
- el recálculo manual;
- el **barrido programado** del worker.

Cada evaluación queda como **snapshot inmutable**.

## 2. Declarado, esperado, observado, verificado

Son siempre cuatro números separados:

| Concepto | Origen |
|---|---|
| **Declarado** | Versión vigente de la declaración del productor (inmutable; las correcciones son versiones nuevas). |
| **Esperado** | Declarado − egresos + ingresos (los movimientos rechazados no cuentan). |
| **Observado** | La observación vigente: el conteo completo (censo) más reciente dentro de la antigüedad máxima; si no hay, la observación más reciente. |
| **Verificable** | Cabezas que la evidencia permite afirmar: min(observado, esperado), o las caravanas RFID confirmadas si son más. |

Ejemplo, tal como lo escribe el sistema:

> Se declararon 1.000 animales. Se registraron 25 salidas. La cantidad esperada es 975. La última
> evidencia visual (foto) observó 973 animales. Diferencia no explicada: 2 menos de lo esperado
> (dentro de la tolerancia de 9; requiere revisión).

**Nunca** dice "faltan 27".

Una foto, un barrido o un corral muestran una parte del rodeo (**cota inferior**). Por eso un
conteo parcial por debajo de lo esperado es **evidencia insuficiente, no un faltante**.

## 3. Estados

| Estado | Cuándo |
|---|---|
| `PENDIENTE_DECLARACION` | La solicitud existe; el productor no envió la declaración. |
| `PENDIENTE_VERIFICACION` | Declaración congelada; falta la verificación inicial. |
| `VERIFICADA` | Sin compuertas, score ≥ 70 y evidencia dentro de la frecuencia. |
| `EN_MONITOREO` | Sin compuertas; la próxima verificación está programada (o el score está por debajo de 70). |
| `REQUIERE_EVIDENCIA` | La última evidencia física superó la antigüedad máxima. |
| `REQUIERE_REVISION` | Hay que revisarlo. Ver la lista de motivos debajo de la tabla. |
| `REQUIERE_INSPECCION` | Hay que ir al campo. Ver la lista de motivos debajo de la tabla. |
| `NO_DETERMINABLE` | Hay evidencia insuficiente: no hay existencia observada, la calidad es insuficiente o el conteo es parcial y está debajo de lo esperado. |
| `VENCIDA` / `FINALIZADA` | La garantía venció o la entidad la finalizó. El historial se conserva. |

Motivos de `REQUIERE_REVISION`:
- una inconsistencia documental;
- la evidencia está fuera del establecimiento;
- RFID inconsistente;
- una diferencia menor dentro de la tolerancia;
- una posible doble garantía.

Motivos de `REQUIERE_INSPECCION`:
- una diferencia no explicada que supera la tolerancia;
- dos verificaciones seguidas no determinables;
- la última inspección resultó no conforme;
- riesgo crítico.

## 4. Motor (determinista, sin ML)

Código: `apps/api/src/modules/collateral/domain/` (funciones puras, con tests unitarios).

- **Consistencia** (`reconciliation.ts`): cruza lo declarado, los movimientos, lo esperado, la
  cámara, la inspección y el RFID. La tolerancia es configurable (por defecto 1 % o 5 cabezas).
- **Calidad de evidencia** (`evidence-quality.ts`): cada método tiene un techo de calidad.
  - Techos:
    - manga + RFID / escáner fijo / inspección → ALTA;
    - video y barrido → MEDIA;
    - foto → BAJA.
  - Baja un nivel por cada uno de estos casos:
    - archivo de galería;
    - sin GPS;
    - evidencia no concluyente;
    - confianza < 50 %.
  - Lo simulado es INSUFICIENTE.
- **Collateral Effectiveness Score** (`score.ts`): diez componentes de 0 a 100, cada uno con su
  explicación:
  1. existencia;
  2. cantidad;
  3. identidad;
  4. documentación;
  5. ubicación;
  6. recencia;
  7. calidad;
  8. movimientos;
  9. consistencia;
  10. historial.

  Cómo se calcula:
  - Promedio ponderado. En cría pesa más la identidad.
  - **Eslabón más débil**: el score no supera el peor componente crítico (existencia, cantidad,
    consistencia, recencia) + 15.
  - Las **compuertas** fijan el estado sin importar el score.
- **Riesgo** (`risk.ts`): puntos por factor, cada uno explicado.
  - Niveles: 0-1 BAJO · 2-3 MEDIO · 4-6 ALTO · 7+ CRÍTICO.
  - Factores:
    - tipo de producción;
    - tamaño del rodeo;
    - monto;
    - estado;
    - antigüedad y calidad de la evidencia;
    - movimientos sin respaldo;
    - volumen de salidas;
    - RFID;
    - documentación;
    - cobertura;
    - caída del score;
    - frecuencia de alertas.
- **Cobertura** (`coverage.ts`): verificables × peso × precio de referencia × factor de calidad.
  - Se compara contra la deuda (o el monto de la garantía).
  - Si falta un dato o las monedas no coinciden, el resultado es **NO DETERMINABLE** y se dice
    qué falta.
  - Nunca se estiman pesos, precios ni valuaciones.
- **Agenda** (`schedule.ts`, `policy.ts`):
  - La frecuencia y la antigüedad máxima salen de `collateral_monitoring_policies`, configurable
    por organización (`PUT /bovine-guarantees/policies`).
  - Los valores iniciales son configuración de ejemplo, **no una norma**. Feedlot: 30/14/7 días
    según el riesgo.
  - El riesgo crítico exige inspección.
- **Alertas** (`alert-rules.ts`):
  - Cada alerta explica qué pasó, por qué, con qué evidencia y qué acción se recomienda.
  - Se abren y se cierran solas según la evaluación (`RESOLVED` por el sistema, con nota).
  - Las gestiona la persona: responsable, `IN_REVIEW` y `DISMISSED` con nota obligatoria.
  - Nunca se borran.

## 5. Fuentes oficiales

| Fuente | Estado hoy | Cómo se trabaja |
|---|---|---|
| RENSPA (SENASA) | **SIN CONEXIÓN** | Subir la constancia: se lee con OCR y se cruza con lo declarado. |
| SIGSA (existencias) | **SIN CONEXIÓN** | Subir el informe de existencias. |
| DT-e | **SIN CONEXIÓN** | Subir el DT-e. El movimiento queda `DOCUMENTADO` (nunca `OFICIAL`). |
| TRAZA (ganado prendado) | **NO DISPONIBLE** | En implementación por la autoridad. Se puede subir la constancia si la hubiera. |

El estado `CONECTADA` existe en el modelo, pero ninguna fuente lo usa: el `OfficialDataProvider`
de SENASA responde `NOT_CONNECTED`. **No se inventan respuestas ni se hace scraping.**

## 6. Antifraude

- La app prioriza **TOMAR FOTO** sobre la galería.
  - Cada evidencia guarda su origen: `CAPTURA_EN_CAMPO`, `ARCHIVO_CARGADO`, `DISPOSITIVO_FIJO` o
    `DESCONOCIDO`, que se trata como archivo.
  - También guarda GPS, precisión, fecha, SHA-256, dispositivo y usuario.
- El origen lo informa el cliente: **es una declaración del dispositivo, no una prueba**.
  - El escáner y la manga capturan solo desde la app.
  - Un archivo de galería nunca supera calidad BAJA.
- **Código de desafío** opcional ("mostrar tarjeta con 4821"): se registra junto con la foto. Hoy
  **no se verifica automáticamente** que aparezca en la imagen.
- **Posible doble garantía** (dentro de la misma entidad): se marca cuando hay otra garantía
  activa sobre el mismo rodeo o sobre caravanas RFID compartidas. Entre entidades haría falta
  TRAZA.

## 7. Inmutabilidad y auditoría

- La base rechaza `UPDATE`/`DELETE` (triggers) en:
  - `collateral_declarations`;
  - `collateral_score_snapshots`;
  - `collateral_verifications`;
  - `collateral_events`;
  - `audit_logs`.
- `collateral_inspections` no se modifica ni se borra una vez `REALIZADA`. El acta lleva la
  firma: nombre + SHA-256 del contenido canónico.
- Cada comando registra en `audit_logs` el usuario, la acción, el antes y el después, y la
  evidencia.

## 8. API

Todo bajo `/api/bovine-guarantees`:

| Método y ruta | Uso |
|---|---|
| `GET /` | Cartera: KPIs (solo REAL), tabla, filtros `state`, `risk`, `production`, `q`, `includeDemo` |
| `GET /:id` · `GET /:id/passport` · `GET /:id/passport.pdf` | Cabecera, Asset Passport completo, PDF |
| `GET /:id/timeline` · `/score` · `/coverage` · `/alerts` · `/verifications` · `/movements` · `/inspections` | Secciones |
| `PATCH /:id` | Datos legales, deuda, valuación con fuente, tipo de producción |
| `POST /:id/declaration` | Corrección = versión nueva |
| `POST /:id/movements` · `PATCH /:id/movements/:movementId` | Movimiento y su revisión |
| `POST /:id/verify` · `POST /:id/evidence` · `POST /:id/documents` | Verificación con el pipeline, foto, documento oficial |
| `POST /:id/inspection` · `POST /:id/inspection/:inspectionId` · `POST /:id/inspection/record` | Solicitar o registrar una inspección firmada |
| `POST /:id/recalculate` · `POST /:id/finalize` | Recalcular o finalizar |
| `GET /policies` · `PUT /policies` | Frecuencias por tipo de producción y riesgo |

Portal del productor:
- `GET /producer/me/requests/:id/declaration`;
- `POST .../declaration/corrections`.

No se duplicaron endpoints: la evidencia y los documentos reutilizan los servicios existentes, y
la verificación reutiliza el pipeline.

## 9. Qué es real, qué depende de integración externa y qué requiere validación física

**Real (funciona hoy, con tests):**
- Ciclo de vida completo de la garantía.
- Declaración inmutable con versiones.
- Movimientos `DOCUMENTADO`/`DECLARADO`.
- Motor de consistencia, score con compuertas, riesgo, cobertura, agenda configurable y alertas
  explicadas.
- Inspección firmada e inmutable.
- Historial inmutable.
- Passport web y PDF.
- Separación de las demostraciones (DEMO).
- Integración con el pipeline de visión existente (YOLOX-S + ByteTrack en el servidor como
  referencia), con el escáner offline y con la manga + RFID.
- Origen de captura y GPS.

**Preparado, pero depende de integración externa:**
- Consulta a SENASA (RENSPA, SIGSA), DT-e y TRAZA. Hoy: `SIN CONEXIÓN` / `NO DISPONIBLE` +
  documento cargado.
- Precio de referencia automático: hoy lo carga la entidad con su fuente.
- Registro de prendas y warrants: los datos legales los informa la entidad y no se verifican.
- Datos de producción de tambo (usina).
- Doble garantía entre entidades: requiere TRAZA.

**Requiere validación física con ganado real:**
- Precisión del conteo por visión en corrales, barridos y manga, a escala y con distintas razas,
  luz y densidad.
- Tasa de asociación RFID ↔ animal en manga con lectores reales (bastón y panel).
- Tolerancia de diferencias, pesos del score y frecuencias: hay que **calibrarlos con historia
  real** de cada entidad.
- Verificación del código de desafío dentro de la imagen.

## 10. Limitaciones conocidas

- El origen de captura (cámara o galería) lo declara el navegador: un cliente adulterado podría
  mentir. Lo mitigan:
  - el GPS;
  - el EXIF;
  - la calidad máxima baja para fotos;
  - la preferencia por el escáner o la manga;
  - la inspección.
- Los movimientos se comparan contra la declaración **por día**: un movimiento fechado el mismo
  día de la declaración se descuenta.
- La cobertura no convierte monedas (sin tipo de cambio, queda NO DETERMINABLE).
- El barrido programado reevalúa, como máximo, 500 garantías por ciclo.
