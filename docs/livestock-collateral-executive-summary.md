# Garantías ganaderas — resumen ejecutivo

**Investigación completa:** [`livestock-collateral-research.md`](livestock-collateral-research.md).
Fuentes consultadas el 05/10/2026.

> **Pregunta:** ¿Podemos construir una infraestructura de verificación recurrente que permita a un
> banco o financiera confiar en un rodeo, tambo o feedlot como garantía durante toda la vida del
> crédito, con menos inspecciones presenciales?
>
> **Respuesta corta: sí, y el momento es ahora.** No porque falte tecnología, sino porque **entre 2024
> y 2026 Argentina armó casi todo el marco legal y de datos que le faltaba**, menos la verificación
> física recurrente. Ese hueco es el que puede ocupar AgroGarantías. Con una condición: el foco no
> puede ser solo la visión computacional. Lo que más pesa para un acreedor es **fuentes oficiales +
> estructura legal + verificación física proporcional al riesgo**.

---

## 1. Lo que cambió en Argentina (y casi nadie conecta)

| Pieza | Norma | Qué aporta |
|---|---|---|
| Prenda sobre ganado con formulario propio e **inmovilización** de cabezas en SENASA | Dec.-Ley 15.348/46 + Res. Conj. 2-E/2017 | Garantía legal con derecho del acreedor a **inspeccionar** y prohibición de trasladar |
| **Warrant ganadero** electrónico | Ley 9.643 + DNU 70/2023 + Dec. 640/2024 | Título negociable sobre ganado en pie (el primero, oct. 2024: 200 vacas de tambo) |
| **Inmovilización voluntaria** + **acceso del acreedor a datos de SENASA** | Disp. 2/2026 ⚠ | El equivalente argentino del "acceso de solo lectura a NLIS" australiano |
| **RFID individual obligatorio** | Res. SENASA 841/2025 | Terneros desde 2026; el rodeo adulto se irá cubriendo con los años |
| **TRAZA**: stock, prendados, en warrant y **disponibles para garantía** | Res. SAGyP 117/2026 ⚠ | La consulta anti-**doble garantía** que faltaba (en desarrollo gradual) |

⚠ = Detalle tomado de extractos; leer el texto oficial completo antes de usarlo.

**Lo que el Estado NO está construyendo:** la verificación de que los animales **existen, están ahí y
en qué estado**, de forma **frecuente y barata**. La ley da el **derecho** a inspeccionar, pero no hay
una forma práctica de ejercerlo.

## 2. Qué hacen los mercados maduros

| | Garantía | Monitoreo continuo | Verificación física | Lo que hace mejor |
|---|---|---|---|---|
| **EE.UU.** | Security interest (UCC-9) + Food Security Act (sigue el producido de la venta) | Reportes del prestatario; closeout por lote en feedlot | **Anual** (reproductores) / **por ciclo** (engorde), **independiente** del oficial de crédito, a menudo tercerizada | Disciplina de inspección documentada |
| **Australia / NZ** | **PPSR (PMSI)** por compra financiada | **NLIS de solo lectura** sobre el campo del productor (movimientos de cada animal con RFID) | Inicial; después, a criterio | Monitoreo barato atado a la identidad individual; **0,4 % de pérdida histórica (NZ)** financiando el 100 % de la compra |
| **Canadá (Alberta)** | La asociación **es dueña** del ganado + garantía provincial + fondo del 5 % | Libro del supervisor | **Antes de pagar** y más de una visita por contrato | La inspección física como árbitro final (la auditoría de 2025 encontró todos los animales) |
| **Brasil / AR (tambo)** | CPR en B3 / warrant | **Sensores por animal** (collar, ordeñe) | — | Prueba de existencia continua, **solo en tambo** |

**Lección de los fraudes reales** (Easterday US$244 millones, Ponzi de US$650 millones, Missouri 2026):
todos usaron **documentos falsos sin verificación física independiente ni cruce con una fuente
oficial**. **Ninguno se habría evitado con más OCR.**

## 3. Qué no se puede copiar todavía

| De | Qué | Por qué no se puede todavía |
|---|---|---|
| Australia | RFID en el 100 % del rodeo | En Argentina rige para terneros desde 2026 |
| Australia | Acceso por API a la base oficial | SIGSA y TRAZA no tienen API pública para terceros. **No inventarla:** el proveedor oficial sigue `NOT_CONNECTED` |
| EE.UU. | Inspector presencial frecuente | Costo por distancia en Argentina |
| Australia / EE.UU. | Producido de la venta canalizado al acreedor | Es una práctica comercial, no tecnológica |

## 4. Modelo recomendado para AgroGarantías

**Posicionamiento:** infraestructura de **verificación continua de garantías**.
- **No presta, no emite títulos ni custodia.**
- Le vende a quien presta o emite, en este orden:
  1. **warranteras** (la Disp. 2/2026 las obliga a controlar);
  2. **SGR**;
  3. bancos;
  4. fiduciarios;
  5. aseguradoras.

**Modelo operativo:** **híbrido con frecuencia según el riesgo**:
- fuentes oficiales + documentos + evidencia física proporcional;
- **inspección humana al originar, una vez al año y por excepción**.

| Tipo | Evidencia principal | Frecuencia base (a calibrar) |
|---|---|---|
| **Feedlot** | Conteo por corral + DT-e de ingreso y egreso | 30 días |
| **Invernada** | Barrido y escáner; RFID en manga cuando exista; DT-e de salida | 60 días |
| **Cría** | **Manga + RFID en eventos** (tacto, vacunación, destete) + certificado de tacto | Por evento (2-3 por año) + remota cada 90 días |
| **Tambo** | **Litros diarios + liquidación de la usina** (cesión del flujo) + conteo | Continuo + conteo cada 90 días |
| **Cultivos** | Sentinel-2 (ya implementado) | 5-10 días |

**Escalamiento:** riesgo bajo → frecuencia base. Medio → la mitad. Alto → 7 días. Crítico →
**inspección presencial**.

**Disparadores de inspección presencial:**
- un DT-e de salida no explicado;
- una caída de la cantidad por encima de la tolerancia;
- el estado "no determinable" dos veces seguidas;
- una señal de fraude.

**Asset Passport** (uno por activo en garantía):
- identidad;
- garantía legal (instrumento, registro, inmovilización, acceso otorgado);
- declaración;
- **fuentes oficiales**;
- documentos;
- evidencia física;
- historial;
- **estado calculado**.

**Cada dato con fuente, fecha y nivel** (declarado < documental < físico < oficial). No existe
integrado en ningún mercado: hay piezas (NLIS, borrowing base, reporte de inspección, TRAZA). **La unión
de esas piezas con una medida de calidad y antigüedad de la evidencia es el diferencial.**

**Collateral Effectiveness Score:**
1. **Compuertas**: sin evidencia reciente, identidad que no coincide, fuera de la geocerca o
   documentos inconsistentes → **NO DETERMINABLE**.
2. **Eslabón más débil** entre existencia, cantidad y valor.
3. **Cobertura en pesos**: cabezas verificadas × kg × precio INMAG ÷ deuda. Es el lenguaje del banco y
   se compara con los márgenes del BCRA: 60 % prenda fija y 50 % flotante ⚠.

**Tokenización:** **no es el cuello de botella**.
- El warrant electrónico ya es un título negociable sin blockchain.
- Los casos que funcionan (Agrotoken, vacas en B3) funcionan por la **custodia física o los sensores +
  el título legal**, no por el token.
- AgroGarantías debería ser **el proveedor de la prueba de existencia** que usa quien emita el título.

## 5. MVP y producto a 3 años

**MVP:**
- **Un cliente:** una warrantera o una SGR.
- **Un activo:** feedlot por defecto; validar en las entrevistas si conviene cría en eventos de manga.
- **Funciones:**
  1. passport y score con compuertas;
  2. programación de verificaciones por riesgo;
  3. **captura solo en la app** con desafío anti-fraude;
  4. carga de constancias SIGSA, DT-e y TRAZA en PDF con OCR;
  5. **inspección humana con firma en la app**;
  6. reporte para el legajo del acreedor.

**A 3 años:**
- acceso formal a SENASA y TRAZA;
- integración con la plataforma de warrants;
- RFID masivo;
- datos de tambo;
- red de inspectores tercerizados;
- score calibrado con historia;
- API para bancos, SGR y aseguradoras;
- Uruguay (SNIG).

## 6. Qué cambia en el producto actual

- **Mantener:**
  - el flujo de solicitud;
  - las capas declarado / extraído / interno / oficial (`NOT_CONNECTED` sin simular);
  - el OCR determinista;
  - los escáneres, sobre todo **Manga + RFID** para cría y **corral** para feedlot;
  - el GPS y la deduplicación;
  - los estados de evidencia;
  - el satélite para cultivos;
  - el modo offline;
  - la auditoría.
- **Modificar:**
  - el score, a compuertas + eslabón más débil + cobertura en pesos;
  - la frecuencia, que pasa a ser automática por riesgo y tipo de producción;
  - el proveedor de SENASA, que suma la carga de constancias oficiales;
  - los requisitos, que suman gravámenes, TRAZA, inmovilización y tacto;
  - la galería, que no se acepta en las verificaciones recurrentes;
  - los tipos de producción, que suman tambo e invernada;
  - el reporte, que pasa a ser passport + covenants.
- **Despriorizar:**
  - las cámaras simuladas como evidencia por defecto;
  - el conteo satelital de ganado;
  - la UX de "verificar ahora".
- **Agregar:**
  1. Asset Passport;
  2. garantía legal en el activo;
  3. inspección humana como evidencia;
  4. programador por riesgo;
  5. cobertura y LTV;
  6. covenants;
  7. prelación;
  8. datos de tambo;
  9. desafío anti-fraude.

## 7. Antes de programar

1. **5-8 entrevistas:**
   - warranteras;
   - SGR con cartera ganadera;
   - oficiales de crédito agro de BNA y Galicia;
   - una aseguradora de hacienda.

   **Objetivo:** relevar cómo verifican hoy, cuánto les cuesta, qué formato de legajo usan y qué
   acceso a SENASA tienen. **Es el mayor hueco de esta investigación**, porque no está publicado.
2. **Leer los textos oficiales completos** de la Disp. 2/2026, la Res. 117/2026, la RC 2-E/2017 y el
   texto ordenado de Garantías del BCRA. Desde el entorno de esta investigación esos sitios estaban
   bloqueados.
3. Recién después, decidir el activo y el cliente del MVP y diseñar el modelo de datos del passport.
