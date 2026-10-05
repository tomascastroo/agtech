# Garantías sobre activos agropecuarios: cómo se financian, monitorean y vuelven a verificar

**Investigación para definir el modelo de AgroGarantías — Argentina, EE.UU., Australia y otros mercados**

- **Fecha de consulta de todas las fuentes:** 05/10/2026.
- **Alcance:** ganado (cría, invernada, feedlot, tambo, cabañas), con referencias a granos, maquinaria e infraestructura.
- **Estado:** investigación. No se implementó nada a partir de este documento.

> **Cómo leer este documento.** Cada afirmación relevante lleva una etiqueta:
>
> | Etiqueta | Significa |
> |---|---|
> | **[NORMA]** | Texto legal o regulatorio (ley, decreto, resolución, regulación federal). |
> | **[OFICIAL]** | Organismo público o regulador (comunicado, manual de examen, sitio oficial). |
> | **[LENDER]** | Información publicada por un banco o financiera sobre su propio producto. |
> | **[CLAIM]** | Afirmación de una empresa sobre su tecnología o resultados. **No es un hecho verificado.** |
> | **[PAPER]** | Trabajo académico o técnico. |
> | **[PRENSA]** | Prensa especializada o general. |
> | **[INFERENCIA]** | Conclusión nuestra a partir de las fuentes. |
> | **[PROPUESTA]** | Diseño propuesto para AgroGarantías. |
>
> **Limitación de método (importante).** Desde el entorno donde se hizo esta investigación, el acceso
> directo a la mayoría de los sitios estaba bloqueado: argentina.gob.ar, bcra.gob.ar, dnrpa.gov.ar,
> ecfr.gov, integritysystems.com.au y otros. Las fuentes se obtuvieron con un buscador web que devuelve
> extractos y la URL. Cada URL está citada, pero **los textos normativos citados por extracto deben
> verificarse contra el texto oficial completo antes de usarse en un contrato o un producto.** Esto vale
> especialmente para los márgenes de cobertura del BCRA, el detalle de la Disposición 2/2026 y el de la
> Resolución 117/2026. Esos puntos están marcados con ⚠ en el texto.

---

## Índice

1. [Argentina](#1-argentina)
2. [Estados Unidos](#2-estados-unidos)
3. [Australia](#3-australia)
4. [Otros mercados](#4-otros-mercados)
5. [Ganadería: el problema común](#5-ganadería-el-problema-común)
6. [Cría](#6-cría)
7. [Feedlot](#7-feedlot)
8. [Tambo](#8-tambo)
9. [Invernada / recría](#9-invernada--recría)
10. [Garantías: mapa de instrumentos](#10-garantías-mapa-de-instrumentos)
11. [Monitoreo durante la vida del crédito](#11-monitoreo-durante-la-vida-del-crédito)
12. [Fraude](#12-fraude)
13. [Verificación recurrente: modelos A–F](#13-verificación-recurrente-modelos-af)
14. [Asset Passport](#14-asset-passport)
15. [Monitoreo basado en riesgo y score de efectividad de la garantía](#15-monitoreo-basado-en-riesgo-y-score-de-efectividad-de-la-garantía)
16. [Tokenización](#16-tokenización)
17. [Modelo propuesto para AgroGarantías](#17-modelo-propuesto-para-agrogarantías)
18. [Tablas comparativas](#18-tablas-comparativas)
19. [Mapa de documentación](#19-mapa-de-documentación)
20. [Respuestas concretas (las 20 preguntas)](#20-respuestas-concretas-las-20-preguntas)
21. [Qué cambiaría en el producto actual](#21-qué-cambiaría-en-el-producto-actual)
22. [Fuentes](#22-fuentes)

---

## 1. Argentina

### 1.1 Resumen

**[INFERENCIA]** El ganado en Argentina **ya se puede tomar como garantía**, por tres vías legales.
Hasta 2024 el problema principal no era jurídico sino de **control**: saber que los animales
prendados siguen ahí, que no se vendieron y que no se prendaron dos veces. Entre 2017 y 2026 el Estado
fue armando las piezas para resolverlo:

| Año | Pieza | Qué aporta |
|---|---|---|
| 1946 (t.o. 1995) | **Prenda con registro**, Decreto-Ley 15.348/46 | Garantía sobre hacienda que queda en poder del productor. |
| 2017 | **Resolución Conjunta 2-E/2017** (Justicia + Agroindustria) | Formulario específico de prenda sobre ganado y sistema informático de registro. Se apoya en la "inmovilización" de animales en SENASA. |
| 2023-2024 | **DNU 70/2023 y Decreto 640/2024** (modifican la Ley 9.643 de warrants) | Warrants electrónicos y sobre **cualquier producto, incluido ganado en pie**. |
| oct. 2024 | **Primer warrant ganadero** | 200 vacas de un tambo de Sunchales, con monitoreo de "fe de vida" 24/7. |
| nov. 2025 | **Resolución SENASA 841/2025** | Identificación **electrónica individual obligatoria** (RFID) para bovinos, desde el 01/01/2026 para terneros. |
| 2026 | **Disposición 2/2026** (SAGyP) | **Inmovilización voluntaria** de la hacienda comprometida en warrants, con acceso del tenedor del warrant a datos de SENASA. Toda modificación de un warrant se informa el mismo día. |
| jul. 2026 | **Resolución 117/2026**: sistema **TRAZA** | Consolida datos estatales. Prevé calcular, por unidad productiva, el stock total, los animales prendados (RC 2/17), los comprometidos en warrants y **los disponibles para garantía**. |

**[INFERENCIA]** Esta secuencia es la noticia más importante de la investigación. **Argentina está
construyendo, por la vía estatal, la combinación que Australia tiene desde hace dos décadas**:
registro de la garantía, identificación individual y datos de movimiento. Lo que **no** está construyendo
el Estado es la verificación física recurrente de que los animales existen y están en buen estado. Ese
espacio sigue vacío y es donde AgroGarantías puede aportar valor.

### 1.2 Prenda con registro sobre hacienda (Decreto-Ley 15.348/46, t.o. Decreto 897/95)

- **[NORMA]** Los bienes prendados **quedan en poder del deudor**, que puede usarlos según su destino y
  está obligado a conservarlos. Las fuentes son el [texto en argentina.gob.ar](https://www.argentina.gob.ar/normativa/nacional/decreto_ley-15348-1946-44079/texto)
  y la [copia del BCRA](https://bcra.gov.ar/pdfs/texord/texcomp/DL15348-46.pdf).
- **[NORMA] Individualización del ganado (art. 11).** Los animales deben individualizarse por clase,
  número, edad, sexo, grado de mestización, marca, señal, certificado o guía. Se menciona el número de
  inscripción, su fecha y la oficina que registró la marca o emitió la guía. Fuente: extracto del
  decreto-ley vía buscador.
  - **[INFERENCIA]** El régimen identifica el ganado **por lote y por marca**, no por animal. Por eso,
    tradicionalmente, la prenda ganadera fue difícil de controlar: un lote "100 vaquillonas con marca X"
    es fungible.
- **[NORMA] Inspección.** El acreedor está autorizado a inspeccionar los bienes prendados. En el
  contrato puede pactarse que el dueño informe periódicamente su estado. Si el deudor niega la
  inspección o hace un uso indebido, el acreedor puede pedir el **secuestro**.
  - **[INFERENCIA]** La ley ya prevé lo que en EE.UU. se llama *collateral inspection* y *periodic
    reporting*. Lo que nunca existió es una forma barata y confiable de ejercerlo.
- **[NORMA] Traslado.** El dueño no puede sacar los bienes del lugar donde estaban al constituir la
  garantía sin que el Registro anote el desplazamiento y notifique al acreedor. Si lo hace, el acreedor
  puede pedir el secuestro. Además hay **sanciones penales**: por ejemplo, prisión de 15 días a 1 año por
  abandonar los bienes prendados en perjuicio del acreedor. Fuente: extracto del decreto-ley.
- **[NORMA] Garantía preferida del BCRA** ⚠. Según los extractos del texto ordenado de "Garantías" del
  BCRA ([t-garant.pdf](https://www.bcra.gob.ar/archivos/Pdfs/texord/t-garant.pdf), última
  comunicación "A" 8447):
  - La prenda fija con registro sobre ganado bovino es **garantía preferida "B"**, con un margen de
    cobertura del **60 % del valor de mercado**.
  - La prenda flotante sobre ganado bovino tiene un margen del **50 %**.
  - **Verificar contra el texto vigente.**
  - **[INFERENCIA]** Para un banco argentino, prestar 100 contra un rodeo prendado implica un
    LTV regulatorio de 60 o menos. Una garantía mejor verificada no cambia ese margen regulatorio, pero
    sí puede cambiar la **política interna** del banco (aceptar la prenda, el plazo, la tasa) y la
    **previsión** por riesgo.
- **[NORMA] Resolución Conjunta 2-E/2017** ([Boletín Oficial](https://www.boletinoficial.gob.ar/detalleAviso/primera/175465/20171130),
  [Infoleg](https://servicios.infoleg.gob.ar/infolegInternet/anexos/290000-294999/293827/norma.htm)):
  - Las prendas sobre ganado se instrumentan con un **formulario específico** aprobado por la DNRPA.
  - El endoso, la cancelación, la reinscripción y los **cambios de titularidad** del ganado se
    informan al Registro de Créditos Prendarios.
  - La Subsecretaría de Ganadería colabora mediante un **Sistema Informático de Registro de Prendas
    con Registro sobre Ganado**.
  - **[PRENSA]** La norma "reactivó" la prenda ganadera e implica **bloquear la venta** de una cantidad
    determinada de animales del stock del productor ([OCLA](https://www.ocla.org.ar/noticias/11268257-agroindustria-reactiva-la-prenda-ganadera),
    [De Frente al Campo](https://www.defrentealcampo.com.ar/reactivan-la-prenda-ganadera-los-productores-podran-acceder-creditos-del-nacion/)).
  - **[INFERENCIA]** El mecanismo es la **inmovilización de una cantidad de cabezas no identificadas**
    sobre el RENSPA. No identifica animales individuales.

### 1.3 Warrant ganadero (Ley 9.643, DNU 70/2023, Decreto 640/2024, Disposición 2/2026)

- **[NORMA]** La Ley 9.643 crea los certificados de depósito y warrants sobre productos depositados en
  almacenes autorizados. El tenedor tiene derecho a **examinar los bienes y tomar muestras**
  ([Ley 9.643](https://www.argentina.gob.ar/normativa/nacional/ley-9643-37048/actualizacion)).
- **[NORMA]** El DNU 70/2023 y el Decreto 640/2024 habilitan los **warrants electrónicos**, con firma
  electrónica, negociación en plataformas y registro electrónico. También extienden el régimen a
  **cualquier producto, incluido el ganado en pie**
  ([Decreto 640/2024](https://www.boletinoficial.gob.ar/detalleAviso/primera/310750/20240719),
  [DNU 70/2023](https://www.boletinoficial.gob.ar/detalleAviso/primera/301122/20231221)).
- **[OFICIAL / PRENSA] Primer warrant ganadero (octubre de 2024)**
  ([argentina.gob.ar](https://www.argentina.gob.ar/noticias/por-primera-vez-en-la-historia-argentina-una-empresa-emitio-un-warrant-ganadero),
  [Infobae](https://www.infobae.com/revista-chacra/2024/10/28/se-emitio-el-primer-warrant-ganadero-en-argentina/),
  [Bichos de Campo](https://bichosdecampo.com/el-mundo-cambio-un-tambo-santafesino-se-financio-con-un-warrant-de-vacas-lecheras-que-cuentan-con-garantia-de-vida-24x7/)):
  - **Operación:** Pampa Negocios y Garantías S.A. emitió el warrant sobre **200 vacas lecheras** del
    tambo de Milkynet S.A. (Sunchales, Santa Fe).
  - **Crédito:** $314 millones a 5 años en UVA, con **Banco Galicia**.
  - **Seguro:** Seguros Sura.
  - **[CLAIM]** El esquema de "**fe de vida**" monitorea cada vaca 24/7 con la plataforma SiloReal y
    el robot de ordeñe DeLaval VMS. El ID de cada vaca coincide con su número en SENASA. Los sensores
    del ordeñe y de movimiento acreditan existencia y condición.
  - **[INFERENCIA]** Es el antecedente más cercano a lo que AgroGarantías quiere hacer:
    1. La identidad la da la fuente oficial (SENASA).
    2. La existencia la dan datos operativos (el ordeñe).
    3. La garantía es un título negociable (el warrant).
    4. El riesgo residual lo cubre un seguro.

    La diferencia es que funcionó en un **tambo robotizado**, donde cada vaca pasa por un sensor varias
    veces por día. Eso no existe en cría extensiva.
- **[OFICIAL] Volumen.** Los warrants alcanzaron montos récord en 2025. Según la SAGyP, los warrants
  sobre hacienda en pie sumaron unos $2.700 millones en el primer trimestre de 2025
  ([argentina.gob.ar](https://www.argentina.gob.ar/noticias/la-emision-de-warrants-fue-record-en-2025)).
  Existe un listado oficial de **empresas warranteras habilitadas**
  ([MAGyP](https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/_warrants/_archivos/000997_Empresas%20Warrants/000011_Habilitadas.php)).
- **[NORMA] Disposición 2/2026** ⚠
  ([texto](https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-2-2026-426151/texto),
  [Agroempresario](https://agroempresario.com/publicacion/118481/el-gobierno-habilito-la-inmovilizacion-de-hacienda-para-reforzar-la-seguridad-financiera-de-los-warrants-ganaderos/),
  [Contadores en Red](https://contadoresenred.com/warrants-y-certificados-de-depositos-habilitan-la-inmovilizacion-voluntaria-como-garantia/)):
  - Los emisores de warrants pueden disponer, **a pedido del dueño de la mercadería**, la
    **inmovilización voluntaria** de la hacienda incluida en la operación.
  - El mecanismo usa los sistemas de SENASA. El productor otorga **permisos de acceso a su información**
    en favor del tenedor del warrant.
  - Toda modificación de un warrant existente debe **informarse antes de las 23:59 del mismo día**.
  - Implementa y supervisa la Coordinación de Warrants y Certificados de Depósito de la SAGyP.
  - **[INFERENCIA]** Esto es, en esencia, el equivalente argentino del "**read-only access al PIC en
    NLIS**" que exigen los lenders australianos (§3). Es una pieza clave para AgroGarantías: el lender
    (o quien él autorice) puede ver los movimientos del establecimiento.
- **[PRENSA]** Antes de la Disposición 2/2026, el productor **podía mover o vender** animales aunque
  estuvieran en un warrant, y eso preocupaba a emisores y acreedores (Agroempresario).

### 1.4 Identificación electrónica obligatoria (Resolución SENASA 841/2025)

- **[NORMA]** Todo bovino, bubalino y cérvido debe tener **identificación electrónica individual y una
  caravana visual**. Los dispositivos admitidos son el botón RFID en la oreja derecha, el bolo ruminal
  y el transpondedor inyectable
  ([Boletín Oficial](https://www.boletinoficial.gob.ar/detalleAviso/primera/333885/20251103),
  [Motivar](https://www.motivar.com.ar/ganaderia/identificacion-animal-puntos-claves-la-resolucion-8412025-n5334982)).
- **[NORMA] Cronograma:**
  - Desde el 01/12/2025 está prohibido vender caravanas solo visuales.
  - **Desde el 01/01/2026**, ningún ternero puede moverse ni permanecer en el establecimiento de
    nacimiento después del destete sin identificación electrónica oficial.
  - La aplicación se declara dentro de los 10 días hábiles.
- **[INFERENCIA]** Esto cambia todo para AgroGarantías. Durante unos años va a convivir **stock nuevo
  con RFID** (terneros nacidos desde 2026) con **stock viejo sin RFID** (vacas adultas). En cría, la
  cobertura RFID del rodeo va a crecer año a año. **Un modelo basado solo en RFID no sirve hoy para el
  rodeo adulto**, pero va a servir cada vez más.

### 1.5 SIGSA, DT-e, RENSPA y TRAZA

- **[OFICIAL] SIGSA** es el sistema de SENASA que administra el registro de establecimientos con
  existencias, los eventos sanitarios y los movimientos de animales. También emite el **DT-e**
  (Documento de Tránsito Electrónico). Por autogestión el productor puede consultar sus existencias y
  declarar nacimientos, muertes y cambios de titular. Para emitir DT-e se necesita RENSPA activo, CUIT,
  clave fiscal y CBU ([SENASA – manuales DT-e](https://www.argentina.gob.ar/senasa/micrositios/dt-e/manuales-tutoriales-y-formularios),
  [SENASA – mesa de ayuda SIGSA](https://www.argentina.gob.ar/senasa/mesa-de-ayuda-sistema-integrado-de-gestion-de-sanidad-animal-sigsa)).
- **[NORMA / PRENSA] TRAZA, Resolución SAGyP 117/2026 (23/07/2026)** ⚠
  ([Infobae](https://www.infobae.com/revista-chacra/2026/07/23/crean-el-sistema-traza-para-mejorar-el-acceso-a-la-informacion-del-ganado-y-fortalecer-la-gestion-productiva/),
  [Perfil](https://www.perfil.com/noticias/economia/el-gobierno-creo-traza-un-nuevo-sistema-para-seguir-al-ganado-y-facilitar-el-acceso-al-credito-a40.phtml),
  [Infocampo](https://www.infocampo.com.ar/para-impulsar-los-warrants-ganaderos-crean-un-nuevo-sistema-informatico-de-trazabilidad-animal/)):
  - Es un sistema informático **consultivo y de aplicación optativa** que organiza datos estatales de
    toda la cadena, desde la cría hasta la faena.
  - Prevé **calcular por unidad productiva**:
    - el total de cabezas por especie;
    - los animales comprometidos en **prendas** (RC 2/17);
    - los comprometidos en **warrants**;
    - **los disponibles para usar como garantía**.
  - Sus módulos se incorporan **gradualmente**: no está todo operativo.
  - **[INFERENCIA]** TRAZA es exactamente la consulta de "**¿este rodeo ya está comprometido?**" que hoy
    falta para evitar la **doble garantía**. AgroGarantías **no debe intentar reconstruirla**. Debe
    integrarse cuando haya un acceso formal y, mientras tanto, pedir al productor la evidencia (capturas o
    PDF de TRAZA y SIGSA) y cruzarla.
- **[INFERENCIA] Qué NO hay, según lo que se pudo verificar:**
  - una API pública documentada de SIGSA o TRAZA para terceros;
  - un acceso para AgroGarantías.

  Por eso el proveedor oficial del producto actual está correctamente en `NOT_CONNECTED`. **No hay que
  inventar esa integración.**

### 1.6 Líneas de crédito y actores

| Actor | Qué ofrece (lo verificable) | Garantía | Fuente |
|---|---|---|---|
| **Banco Nación (BNA)** | Líneas para compra de hacienda, engorde y recría, en pesos y en dólares. Con la prenda ganadera reactivada en 2017, el BNA fue el primer canal anunciado. Tiene líneas con tasa bonificada para "engorde" junto con la SAGyP. | Prenda ganadera, otras según la línea. | [argentina.gob.ar](https://www.argentina.gob.ar/noticias/agricultura-y-el-banco-nacion-lanzan-creditos-por-10-mil-millones-para-el-engorde-de-ganado) [PRENSA/OFICIAL]. **No se pudo acceder al sitio del BNA.** |
| **BICE** | Créditos en **kilos de novillo** (cuota fija en kg, pagada en pesos al índice INMAG) para vaquillonas, retención de terneras y capital de trabajo. Requisitos: MiPyME de cría o ciclo completo, **RENSPA vigente** y **5 años de actividad comprobable** (SENASA, ARCA o contabilidad). Las personas humanas necesitan **garantía de SGR** o de un fondo de garantía aprobado. También tiene créditos **en litros de leche** con aval conjunto de 26 SGR vía CASFOG. | SGR, fondos de garantía, garantías reales según el monto. | [BICE](https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/), [argentina.gob.ar](https://www.argentina.gob.ar/noticias/el-gobierno-nacional-lanzo-creditos-en-kilos-de-novillo-para-aumentar-el-stock-ganadero), [BICE leche](https://www.bice.com.ar/bice-otorga-el-primer-credito-medido-en-litros-de-leche-a-un-tambo-de-villa-maria/) [LENDER/OFICIAL] |
| **Banco Galicia** | "Prenda ganadera" para compra y retención de vientres, hasta 48 meses. Préstamo prendario hasta el 90 % del bien (según el bien). Banco del primer warrant ganadero. | Prenda, warrant. | [Galicia – préstamo prendario](https://www.galicia.ar/empresas/financiaciones/prestamo-prendario) [LENDER, por extracto] |
| **Banco Provincia** | Tarjeta **Procampo**: compra de hacienda en remates con tasa 0 % hasta 180 días (promociones). | Riesgo crediticio del productor. | [Banco Provincia](https://www.bancoprovincia.com.ar/agro/agro_procampo) [LENDER, por extracto] |
| **Santander** | Productos para ganadería (tarjetas, capital de trabajo, inversión). En 2022 fue el primer banco en aceptar **granos tokenizados (Agrotoken)** como garantía. | Varias. | [Santander](https://www.santander.com/en/press-room/press-releases/2022/03/santander-and-agrotoken-join-forces-to-offer-loans-secured-by-cryptoassets) [LENDER] |
| **BBVA, Macro** | Tienen líneas agro. **No se encontró información pública específica** sobre prenda ganadera o monitoreo. **No se infiere nada.** | — | — |
| **SGR** (Garantizar, Aval Ganadero SGR, Agroaval y otras) | Avales financieros, técnicos y comerciales. Concentrados en el agro de Córdoba, Buenos Aires y Santa Fe. Exigen **contragarantías** al socio partícipe. | Aval de la SGR, con contragarantía (puede ser prenda). | [Evaluadora – Aval Ganadero SGR](https://www.evaluadora.com/ar/usr/archivos/822_Aval%20Ganadero%20SGR.pdf), [FIX SCR](https://www.fixscr.com/emisor/view?type=emisor&id=4412) [OFICIAL/calificadora] |
| **Fideicomisos y FCI ganaderos (CNV)** | Por ejemplo, el FF **Invernea Ganadero**, con CFA como fiduciario e Invernea como operador técnico, calificado **AA-.ar** por Moody's Local. La calificación pondera la **sobrecolateralización**, la experiencia del operador técnico y la diversificación geográfica. Son riesgos el biológico (mortalidad, enfermedad), la volatilidad y la **falta de precios transparentes**. | Patrimonio fiduciario (la hacienda es del fideicomiso). | [Moody's Local](https://moodyslocal.com.ar/wp-content/uploads/2025/10/MLAR_IR_FF-Invernea-Ganadero.pdf), [prospecto](https://www.cfafiduciaria.com/wp-content/uploads/2020/12/Prospecto-FF-Invernea-17-Dic-FIRMA-ANX.pdf) [calificadora] |
| **Warranteras** | Pampa Negocios y Garantías (primer warrant ganadero) y otras habilitadas por la SAGyP. | Warrant. | [MAGyP](https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/_warrants/_archivos/000997_Empresas%20Warrants/000011_Habilitadas.php) |
| **Aseguradoras** | Seguros de mortalidad o vida de hacienda (Sura en el warrant de Sunchales; seguro ganadero en los fideicomisos). | Cubren el riesgo biológico residual. | Prensa citada arriba. |

**[INFERENCIA]** Ninguna fuente pública argentina describe **cómo controla hoy un banco, durante la
vida del crédito, que el rodeo prendado sigue existiendo**. Lo único documentado es el derecho legal a
inspeccionar, la inmovilización en SENASA y, desde 2026, el acceso a datos para warrants. **La práctica
operativa real hay que relevarla con entrevistas** a oficiales de crédito agro, SGR y warranteras. Es
el primer paso recomendado en el §17.

### 1.7 Otros activos (breve)

- **Granos y silos:** warrant clásico sobre granos depositados (Ley 9.643) y tokenización de granos en
  acopio (Agrotoken, §16). El control lo hace el **depositario** (acopio o planta), que custodia la
  mercadería. Es el modelo más maduro porque **hay custodia física de un tercero**. [INFERENCIA]
- **Maquinaria:** prenda con registro clásica (bien identificado por número de serie, motor y chasis).
  Es fácil de individualizar y difícil de "duplicar". El riesgo es el traslado o la venta. [INFERENCIA]
- **Cultivos en pie:** se financian con prenda sobre la cosecha futura, CPR en Brasil o contratos de
  canje. Se monitorean con satélite (NDVI). AgroGarantías ya lo hace con Sentinel-2 real. [INFERENCIA]

---

## 2. Estados Unidos

### 2.1 Marco legal de la garantía

- **[NORMA] UCC Artículo 9:** la garantía sobre ganado es un *security interest* sobre bienes muebles
  que se **perfecciona** con un *financing statement* (UCC-1) en el registro estatal
  ([National Ag Law Center](https://nationalaglawcenter.org/lending-for-livestock-credit-for-crops-filing-a-financing-statement/)).
- **[NORMA] Food Security Act de 1985, §1324 (*farm products rule*)**
  ([AMS/USDA](https://www.ams.usda.gov/sites/default/files/media/Section1324oftheFoodSecurityAct.pdf),
  [National Ag Law Center](https://nationalaglawcenter.org/protection-for-buyers-of-farm-products-a-primer-on-the-federal-farm-products-rule/)):
  - Quien **compra** productos agropecuarios, incluido el ganado, a un productor los adquiere **libres
    de la garantía del banco**, aunque conozca su existencia.
  - Para conservar la garantía frente al comprador, el lender debe:
    - enviar **notificación directa** al comprador, o
    - inscribir un *Effective Financing Statement* en un **sistema central de registro (Central
      Filing System)** estatal certificado por el USDA, en el que se registran los compradores.
  - **[INFERENCIA]** En EE.UU. el riesgo número uno no es que "el animal no exista", sino que **se
    venda y la plata no vuelva al banco**. Por eso el sistema se construyó alrededor de **seguir el
    producido de la venta**, no del animal.
- **[OFICIAL] Inspección de marcas (*brand inspection*) en estados del oeste.** Por ejemplo, Montana
  admite *Notices of Security Interest* sobre ganado marcado: el lender registra su gravamen **contra la
  marca** en el Departamento de Ganadería, mediante un portal de *Brand Liens*
  ([Montana DOL](https://liv.mt.gov/Brands-Enforcement/Brands-Liens)). En Colorado todo bovino que entra
  a un mercado público se inspecciona por marca, y el inspector puede **retener el producido** si la
  propiedad es dudosa ([C.R.S. 35-55-112](https://law.justia.com/codes/colorado/title-35/livestock/article-55/section-35-55-112/)).
  - **[INFERENCIA]** Es un "registro de gravámenes atado al identificador del ganado" (la marca), con
    un **punto de control obligatorio en la venta**. El equivalente argentino posible es el **DT-e**: todo
    movimiento pasa por SENASA.

### 2.2 Qué exigen los reguladores sobre inspección

- **[OFICIAL] OCC, *Comptroller's Handbook – Agricultural Lending***
  ([OCC](https://www.occ.gov/publications-and-resources/publications/comptrollers-handbook/files/agricultural-lending/pub-ch-agricultural-lending.pdf)):
  - Los bancos deben tener requisitos de **inspección de cultivos y ganado**, con frecuencia y momento
    adecuados.
  - El ganado y los granos almacenados se **revalúan periódicamente**, **con más frecuencia en
    períodos de volatilidad de precios**.
  - La fuente **primaria** de repago es el flujo (la venta de la producción). La garantía ilíquida es la
    fuente **secundaria**.
  - Los préstamos para hacienda de engorde se espera que sean **autoliquidables**.
- **[OFICIAL] FCA, *Examination Manual EM-22.6, Collateral Risk Management***
  ([FCA](https://ww3.fca.gov/readingrm/exammanual/New%20Exam%20Manual/22.6.pdf)):
  - Las políticas deben definir **cada cuánto se actualizan los valores** durante la vida del préstamo.
  - Cuando un tasador externo valúa bienes muebles, debe haber **inspecciones periódicas y verificación
    por el oficial de cuenta**.
  - El nivel de inspección depende del tipo de garantía y del propósito.
- **[OFICIAL] FDIC y OCC** (extractos vía buscador):
  - el **ganado reproductor se inspecciona normalmente al menos una vez por año**;
  - el ganado de engorde o la cría, **al menos una vez durante el período de tenencia**;
  - la inspección debe hacerla **alguien distinto del oficial que decidió el crédito**;
  - la **perfección del gravamen y las inspecciones oportunas** deben estar documentadas en el legajo
    ([FDIC](https://www.fdic.gov/risk-management-manual-examination-policies/agricultural-lending)).
- **[NORMA] USDA FSA (préstamos directos):** la agencia **inspecciona la garantía mueble al menos una
  vez por año**, y más seguido si lo juzga necesario. El prestatario debe permitir el acceso
  ([7 CFR 765](https://www.ecfr.gov/current/title-7/subtitle-B/chapter-VII/subchapter-D/part-765),
  [Federal Register 2013](https://www.federalregister.gov/documents/2013/11/01/2013-25836/farm-loan-programs-clarification-and-improvement)).
- **[OFICIAL] USDA FSA (préstamos garantizados):**
  - el lender **visita periódicamente** la operación para asegurarse de que la garantía existe;
  - la tasación de la garantía mueble principal **no puede tener más de 12 meses**;
  - el prestatario presenta estados financieros anuales
    ([FSA – Guaranteed Loans](https://www.fsa.usda.gov/resources/loans/guaranteed-farm-loans),
    [7 CFR 762](https://www.ecfr.gov/current/title-7/subtitle-B/chapter-VII/subchapter-D/part-762)).

**[INFERENCIA] Estándar de facto en EE.UU.:**
- **inspección presencial anual** para cría y reproductores;
- **una inspección por ciclo** para el engorde;
- **más frecuencia ante volatilidad o mora**;
- **inspector independiente** del oficial de crédito.

**No hay una norma que obligue a usar RFID, fotos ni cámaras.**

### 2.3 Quién inspecciona y cómo (el workflow real)

- **[CLAIM] Farmers National Company** ([sitio](https://www.farmersnational.com/farm-and-ranch/services/collateral-inspection)):
  - Hace inspecciones de garantía para lenders en todo el país: feedlots, cría, cerdos, ovejas, tambos,
    granos y maquinaria.
  - Afirma **cuentan y verifican el ganado** con un intervalo de confianza "de 95 % o más".
  - Usa software propietario y formularios del lender, con reportes estandarizados "preferidos por los
    reguladores" y cumplimiento **SOC-1**.
  - Ejemplo que cita: 25 inspecciones por trimestre que suman 400.000 cabezas en 12 estados y más de
    100 ubicaciones.
- **[CLAIM / PRENSA] Contenido típico de una inspección** (fuentes de la industria): **conteo por
  categoría**, edades, **ubicación**, marca, condición y comerciabilidad, conciliación contra la
  declaración del prestatario (*livestock schedule*). Un inspector o el oficial de cuenta **va
  físicamente al campo**.
- **[CLAIM] CattleQuants y Crop Quest: conteo con dron más IA para verificar garantías**
  ([CattleQuants](https://cattlequants.com/why-use-drones-for-livestock-collateral-verification/),
  [Crop Quest](https://www.cropquest.com/automated-cattle-counting-drone-feedlot-inventory-services/)):
  - Un piloto con licencia FAA vuela cada corral o potrero, la IA cuenta y se genera un reporte con las
    fotos.
  - Afirman "≥ 99 % de precisión".
  - Afirman que los inspectores humanos "a veces se equivocan más de 50 %".
  - **Son claims de las empresas, sin auditoría independiente encontrada.**
  - **[INFERENCIA]** Muestra que en EE.UU. **existe oferta comercial de evidencia fotográfica con
    conteo automático** como alternativa al conteo visual del inspector, **en feedlot** (corrales con
    animales concentrados). **No se encontró** una fuente regulatoria que la reconozca. En cría
    extensiva el dron es caro por hectárea.
- **[LENDER] Financiación de feedlot** ([National Livestock](https://nationallivestock.com/finance/),
  [Producers Livestock](https://producers-livestock.com/credit/)):
  - préstamos **lote por lote** (cada corral es un préstamo);
  - reportes **mensuales, trimestrales o anuales** según la solidez del cliente;
  - liquidación por lote al vender, con un estado de resultados por lote (*closeout*).
  - **[INFERENCIA]** Cada lote tiene cabezas, peso de entrada, fecha y destino, y el **closeout** concilia
    lo que entró con lo que salió (vendido más muertos). Es un *borrowing base* natural.

### 2.4 Respuestas a las preguntas del brief (EE.UU.)

| Pregunta | Respuesta (con el tipo de evidencia) |
|---|---|
| ¿Cada cuánto inspeccionan? | Al menos **anual** en reproductores. **Una vez por ciclo** en engorde. **Más** ante volatilidad o mora [OFICIAL]. Los reportes de feedlot pueden ser mensuales [LENDER]. |
| ¿Quién inspecciona? | El oficial de cuenta, un inspector del banco o una **empresa tercerizada** (Farmers National) [CLAIM/OFICIAL]. Debe ser **independiente de quien aprobó el crédito** [OFICIAL]. |
| ¿Va una persona físicamente? | **Sí**, es el estándar. Los drones son una alternativa en feedlot [CLAIM]. |
| ¿Se cuentan animales? ¿Por categoría? | Sí: *head count by class*, edades y ubicación [PRENSA/CLAIM]. |
| ¿Se pesan? | En feedlot, el peso de entrada y salida está en los registros del lote. **No se encontró** que la inspección pese animales [INFERENCIA]. |
| ¿Ear tags / RFID? | **No se encontró evidencia** de que sea un requisito de la garantía. En EE.UU. la identificación oficial (ADT) es sanitaria y parcial. Se usan **marcas** (*brands*) en estados del oeste [OFICIAL]. |
| ¿Ubicación? | Sí, ubicación declarada y verificada en la visita [PRENSA]. Montana ata el gravamen a la marca, no a la ubicación [OFICIAL]. |
| ¿Condición corporal? ¿Mortalidad? | La condición y la comerciabilidad se documentan [OFICIAL – OCC]. La mortalidad sale del closeout del feedlot [LENDER]. |
| ¿Venta o movimiento? | **Food Security Act**: notificación al comprador o Central Filing System. **Inspección de marca en la venta** con retención del producido [NORMA/OFICIAL]. |
| ¿Cruce con bases oficiales? | Registros de marcas y gravámenes [OFICIAL]. No hay una base nacional de existencias equivalente a NLIS o SIGSA [INFERENCIA]. |
| ¿Fotos, cámaras, GPS, software? | Fotos en los reportes de inspección. Drones y software en empresas de inspección [CLAIM]. **No se encontró** un uso regulatorio de cámaras fijas. |
| ¿Si cae el inventario o el valor? | Se recalcula la cobertura (*borrowing base*), se pide más garantía o un repago parcial, y se clasifica el crédito. Es la práctica general de crédito con margen [INFERENCIA, OCC]. |

### 2.5 Fraude real en EE.UU. (lo que enseñan los casos)

- **[OFICIAL – DOJ] "Ghost cattle", Easterday (US$244 millones):** se facturó a Tyson la compra y el
  engorde de unas **265.000 cabezas inexistentes** entre 2016 y 2020. Se enviaban facturas y
  proyecciones con número de lote y cantidad de cabezas. Se descubrió con una **revisión interna**.
  11 años de prisión ([DOJ](https://justice.gov/opa/pr/washington-man-pleads-guilty-244-million-ghost-cattle-scam),
  [Beef Central](https://www.beefcentral.com/lotfeeding/us-cattle-feeder-pleads-guilty-to-244-million-ghost-cattle-fraud/)).
- **[PRENSA] Esquema Ponzi de ganado de unos US$650 millones (2017-2019, Mark Ray y otros):**
  "engorde" de ganado que **no existía** ([AgWeb](https://www.agweb.com/news/business/ghost-cattle-650m-ponzi-rocks-livestock-industry-money-still-missing),
  [OCJ](https://ocj.com/2025/06/all-hat-and-no-cattle-the-650-million-cattle-ponzi-scheme/)).
- **[PRENSA] Vicepresidente de un banco de Missouri (se declaró culpable en 2026):** préstamos por
  ganado **inexistente** con boletos de compraventa **falsificados**
  ([KCTV5](https://www.kctv5.com/2026/09/10/former-bank-vp-pastor-pleads-guilty-multi-million-dollar-cattle-investment-fraud-scheme/)).
- **[OFICIAL] Otros casos** de préstamos garantizados con ganado inexistente o sobredeclarado
  (Hartley, Cosman) ([FDIC OIG](https://live-fdic.oversight.gov/news/investigations-press-releases/two-individuals-convicted-conspiracy-and-fraud-cattle-ponzi);
  [ACAMS](https://www.acams.org/sites/default/files/2020-08/ALL%20HAT,%20NO%20CATTLE-%20What%20the%20AML%20Professional%20Needs%20to%20Know%20About%20Cattle%20Fraud.pdf)).
- **[INFERENCIA]** El patrón común: el lender **confió en documentos** (facturas, boletos,
  declaraciones de stock) **sin una verificación física independiente y repetida**. **Ningún caso se
  habría evitado con más OCR.** Se habrían evitado con:
  1. un conteo independiente;
  2. cruzar con una fuente oficial de existencias (algo que EE.UU. no tiene y Argentina sí: SIGSA/TRAZA);
  3. verificar que el **vendedor** de los animales existe y tenía esos animales (DT-e).

---

## 3. Australia

### 3.1 La combinación australiana

**[INFERENCIA]** Australia es el **modelo de referencia** porque combina cuatro piezas maduras:

| Pieza | Qué es | Fuente |
|---|---|---|
| **Security interest** | Registro en el **PPSR** (Personal Property Securities Register, nacional y online). Para la compra financiada se usa la variante **PMSI** (*purchase money security interest*). | [PPSR](https://www.ppsr.gov.au/education-hub/ppsr-case-studies/agriculture-flos-cattle-feed) [OFICIAL] |
| **Identificación** | **NLIS**: RFID individual obligatorio en bovinos (y por lote en ovinos), base nacional. Cada animal está asociado a un **PIC** (Property Identification Code). | [ISC – NLIS](https://www.integritysystems.com.au/identification--traceability/national-livestock-identification-system/) [OFICIAL] |
| **Movimiento** | Todo traslado, venta en remate o faena **actualiza el PIC del animal** en NLIS. Transportistas, remates y frigoríficos tienen **sanciones** si aceptan ganado sin tag NLIS. | [FIIG – StockCo](https://www.fiig.com.au/docs/default-source/issues/stockco-research.pdf) [análisis de terceros] |
| **Acceso del lender** | El productor otorga al lender **acceso de solo lectura a su PIC en NLIS** (formulario de *third-party authorisation*). | [Legacy Livestock FAQ](https://www.legacylivestock.com.au/faqs/) [LENDER], [ISC – terceros](https://www.integritysystems.com.au/about/news--events/news/2023/enabling-third-party-access-to-your-integrity-systems/) [OFICIAL] |

### 3.2 Los lenders especializados

| Lender | Qué financia | Garantía | Monitoreo | Repago y liberación |
|---|---|---|---|---|
| **StockCo** (AU/NZ, hoy del Heartland Group) | El **100 % del precio de compra** de hacienda para terminación (*finishing*), en pasturas o feedlot, por 2 a 12 meses (promedio de unos 6). Desde 2019 también **reproductores** (*breeder finance*). | **PPSR por cada factura financiada**, solo sobre los animales que pagó. Da derecho a entrar al campo y tomar la hacienda. | **[CLAIM]** Software propio que sigue **automáticamente y en tiempo real** sus activos usando NLIS. **Inspección del campo** (por StockCo o un agente como Elders) a **todo cliente nuevo**. | El producido de la venta va directo a StockCo, que cobra y libera el margen. **Pérdida histórica en NZ: 0,4 %** sobre más de NZD 1.100 millones en 20 años. |
| **Legacy Livestock** | El 100 % de la compra de hacienda de **trading** (repago a la venta) y de **reproductores** (repago mensual a 3-5 años). | **PPSR** sobre la hacienda, **sin hipoteca** sobre la tierra. | Requiere **acceso de solo lectura al PIC en NLIS**. | El producido va a Legacy, que cobra y transfiere el excedente **por cabeza** vendida. |
| **NewFarm AgriFinance** | El 100 % de la compra (con GST), de 2 a 12 meses. | **PPSR PMSI**. **Cada animal debe tener tag NLIS/RFID**. Puede pedir garantías adicionales. | (No detallado.) | Cobra del producido y libera el margen neto. |
| **Ottley Capital** | Trading, feedlots y agencias. Su lema es "Good character. Easy capital." | **PPSR solo sobre el animal individual**. | (No detallado. Las operaciones pasan por un **agente aprobado**.) | Cobra del producido de la venta, de la progenie, de la lana o de depósitos. |

Fuentes: [FIIG – StockCo](https://www.fiig.com.au/docs/default-source/issues/stockco-research.pdf),
[StockCo FAQ](https://stockco.com.au/resources/faqs/),
[StockCo NZ](https://stockco.co.nz/),
[Beef Central – breeder finance](https://www.beefcentral.com/markets/new-stock-finance-product-will-focus-on-breeder-cattle/),
[Legacy Livestock](https://www.legacylivestock.com.au/livestock-finance/),
[NewFarm](https://newfarmagrifinance.com.au/process/),
[Ottley](https://www.ottleycapital.com/).
**[LENDER/CLAIM]** salvo los datos de pérdida, que vienen del análisis de FIIG sobre información de la
compañía.

### 3.3 Cómo se cierra el círculo en Australia

**[INFERENCIA]**

1. **Originación:** inspección física del cliente nuevo y del campo, verificación del PIC y de la
   experiencia del productor.
2. **Compra:** el lender paga **directamente al vendedor o al remate** y registra el PPSR (PMSI) sobre
   esos animales. Los tags NLIS de los animales quedan **asociados al PIC del productor**.
3. **Durante el crédito:** el lender **ve en NLIS** si los animales siguen en el PIC. Un movimiento
   a otro PIC (venta, traslado, faena) aparece en la base. **La existencia física no se verifica
   con frecuencia**: se confía en que un animal con tag que no figura como movido ni faenado sigue ahí,
   y en la **sanción** a quien compra ganado sin tag.
4. **Venta:** el producido se **dirige al lender** (acuerdo con el agente o remate), que cobra y libera
   el excedente.
5. **Liberación:** se cancela la deuda de esos animales y se libera el PPSR de esa factura.

**¿Existe "verificación remota + reporte periódico + inspección física solo cuando sube el riesgo"?**
**[INFERENCIA]** En la práctica, **sí, de forma implícita**: el monitoreo continuo es NLIS (remoto), la
inspección es al inicio y "cuando hace falta", y el riesgo residual se cubre con un **LTV del 100 %
pero sobre el precio de compra, con la venta canalizada**. **No se encontró un documento público** que
lo formalice como política de inspección "basada en riesgo" con frecuencias explícitas.

**Lo que NLIS no resuelve** [INFERENCIA]:
- No prueba que el animal **esté vivo**: una muerte no declarada sigue figurando en el PIC.
- No prueba que esté **en ese potrero**: NLIS sabe de PIC, no de coordenadas.
- No prueba su **condición corporal** ni su **valor**.

Esos huecos son los que llenan el dueño (declaración), la inspección y, cada vez más, la tecnología
(Ceres Tag, §11).

---

## 4. Otros mercados

Se seleccionaron solo los que aportan algo distinto.

| País | Aporte | Fuente |
|---|---|---|
| **Nueva Zelanda** | Cuna del modelo de StockCo (desde 1995): PPSR más trazabilidad (NAIT), con una **pérdida histórica del 0,4 %** en más de NZD 1.100 millones financiados (5,5 millones de ovinos y 1 millón de bovinos). | [FIIG](https://www.fiig.com.au/docs/default-source/issues/stockco-research.pdf), [StockCo NZ](https://stockco.co.nz/) |
| **Canadá (Alberta)** | **Feeder associations** con garantía provincial (Feeder Associations Guarantee Act): **la asociación compra el ganado y conserva la propiedad legal**. El socio deposita el **5 %** en un fondo común de garantía. Un **supervisor local inspecciona los animales antes de pagar**: cantidad, descripción e identificación (marca). Debe hacer **más de una visita** durante el contrato y registrarlas en un libro. Más de CAD 12.400 millones garantizados desde 1936. **Caso Picture Butte (2025):** el gobierno suspendió los préstamos de la mayor cooperativa por incumplimientos de proceso. La auditoría provincial **visitó 52 campos y feedlots** y **encontró todos los animales**, identificados y en buen estado. | [Manual de Alberta](https://www.alberta.ca/system/files/custom_downloaded_images/af-feeder-associations-in-alberta-manual-directives-procedures.pdf), [FAA](https://www.feederassoc.com/about-faa/), [CBC](https://www.cbc.ca/news/canada/calgary/picture-butte-feeder-cooperative-falg-rj-sigurdson-alberta-1.7479866), [Canadian Cattlemen](https://www.canadiancattlemen.ca/news/unpacking-the-picture-butte-feeder-cooperative-loan-suspension/) |
| **Canadá (federal)** | **Advance Payments Program**: adelantos de hasta CAD 1 millón por año según el **valor del ganado**, con una porción sin interés. | [AgriCommodity](https://agricommodity.ca/app/), [Ontario Beef](https://www.ontariobeef.com/communications/news-media/app-program/) |
| **Uruguay** | **Trazabilidad individual obligatoria desde 2006** (SNIG), cobertura total desde 2011: más de 11,5 millones de animales y unos 90.000 productores. **Prenda sin desplazamiento** sobre semovientes (Ley 17.228) con **registro nacional**. Es el país vecino con la misma base que Argentina recién empieza a tener en 2026. | [SNIG – En Perspectiva](https://enperspectiva.uy/en-perspectiva-programa/trazabilidad-obligatoria-del-ganado-uruguayo-cumplio-20-anos-es-una-politica-de-estado-exitosa-que-garantiza-el-control-sanitario-e-impulsa-la-exportacion-de-carne-dice-gabriel-oso/), [INAC](https://www.inac.uy/innovaportal/file/5046/1/libro_trazabilidad_espanol_con_tapa_definitivo.pdf), [Ley 17.228](https://www.impo.com.uy/bases/leyes-originales/17228-2000) |
| **Brasil** | La **CPR** (Cédula de Produto Rural) admite garantía por prenda, hipoteca o **alienación fiduciaria**. **El registro en B3 o en una registradora autorizada por el BCB es obligatorio** desde 2022 para su eficacia frente a terceros. **2026:** primera CPR-F en B3 garantizada con **vacas lecheras "tokenizadas"**: 10 vacas con collar inteligente Cowmed y R$ 100.000. Según las fuentes, los bancos aplican **descuentos fuertes** al ganado como garantía (ejemplo citado: una vaca de R$ 20.000 vale R$ 8.000 como garantía). | [B3 – CPR](https://www.b3.com.br/data/files/CD/D2/A9/32/3ECA2810F9BC5928AC094EA8/cpr_lamina.pdf), [CNN Brasil](https://www.cnnbrasil.com.br/agro/vacas-tokenizadas-movimentam-r-100-mil-na-primeira-operacao-na-b3/), [Startupi](https://startupi.com.br/agronegocio-brasileiro-avanca-na-tokenizacao-de-ativos-de-carne-osso-e-chifre/) |
| **Reino Unido** | **Agricultural Charge** (Agricultural Credits Act 1928): un cargo **fijo y/o flotante** sobre todo el *farming stock* (ganado y progenie, cultivos, maquinaria), excluida la tierra. **Solo lo pueden tomar bancos**. Se registra con el formulario AC1. | [Ashfords](https://www.ashfords.co.uk/insights/articles/agricultural-charges-and-receiverships), [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/Geo5/18-19/43/section/5) |

**[INFERENCIA] Lecciones:**
1. **Alberta** muestra que **la propiedad legal en manos del financiador** más un **supervisor que
   inspecciona antes de pagar y durante el contrato** funciona desde hace 90 años, y que **la auditoría
   física sigue siendo el árbitro final**.
2. **Brasil** muestra que la **tokenización ganadera** ya existe, pero en **tambo con collares**:
   el mismo patrón que el warrant de Sunchales. La pieza clave es el sensor que prueba la existencia, no
   el token.
3. **Uruguay** muestra que, con trazabilidad individual total, la prenda sigue siendo la figura legal:
   la trazabilidad **no reemplaza** a la garantía, la **controla**.

---

## 5. Ganadería: el problema común

**[INFERENCIA]** En toda garantía ganadera hay cinco preguntas, y cada una se responde con una fuente
distinta:

| Pregunta | Mejor fuente disponible | Qué NO la responde |
|---|---|---|
| **1. ¿Es del productor?** (titularidad) | RENSPA y titular en SENASA, boletos de marca, DT-e de ingreso, facturas de compra. | Una foto. |
| **2. ¿Existe ahora?** (existencia) | Una observación física **reciente**: inspección, foto o video con fecha y GPS, lectura RFID, sensor. | Un documento viejo. Las existencias de SIGSA (declarativas: no detectan muertes no declaradas). |
| **3. ¿Cuántos y de qué categoría?** (cantidad y composición) | Un conteo independiente (humano, dron, cámara, escáner) y las existencias SIGSA por categoría. | Una foto de una parte del rodeo (cota inferior). |
| **4. ¿Sigue estando y no se vendió?** (permanencia) | **Movimientos oficiales (DT-e / SIGSA / TRAZA)**, **inmovilización** (prenda RC 2/17, Disp. 2/2026) y canalización del producido de la venta. | Un conteo aislado. |
| **5. ¿Cuánto vale?** (valor) | Categoría × kg × precio de referencia (INMAG / Mercado Agroganadero), condición corporal, preñez. | Un conteo sin categoría. |
| **6. ¿Ya está comprometido con otro?** (prelación) | Registro de prendas (DNRPA), registro de warrants, TRAZA (disponibles para garantía). | Todo lo físico. |

**[INFERENCIA]** Ninguna tecnología responde las seis. **El valor de AgroGarantías está en orquestar
las fuentes y medir cuánto de cada pregunta está respondido, con qué antigüedad y con qué calidad.**
Hoy el producto se centra en la 2 y la 3 (conteo visual). Las preguntas 4 y 6 son las que más pesan
para un banco, y dependen de **fuentes oficiales y de la estructura legal**, no de visión computacional.

---

## 6. Cría

**[INFERENCIA]** La cría es el caso **más difícil** para verificar y el **más importante** para
Argentina.

- **El activo es "la vaca que pare".** Su valor depende de que esté **preñada** y viva. El ternero es la
  producción. Indicadores [PAPER/OFICIAL INTA]:
  - destete promedio nacional de **~60-63 %**;
  - preñez promedio de 82-88 % según la campaña;
  - con buen manejo se supera el 80 % de destete
    ([INTA Informa](https://intainforma.inta.gob.ar/aumentar-5-el-indice-de-destete-para-duplicar-la-exportacion-de-carne-2/),
    [Motivar – informe de preñez](https://www.motivar.com.ar/2022/08/inta-publico-el-informe-de-prenez-2022)).
- **El rodeo es extensivo:** campos grandes, animales dispersos y conectividad escasa. **La foto o el
  dron cubren solo una parte** (cota inferior).
- **El rodeo está vivo y cambia:** pariciones (sube), destete y venta de terneros (baja), refugo de vacas
  viejas (baja), reposición con vaquillonas (sube). **La cantidad "correcta" cambia con el calendario.**
- **RFID:** las vacas adultas **probablemente no tienen RFID** hasta que se reponga el rodeo. La
  Resolución 841/2025 cubre a los terneros desde 2026 (§1.4).

**Eventos naturales donde verificar sin costo extra** [PROPUESTA]: el **tacto** (diagnóstico de preñez),
la **vacunación** (aftosa y brucelosis: los animales pasan por la manga), el **destete** y la **señalada
o caravaneo**. En todos el rodeo **pasa por la manga**, que es donde el escáner "Manga + RFID" del
producto tiene sentido.

**Indicadores útiles para la garantía** [PROPUESTA]:

| Indicador | Fuente |
|---|---|
| Vientres totales (vacas + vaquillonas) | SIGSA por categoría y conteo en la manga. |
| % de preñez | Certificado de tacto del veterinario. |
| Terneros declarados vs. vientres | Coherencia biológica: si declara 1.000 vacas y 900 terneros por año de manera sostenida, es dudoso. |
| Mortalidad declarada | SIGSA. |
| Ventas | Los DT-e de salida deben ser coherentes con el destete y el refugo. |

---

## 7. Feedlot

**[INFERENCIA]** El feedlot es el caso **más fácil** para verificar físicamente y el **más líquido**.

- Los animales están **concentrados en corrales**, son contables en una sola visita, están siempre en
  el mismo lugar y tienen ingreso y egreso documentados (DT-e de ingreso y de salida a faena).
- La **unidad natural de financiación es el lote o corral** (EE.UU.: préstamos lote por lote [LENDER];
  AU: un PPSR por factura [LENDER]).
- **Datos del lote:** cabezas al ingreso, peso de entrada, fecha, origen (RENSPA y DT-e), categoría,
  corral, días de encierre, **ADG** (ganancia diaria), consumo, mortalidad, peso estimado y precio
  esperado. El **valor del inventario** es cabezas vivas × peso estimado × precio, y el riesgo es la
  volatilidad del precio y del costo del alimento.
- **"Tengo 5.000 animales financiados y siguen ahí":**
  - **fuente oficial:** DT-e de ingreso menos DT-e de salida menos muertes declaradas = existencia teórica;
  - **fuente física:** conteo por corral (dron, foto o cámara fija; el escáner de corral del producto);
  - **fuente operativa:** el sistema de gestión del feedlot (raciones, lotes).

  La conciliación de las tres es el *borrowing base*.
- **Fraude típico:** facturar animales que no ingresaron (Easterday) o "prestar" el mismo corral a dos
  financiadores. **Lo detecta el DT-e de ingreso** (no hay animales sin DT-e) y el conteo
  independiente por corral.
- **Contratos argentinos relevantes:**
  - **hotelería** (el dueño del ganado paga por día de estadía y alimento);
  - **capitalización** (el ganado de un capitalista se engorda en el campo de otro y se reparten los
    kilos).

  En los dos, **quien tiene los animales no es su dueño**, y por eso la verificación de existencia es
  todavía más importante ([produccion-animal.com.ar](https://www.produccion-animal.com.ar/informacion_tecnica/cria/50-capitalizacion_de_hacienda_de_cria.pdf)).

---

## 8. Tambo

**[INFERENCIA]** El tambo es el caso donde **la verificación continua ya es posible hoy**, y donde se
hizo el primer warrant ganadero del país.

- **No importa solo cuántas vacas hay:** importa cuántas **producen**. El rodeo se compone de vacas en
  ordeñe, vacas secas, vaquillonas, terneras y toros.
- **La producción de leche es una prueba diaria de existencia**:
  - el **tanque** se vacía y se liquida cada día o cada pocos días;
  - la **usina** paga por litros (fuente externa e independiente);
  - un robot o una sala con identificación registra **cada vaca en cada ordeñe**
    ([CLAIM] DeLaval VMS en Sunchales).
- **Financiación argentina específica:**
  - **contratos de compraventa de leche** con **cesión del flujo futuro** de la liquidación de la usina
    (línea del BNA) [PRENSA/BCR];
  - **créditos en litros de leche** (BICE, cuota en litros al precio SIGLeA, avalados por 26 SGR)
    [LENDER].

  Fuentes: [BCR](https://www.bcr.com.ar/es/mercados/investigacion-y-desarrollo/informativo-semanal/noticias-informativo-semanal/los-contratos),
  [BICE](https://www.bice.com.ar/bice-otorga-el-primer-credito-medido-en-litros-de-leche-a-un-tambo-de-villa-maria/).
- **EE.UU.:** la *milk check assignment* (cesión del cheque de la leche) es un mecanismo habitual de
  garantía y repago ([FLAG](http://www.flaginc.org/wp-content/uploads/2013/03/DairyAssignment2005.pdf))
  [PRENSA/ONG legal].
- **Brasil (2026):** CPR-F garantizada con vacas con collar Cowmed (§4) [PRENSA].

**Modelo de garantía de un tambo** [PROPUESTA]: **vacas (prenda o warrant)**, **flujo de leche (cesión
de la liquidación)** y **datos operativos** como prueba continua. Los datos operativos son litros
diarios, vacas en ordeñe y liquidaciones de la usina. **Una caída de litros sin explicación
estacional es la primera alerta** de que faltan vacas, hay un problema sanitario o se vendió parte del
rodeo.

---

## 9. Invernada / recría

**[INFERENCIA]**

- Son animales **en crecimiento a pasto**, con un ciclo de 6 a 18 meses, y **se mueven entre
  potreros**: más dispersos que en feedlot, menos que en cría.
- Son **muy líquidos**: se venden en remate o a feedlot en un día. **El riesgo de venta no autorizada
  es el más alto** de todos los tipos.
- Es el negocio del **trading** australiano (StockCo, Legacy), con un modelo que funciona: **compra
  financiada pagada directo al vendedor, PPSR sobre esos animales, monitoreo de movimientos y
  producido de la venta canalizado al lender**.
- En Argentina, el equivalente sería:
  1. **pago directo** al consignatario o remate;
  2. **prenda o warrant** sobre los animales comprados, con **inmovilización** en SENASA;
  3. **monitoreo de DT-e** de salida;
  4. **cobranza canalizada** a través del consignatario.

  El punto 4 depende de acuerdos comerciales, no de tecnología.

---

## 10. Garantías: mapa de instrumentos

| Instrumento | País | Quién tiene el activo | Registro | Control durante la vida | Fortaleza | Debilidad |
|---|---|---|---|---|---|---|
| Prenda con registro sobre ganado | AR | El deudor | Registro de Créditos Prendarios (DNRPA) + sistema RC 2/17 | Derecho de inspección, inmovilización en SENASA, prohibición de traslado | Prioridad legal, sanción penal | Identificación por lote; el control efectivo depende del banco |
| Warrant ganadero | AR | Un depositario (warrantera) con el animal en el campo | Plataforma electrónica de la SAGyP | Inmovilización voluntaria (Disp. 2/2026), acceso a datos de SENASA, examen de los bienes | Título negociable, electrónico | Nuevo; poca historia; el depositario tiene que poder controlar |
| Aval de SGR | AR | El deudor | — | La SGR monitorea al socio | El banco recibe garantía preferida "A" | Costo; la SGR pide contragarantías |
| Fideicomiso ganadero | AR | El fiduciario (propiedad fiduciaria) | CNV | Operador técnico, auditorías, calificadora | Patrimonio separado | Estructura cara, solo a escala |
| Security interest (UCC 9) + FSA 1985 | US | El deudor | UCC-1 y Central Filing System | Inspección anual o por ciclo, notificación a compradores, inspección de marca | Protección del producido | Inspección humana cara |
| PPSR + NLIS | AU/NZ | El deudor | PPSR | NLIS de solo lectura (movimientos) e inspección inicial | Monitoreo continuo y barato; pérdida del 0,4 % (NZ) | No detecta muertes ni la condición |
| Feeder association | CA | **La asociación** (propietaria) | Ley provincial | El supervisor inspecciona antes de pagar y durante el contrato; fondo del 5 % | 90 años de historia | Requiere una estructura cooperativa |
| Agricultural Charge | UK | El deudor | Registro AC1 | Contractual | Cubre todo el *farming stock* | Solo bancos |
| CPR con alienación fiduciaria | BR | El deudor (el acreedor tiene la propiedad fiduciaria) | B3 o registradora | Contractual + sensores (Cowmed) | Registro obligatorio, título negociable | Descuento alto sobre el ganado |

---

## 11. Monitoreo durante la vida del crédito

### 11.1 Qué se hace hoy (síntesis)

| Mercado | Monitoreo continuo | Verificación física | Disparadores |
|---|---|---|---|
| AR | Inmovilización en SENASA (prenda y warrant); desde 2026, acceso a datos para warrants; TRAZA (en desarrollo) | Derecho a inspeccionar; en la práctica **no documentado públicamente** | **No documentados** |
| US | Reportes del prestatario (*livestock schedules*), estados financieros, closeout de feedlot | **Anual** (reproductores), **por ciclo** (engorde); tercerizable; independiente del oficial de crédito | Volatilidad de precios, mora (FSA: inspección anual si hubo 90 días de atraso) |
| AU/NZ | **NLIS de solo lectura** (movimientos por PIC) | Inicial (cliente nuevo); después, a criterio | Movimiento no esperado en NLIS |
| CA (Alberta) | Libro del supervisor | **Antes de pagar** y **más de una visita** por contrato; auditorías provinciales | Incumplimientos |
| BR/AR (tambo) | Sensores, collares y ordeñe 24/7 [CLAIM] | — | Pérdida de señal del animal |

### 11.2 Tecnologías: qué prueba cada una

Ver la tabla completa en el §18.2. **[INFERENCIA]** Resumen:
- **Probar existencia de un animal individual:** RFID leído hace poco, o sensor en el animal (collar,
  tag satelital, ordeñe).
- **Probar cantidad en un lugar:** conteo por imagen (dron, cámara fija, escáner) o lectura RFID masiva
  en manga.
- **Probar permanencia (no venta):** DT-e / SIGSA / TRAZA y la inmovilización.
- **Probar valor:** categoría + peso + precio de referencia.

---

## 12. Fraude

| # | Fraude | Cómo se detecta hoy | Cómo podría detectarlo AgroGarantías | Evidencia necesaria | Limitación que queda |
|---|---|---|---|---|---|
| 1 | Fotografiar los mismos animales varias veces | Ojo del inspector | Ya implementado: tracking + conteo único entre fotos y escaneos; deduplicación por hash perceptual entre verificaciones [PROPUESTA] | Fotos con hash, timestamps, solapamiento | Animales idénticos (Angus negro) son difíciles de distinguir sin RFID |
| 2 | Mover animales de un campo a otro para "mostrarlos" dos veces | Inspección simultánea (rara) | GPS de captura + geocerca del establecimiento + **cruce con DT-e** (un movimiento sin DT-e es ilegal) + RFID si existe | GPS del dispositivo, DT-e, lecturas RFID | Movimiento informal sin DT-e entre campos del mismo dueño; spoofing de GPS |
| 3 | Mostrar animales ajenos | Marca y señal | Coherencia con RENSPA, marca registrada, **RFID ↔ titular en SIGSA** | Lectura RFID contra el padrón de SENASA (cuando haya acceso); foto de la marca | Sin acceso a SIGSA solo queda la marca visual |
| 4 | Usar fotos antiguas o de internet | — | **Captura solo en la app** (no galería) con sello de tiempo del servidor, EXIF, hash y desafío aleatorio (ej.: "fotografiá el cartel con el código 7F3K") [PROPUESTA] | Metadatos y desafío | Fotos pre-grabadas reproducidas en pantalla (mitigable con detección de pantalla y video corto) |
| 5 | Manipular documentos | Revisión humana | OCR + reglas + comparación con declarado (implementado); verificación con el emisor oficial cuando exista | Documento original y fuente oficial | Sin acceso oficial, un PDF bien falsificado pasa el OCR |
| 6 | Vender parte del rodeo | Inspección siguiente (meses después) | **DT-e de salida (SIGSA/TRAZA)** + conteo periódico + caída de litros (tambo) | Acceso a movimientos | Sin acceso a movimientos solo se detecta en la siguiente verificación |
| 7 | Doble prenda / doble garantía | Informe del Registro Prendario | **TRAZA** ("disponibles para garantía") + informe de dominio y gravámenes del Registro Prendario + registro de warrants | Certificados del Registro y TRAZA | Hasta que TRAZA esté operativo, depende de pedir informes |
| 8 | Cambiar tags | — | RFID ↔ foto del animal (pelaje, raza, categoría coherentes); alerta si un RFID "rejuvenece" o cambia de categoría | Lectura + imagen en la manga | Animales muy parecidos |
| 9 | Mortalidad no declarada | Inspección | Conteo periódico vs. existencia oficial; en tambo, vacas que dejan de ordeñarse | Conteo, datos del ordeñe | En cría extensiva, un faltante de 2-3 % queda dentro del error del conteo parcial |
| 10 | Mover animales antes de la inspección | Inspección sin aviso | **Verificación con aviso corto** (ventana de 24-48 h) y **aleatoria**; cámara fija en feedlot | Programación aleatoria + DT-e | El productor siempre tiene algunas horas |
| 11 | Falsificar la ubicación | — | GPS + precisión + fuente (implementado) + coherencia con la geocerca + detección de mock location (Android) | Metadatos del dispositivo | Dispositivos rooteados |
| 12 | Imágenes de otro establecimiento | — | Geocerca + coherencia del paisaje con el satélite (potreros, aguadas, árboles) [PROPUESTA] + desafío en la foto | GPS, satélite | Campos muy parecidos |
| 13 | **Animales inexistentes con facturas falsas** (Easterday, Missouri) | Revisión interna (tarde) | **DT-e de ingreso obligatorio** por cada compra declarada + **conteo independiente** al inicio | DT-e, conteo | Colusión con el vendedor (DT-e real de animales que después se revenden) |

**[INFERENCIA]** Los fraudes 6, 7 y 13 son los que **más plata costaron** en los casos reales, y los
tres se resuelven **mejor con fuentes oficiales y estructura legal que con visión computacional**.

---

## 13. Verificación recurrente: modelos A–F

Escala: ●●● alto, ●● medio, ● bajo.

| | **A. Inspección anual + remota mensual** | **B. Foto/video mensual + RFID periódico** | **C. Cámara fija + eventos** | **D. Escáner trimestral + documental** | **E. Basada en riesgo** | **F. Híbrido** |
|---|---|---|---|---|---|---|
| Costo | ●● (una visita por año + gestión mensual) | ● (lo hace el productor) | ●●● inicial (hardware, energía, conectividad) | ●● | variable | ●● |
| Confiabilidad | ●● | ●● (cota inferior en extensivo; mejor con RFID) | ●●● en feedlot y tambo; ● en extensivo | ●● | ●●● si las reglas están bien | ●●● |
| Implementación | Fácil | Fácil (ya existe la app) | Difícil | Media | Media (requiere datos) | Media-alta |
| Fraude posible | Mover antes de la visita; fotos viejas | Fotos repetidas o de otro campo (mitigable) | Bajo en el área cubierta; nulo fuera | Mover antes del escaneo | Depende de las señales | El más bajo |
| Frecuencia | 12 meses / 1 mes | 1 mes / 3 meses | Continua | 3 meses | 7-90 días | Dinámica |
| Calidad de evidencia | ●●● anual, ● mensual | ●● | ●●● | ●● | Hereda | ●●● |
| Escalabilidad | ● (inspectores) | ●●● | ● (hardware por sitio) | ●● | ●●● | ●● |
| Hardware | No | Celular; lector RFID opcional | Cámaras, solar, internet | Celular, lector | No | Opcional por tipo |
| Internet | No | Offline + sync (implementado) | **Sí** (o almacenamiento local) | Offline + sync | No | Mixto |
| Argentina | ●● (caro por distancia) | ●●● (RFID creciente desde 2026) | ● (conectividad rural) | ●●● (eventos de manga) | ●●● | **●●●** |
| EE.UU. | ●●● (es el estándar) | ●● | ●● (feedlot) | ●● | ●●● | ●●● |
| Australia | ●● | ●● | ●● | ●● | ●●● (NLIS da la señal) | ●●● |

**[INFERENCIA]** Ningún modelo único sirve para todo. **F (híbrido) con la frecuencia determinada por
E (riesgo)** es el único que se adapta a cría, feedlot y tambo. Es además el que se parece a lo que
hacen los mercados maduros: **monitoreo continuo barato (registros oficiales) + verificación física
selectiva**.

---

## 14. Asset Passport

### 14.1 ¿Existe con otro nombre?

| Concepto existente | Mercado | Qué se parece | Qué le falta |
|---|---|---|---|
| **Borrowing Base Certificate** | US (asset-based lending) | Una declaración periódica del valor elegible de la garantía y del margen | Es declarativo, sin evidencia física |
| **Livestock schedule / collateral inspection report** | US | Conteo por categoría, ubicación, condición | Es puntual, no un historial |
| **Registro NLIS por PIC** | AU | Identidad, ubicación (PIC) e historial de movimientos por animal | No tiene valor, existencia física, documentos ni garantía |
| **"Passport" de Ceres Tag** [CLAIM] | AU/global | Proveniencia, trazabilidad y datos para financiación y seguros | Es propietario y depende de un hardware |
| **Fe de vida (SiloReal)** [CLAIM] | AR | Existencia continua por animal en tambo | Solo tambo robotizado |
| **TRAZA** [NORMA] | AR | Stock, prendados, warrants y disponibles por unidad productiva | No tiene evidencia física ni calidad de evidencia |
| **Prospecto y reportes del fideicomiso ganadero** | AR | Reporte periódico del operador técnico | Formato libre, no estandarizado |

**[INFERENCIA]** El concepto **no existe integrado**. Existen piezas: el registro (NLIS, TRAZA), el
reporte (borrowing base), la inspección y los sensores. **El Asset Passport es la unión de esas piezas
con una medida de calidad y antigüedad de la evidencia.** Ese es el diferencial defendible.

### 14.2 Diseño conceptual [PROPUESTA]

```
ASSET PASSPORT  (uno por activo en garantía; versionado e inmutable por evento)

1. IDENTIDAD
   productor (CUIT, ARCA) · establecimiento (RENSPA, ubicación, geocerca)
   tipo de producción (cría / recría / feedlot / tambo / cabaña) · marca y señal

2. GARANTÍA (estructura legal)
   instrumento (prenda RC 2/17 | warrant | aval SGR | fideicomiso | ninguno)
   registro y número · acreedor · monto · vencimiento
   inmovilización en SENASA (sí/no, cantidad) · acceso a datos otorgado (sí/no, a quién)

3. DECLARACIÓN (lo que dice el productor, con fecha)
   cabezas por categoría · kg estimados · valor declarado

4. FUENTES OFICIALES (lo que dice el Estado; vacío si no está conectado, nunca simulado como real)
   existencias SIGSA por categoría · DT-e de ingreso/egreso · vacunaciones
   TRAZA: total / prendados / en warrant / disponibles

5. DOCUMENTOS
   RENSPA, CUIT, tenencia, sanidad, tacto, boleto de marca
   OCR + consistencia (implementado) · vencimientos

6. EVIDENCIA FÍSICA (cada una con timestamp, GPS, dispositivo, hash, calidad)
   fotos · escaneos (fijo / barrido / corral / foto / manga) · RFID
   cámara fija · satélite (cultivos) · inspección humana

7. HISTORIAL
   verificaciones · cambios de cantidad · alertas · movimientos · incidentes · revisiones humanas

8. ESTADO ACTUAL (calculado; nunca escrito a mano)
   cantidad estimada (rango, no punto) · cobertura de la evidencia
   antigüedad de la última evidencia por pregunta (§5)
   Collateral Effectiveness Score (§15) · nivel de riesgo · próxima verificación
```

**Principio de diseño** [PROPUESTA]: cada dato lleva **su fuente, su fecha y su nivel de verificación**:
declarado < documental < físico < oficial. Este principio ya existe en el producto actual como capas
"declarado / extraído / verificado internamente / fuente oficial". Hay que extenderlo a **todo** el
passport.

---

## 15. Monitoreo basado en riesgo y score de efectividad de la garantía

### 15.1 ¿Existe en lending?

- **[OFICIAL]** La OCC y la FCA piden **revaluar con más frecuencia en volatilidad** y la FSA inspecciona
  anualmente si hubo mora. Es basado en riesgo, pero **con reglas gruesas** (§2.2).
- **[INFERENCIA]** El *asset-based lending* clásico ajusta la frecuencia de *field exams* y de los
  certificados de borrowing base según el riesgo del cliente (el Comptroller's Handbook de ABL lo trata).
  La lógica "más riesgo → más verificación" es estándar. **Lo nuevo sería aplicarla automáticamente con
  señales de evidencia física y oficial.**

### 15.2 Frecuencias propuestas (justificadas) [PROPUESTA]

La frecuencia debe depender de **la velocidad con que el activo puede desaparecer**, no solo de la
"confianza":

| Factor | Efecto en la frecuencia | Por qué |
|---|---|---|
| **Liquidez del activo** (cuán rápido se vende) | Invernada y feedlot: alta → más frecuente. Cría: media. Tambo: baja (pero datos diarios). | Un novillo se vende en un día; una vaca de cría preñada, menos. |
| **Ciclo productivo** | Verificar en los **eventos naturales** (tacto, vacunación, destete, ingreso a feedlot). | Costo marginal cero: el rodeo ya está en la manga. |
| **LTV / cobertura** | LTV > 70 % → más frecuente. | Menos margen para absorber faltantes. |
| **Monto** | Grandes → inspección humana periódica obligatoria. | El costo de la inspección se diluye. |
| **Historial** | Cada verificación limpia baja un escalón; una inconsistencia sube dos. | Asimetría prudencial. |
| **Señales oficiales** | Un DT-e de salida no esperado → verificación inmediata. | Es la señal más directa de venta. |
| **Volatilidad de precios** | Más volatilidad → más frecuente (OCC/FCA). | El valor cambia aunque la cantidad no. |

**Frecuencias base de partida** (a calibrar con datos reales; **no** son valores probados):

| Tipo | Riesgo bajo | Medio | Alto | Crítico |
|---|---|---|---|---|
| Feedlot (por lote) | 30 días (conteo por corral) + DT-e continuo | 14 días | 7 días | Inspección presencial |
| Invernada / recría | 60 días | 30 días | 7 días | Inspección presencial |
| Cría | **En cada evento de manga** (2-3 veces por año) + remota cada 90 días | 60 días | 15-30 días | Inspección presencial |
| Tambo | Datos diarios (litros, liquidaciones) + conteo cada 90 días | 30 días | 7 días | Inspección presencial |

**Inspección presencial obligatoria** (cualquier riesgo):
1. al **originar** (como StockCo con cliente nuevo y Alberta antes de pagar);
2. **una vez al año** en créditos de más de 12 meses (estándar de EE.UU.);
3. siempre que el score sea **"no determinable"** dos veces seguidas.

### 15.3 Collateral Effectiveness Score (CES) — alternativas [PROPUESTA]

No es un score de crédito del productor: mide **cuán efectiva es hoy la garantía** para el acreedor.

**Dimensiones y variables:**

| Dimensión | Variables | Obligatoria |
|---|---|---|
| Existencia | Antigüedad de la última evidencia física; tipo (inspección > escáner > RFID > foto) | **Sí** |
| Identidad | RENSPA activo, CUIT coincide, marca registrada, RFID ↔ titular | **Sí** (RENSPA + CUIT) |
| Cantidad | Detectado vs. declarado (rango), cobertura de la evidencia (total o parcial) | **Sí** |
| Ubicación | Evidencia dentro de la geocerca, precisión del GPS, fuente | **Sí** |
| Documentación | Requisitos obligatorios consistentes y vigentes (implementado) | **Sí** |
| Valor | Categoría × kg × precio de referencia; LTV | **Sí** para el LTV |
| Recencia | Días desde cada tipo de evidencia vs. la frecuencia exigida | **Sí** |
| Calidad de evidencia | VALIDADO / NO CONCLUYENTE / INSUFICIENTE (implementado) | **Sí** |
| Movimientos | DT-e coherentes (salidas esperadas vs. no esperadas) | Opcional (si hay acceso) |
| Prelación | Prendas o warrants previos (TRAZA / Registro) | Opcional hoy, **obligatoria** cuando haya acceso |
| Historial | N verificaciones limpias consecutivas | Opcional |
| Consistencia entre fuentes | Declarado vs. documental vs. físico vs. oficial | **Sí** |

**Alternativa 1: ponderada lineal (como el score actual).**
Fácil de explicar. El riesgo es que **compense** una falta grave con otras buenas: 100 en documentos
no debería compensar 0 en existencia.

**Alternativa 2: "eslabón más débil" con compuertas (recomendada).**
Primero **compuertas** que, si fallan, llevan el score a **NO DETERMINABLE**, sin número:

1. no hay evidencia física dentro de la ventana de recencia exigida;
2. el RENSPA o la titularidad no coinciden;
3. la evidencia está fuera de la geocerca o sin ubicación;
4. hay documentación obligatoria inconsistente sin revisión humana.

Si pasan todas las compuertas, se calcula el **mínimo** entre existencia, cantidad y valor (lo crítico),
ajustado por la recencia y la calidad.

**Alternativa 3: "cobertura de garantía" en pesos.**
`valor_verificado = cabezas_con_evidencia_reciente × kg × precio × factor_calidad`
y `cobertura = valor_verificado / saldo_deuda`. Es el **lenguaje del banco**
(LTV / borrowing base) y se compara directo con el margen del BCRA (60 % / 50 %).

**Recomendación** [PROPUESTA]: **2 + 3 juntas**:
- La **alternativa 2** decide si la garantía es **determinable** y su nivel de riesgo.
- La **alternativa 3** dice **cuánta plata cubre**.

Pesos iniciales sugeridos para el ajuste dentro de la 2: existencia 30 %, cantidad 25 %, identidad
15 %, documentos 10 %, ubicación 10 %, recencia/calidad 10 %. **Son un punto de partida** a calibrar
con los primeros 50-100 casos reales y revisión humana.

**Reglas de "no determinable"** [PROPUESTA]: además de las compuertas, cuando la cobertura física sea
< 30 % del declarado (barrido parcial en extensivo) **y** no haya RFID ni fuente oficial que complete
el resto.

---

## 16. Tokenización

**[INFERENCIA, basada en los casos]** La pregunta correcta no es "¿tokenizamos?" sino "¿qué
tiene que ser cierto para que un token sobre ganado valga algo?".

**Casos reales:**
- **Agrotoken (granos, AR):** cada token equivale a una tonelada **físicamente reservada en un acopio**,
  con "prueba de reserva" en blockchain. Santander lo aceptó como garantía en 2022
  ([Santander](https://www.santander.com/en/press-room/press-releases/2022/03/santander-and-agrotoken-join-forces-to-offer-loans-secured-by-cryptoassets),
  [La Nación](https://www.lanacion.com.ar/economia/campo/agrotoken-como-convertir-granos-en-activos-digitales-nid08032022/))
  [LENDER/PRENSA].
  - **[INFERENCIA]** Funciona porque **hay un custodio físico** (el acopio) que responde por el grano.
    El token es la representación; **la garantía real es la custodia**.
- **Vacas tokenizadas (BR, 2026):** CPR-F de R$ 100.000 registrada en B3 con 10 vacas lecheras con
  collar Cowmed [PRENSA].
  - **[INFERENCIA]** Funciona porque hay **un sensor por animal**, **un registro legal obligatorio**
    (B3) y **un título legal** (la CPR). El token "vincula criptográficamente" los datos al contrato,
    pero **la ejecutabilidad la da la CPR**, no el token.
- **Warrant ganadero (AR, 2024):** **ya es un título electrónico negociable**, sin blockchain. Funciona
  por la Ley 9.643, la warrantera, SENASA y el seguro.

**Conclusión [INFERENCIA]:** **el cuello de botella no es la representación digital, es la existencia
verificable y la ejecutabilidad.** El orden correcto es:

```
1. Estructura legal ejecutable  (prenda / warrant / CPR / fideicomiso)       ← sin esto, el token es humo
2. Identidad + registro oficial (RENSPA, RFID, SIGSA, TRAZA)
3. Verificación inicial independiente
4. Monitoreo recurrente con evidencia y score (ASSET PASSPORT)              ← lo que AgroGarantías construye
5. Seguro del riesgo biológico residual
6. Representación negociable    (warrant electrónico ya existe; token opcional)
```

**[INFERENCIA]** En Argentina, el paso 6 **ya está resuelto por ley sin blockchain** (warrant electrónico
negociable). Un token agregaría valor solo para **fraccionar** (inversores minoristas) o para
**componibilidad** con DeFi. Las dos cosas traen regulación de la CNV y riesgo reputacional, y **no
resuelven** el problema de existencia. **AgroGarantías debería ser el proveedor de la prueba de
existencia y del Asset Passport que usa quien emita el título** (warrantera, fiduciario, emisor de CPR o
token), no el emisor.

---

## 17. Modelo propuesto para AgroGarantías

### 17.1 Posicionamiento [PROPUESTA]

> **AgroGarantías es la infraestructura de verificación continua de garantías agropecuarias.**
> **No presta, no emite títulos y no custodia.** Le da a quien presta o emite (bancos, SGR, warranteras,
> fiduciarios, aseguradoras, fondos) un **Asset Passport** con un **Collateral Effectiveness Score**,
> alimentado por **fuentes oficiales + evidencia física + documentos**, con **verificación física
> proporcional al riesgo** e **inspección humana cuando algo no cierra**.

Clientes en orden de prioridad (por el dolor y la regulación que ya los obliga):

1. **Warranteras** (Disp. 2/2026: tienen que controlar la hacienda inmovilizada).
2. **SGR** (avalan y necesitan controlar su contragarantía).
3. **Bancos** (prenda ganadera).
4. **Fiduciarios y operadores técnicos** de fideicomisos ganaderos.
5. **Aseguradoras** (seguro de mortalidad de la hacienda en garantía).

### 17.2 Arquitectura de verificación por tipo de activo [PROPUESTA]

| Tipo | Garantía legal recomendada | Fuente oficial | Evidencia física principal | Frecuencia base | Inspección humana |
|---|---|---|---|---|---|
| **Feedlot** | Prenda por lote o warrant + inmovilización | DT-e de ingreso y egreso, SIGSA | Conteo por corral (escáner de corral, dron o cámara fija si el cliente la tiene) | 30 días + DT-e continuo | Al originar y una vez al año |
| **Invernada** | Prenda o warrant + inmovilización + cobranza canalizada | DT-e de salida | Barrido y escáner; RFID en manga cuando exista | 60 días | Al originar y ante un DT-e no esperado |
| **Cría** | Prenda de vientres + inmovilización | SIGSA por categoría, vacunaciones | **Manga + RFID en eventos** (tacto, vacunación, destete); certificado de tacto | Por evento (2-3 por año) + remota cada 90 días | Al originar y una vez al año |
| **Tambo** | Warrant o prenda + **cesión de la liquidación de leche** | SIGSA, SIGLeA (precio) | **Litros diarios y liquidaciones de la usina** + conteo en la sala | Datos continuos + conteo cada 90 días | Al originar |
| **Cultivos** | Prenda sobre la cosecha o warrant posterior | — | **Sentinel-2 (implementado)** | 5-10 días (revisita satelital) | Ante una anomalía |
| **Silos y granos** | Warrant | Plataforma de warrants | Custodia de la warrantera; foto del silo bolsa / el acopio | Mensual | La da la warrantera |
| **Maquinaria** | Prenda con registro | Registro prendario | Foto con número de serie y GPS | Semestral | Rara |
| **Infraestructura** | Hipoteca (fuera de alcance) | — | — | — | — |

### 17.3 Flujo de un crédito ganadero con AgroGarantías [PROPUESTA]

1. **Originación:** el banco o la warrantera crea la solicitud y el productor carga documentos,
   establecimiento y activo (ya implementado).
2. **Identidad:** RENSPA, CUIT y titular, con OCR y consistencia (implementado). Pedir **certificado
   de existencias SIGSA** y **constancia TRAZA** (PDF o captura) con lectura automática y comparación.
3. **Prelación:** informe del Registro Prendario y de warrants, y TRAZA "disponibles". Si hay una
   garantía previa, se bloquea o pasa a revisión humana.
4. **Verificación inicial independiente:** escáner y fotos **más inspección humana** (propia o
   tercerizada) que firma en la app. Establece la **línea de base**.
5. **Constitución de la garantía:** la hace el banco o la warrantera (prenda o warrant + inmovilización).
   AgroGarantías **registra** el número y el estado en el passport, no lo constituye.
6. **Monitoreo:** frecuencia según el riesgo (§15.2), evidencia en la app (offline + sync), datos
   operativos (tambo) y DT-e (cuando haya acceso).
7. **Alertas:** caída de la cantidad, evidencia vencida, salida no esperada, inconsistencia
   documental, señal de fraude → sube el riesgo → más frecuencia → **inspección humana**.
8. **Reporte al acreedor:** passport + score + cobertura en pesos, en el formato que el banco
   archiva en el legajo (y que el BCRA o el auditor pueden revisar).
9. **Cancelación y liberación:** se registra en el passport; el historial sirve para la próxima
   operación (renovación más barata).

---

## 18. Tablas comparativas

### 18.1 Modelos por país

| Modelo | País | Activo | Garantía | Identificación | Frecuencia | Monitoreo | Inspección | Fuente oficial | Riesgo |
|---|---|---|---|---|---|---|---|---|---|
| Prenda ganadera bancaria | AR | Cría, invernada | Prenda con registro (RC 2/17) | Por lote + marca (RFID desde 2026) | No documentada | Inmovilización SENASA | Derecho legal; práctica no documentada | SIGSA, Registro Prendario | Medio-alto (control débil) |
| Warrant ganadero | AR | Tambo (primero), extensible | Warrant electrónico | Individual (ID SENASA) | Continua (sensores) [CLAIM] | Sensores + inmovilización (Disp. 2/2026) | Examen del depositario | SIGSA, TRAZA | Bajo en tambo robotizado |
| Fideicomiso ganadero | AR | Recría, feedlot | Propiedad fiduciaria | Según el operador | Reportes del fiduciario | Operador técnico | Auditoría | CNV | Medio (calificado AA-.ar) |
| Crédito agro bancario | US | Cría, engorde, tambo | UCC-9 + FSA 1985 | Marca (estados del oeste) | Anual / por ciclo | Reportes del prestatario | **Presencial, independiente** | Registro de marcas y gravámenes | Medio |
| FSA directo | US | Todos | Gravamen federal | — | **Al menos anual** | Estados anuales | Presencial | — | Medio |
| Inspección tercerizada con dron | US | Feedlot | (la del lender) | — | Pedido del lender | — | Dron + IA [CLAIM] | — | Bajo en feedlot |
| StockCo / Legacy / NewFarm / Ottley | AU/NZ | Trading, feedlot, reproductores | PPSR (PMSI) por factura | **NLIS RFID individual** | Continua (movimientos) | **NLIS de solo lectura** | Inicial | NLIS | Bajo (0,4 % de pérdida en NZ) |
| Feeder association | CA | Engorde | Propiedad de la asociación + garantía provincial | Marca | Antes de pagar + más de una visita | Libro del supervisor | **Presencial obligatoria** | Ley provincial | Bajo |
| CPR tokenizada | BR | Tambo | CPR-F + registro B3 | Collar individual | Continua [CLAIM] | Sensores | — | B3 | Experimental |
| Prenda sin desplazamiento | UY | Semovientes | Prenda registrada | **SNIG RFID individual (100 %)** | — | SNIG | — | SNIG | — |

### 18.2 Tecnologías

| Tecnología | Qué demuestra | Limitación | Costo relativo | Madurez |
|---|---|---|---|---|
| **Documento + OCR** | Que existe un documento con esos datos y que coincide con lo declarado | No prueba autenticidad sin la fuente oficial; no prueba existencia física | ● | ●●● (implementado) |
| **RENSPA** | Que el establecimiento está registrado y su titular | No dice cuántos animales hay hoy | ● | ●●● |
| **Existencias SIGSA** | Stock declarado por categoría según SENASA | Declarativo: no detecta muertes ni faltantes no declarados | ● | ●●● (sin API para terceros) |
| **DT-e** | Movimientos **legales** de entrada y salida | No ve movimientos informales; requiere acceso | ● | ●●● |
| **TRAZA** | Total, prendados, en warrant y **disponibles para garantía** | Optativo, **en desarrollo gradual** | ● | ● (2026) |
| **Foto** | Animales en un lugar y momento (con GPS y hash) | Cota inferior; reutilizable si no se controla | ● | ●●● |
| **Video** | Más cobertura y más difícil de falsificar que la foto | Peso de los datos; conectividad | ● | ●● |
| **YOLOX (conteo visual)** | Cantidad de bovinos detectados en imagen o video | Oclusión, distancia, animales iguales; **cota inferior** en extensivo; la precisión depende de la escena (sin benchmark de campo propio publicado) | ● | ●● (implementado; falta validar en campo) |
| **RFID (manga)** | **Identidad individual** del animal leído, en ese momento | Solo animales con tag (stock nuevo desde 2026); requiere pasar por la manga | ●● (lector) | ●●● (tecnología); ●● en el rodeo argentino |
| **Cámara fija** | Conteo continuo en un corral o aguada | Hardware, energía, internet; solo cubre su campo visual | ●●● | ●● |
| **Satélite** | Cultivos: NDVI, superficie y cambios (implementado). Ganado: conteo experimental (error de ±4 cabezas por escena en Argentina con Pleiades [PAPER]; 77 % de detección en Amazonia [PAPER]) | Resolución, nubes, costo de imágenes VHR; **no identifica animales** | ●● (VHR) | ●●● cultivos; ● ganado |
| **Dron** | Conteo completo de corrales y potreros | Costo por hectárea en extensivo; regulación ANAC | ●● | ●● (US, claims de ≥ 99 %) |
| **Collar o tag satelital** (Ceres Tag, Cowmed) | Existencia, ubicación y actividad continua por animal | Costo por animal; batería | ●●● | ●● [CLAIM] |
| **Datos de ordeñe y usina** | Existencia y productividad diaria del tambo | Solo tambo; requiere acceso a los datos | ● | ●●● |
| **Inspección humana** | Todo lo anterior + criterio + firma responsable | Cara, lenta, a veces imprecisa [CLAIM CattleQuants]; puede ser engañada | ●●● | ●●● (es el estándar regulatorio) |

---

## 19. Mapa de documentación

Abreviaturas: **Obl.** = obligatorio; **Línea** = depende del banco o la línea. Automatizable:
✓ sí, ◐ parcial, ✗ no.

### Productor

| Documento | Quién lo genera | Quién lo verifica | Actualización | Qué demuestra | Obligatorio | Oficial | Automatizable |
|---|---|---|---|---|---|---|---|
| DNI / estatuto y poderes | Estado / sociedad | Banco | Al originar | Identidad, capacidad | Obl. | Sí | ◐ (OCR) |
| Constancia de CUIT (ARCA) | ARCA | Banco | Anual | Situación fiscal, actividad | Obl. | Sí | ✓ (OCR; consulta pública de CUIT) |
| Certificado MiPyME | SEPyME | Banco | Anual | Acceso a líneas PyME | Línea (BICE) | Sí | ◐ |
| Estados contables / manifestación de bienes | Contador | Banco | Anual | Capacidad de pago | Obl. (empresa) | No | ◐ |
| DDJJ de Ganancias y Bienes Personales | ARCA (vía productor) | Banco | Anual | Ingresos, patrimonio | Línea | Sí | ◐ |
| Situación en la Central de Deudores | BCRA | Banco | Mensual | Historial crediticio | Obl. (el banco la consulta) | Sí | ✓ (consulta pública BCRA) |

### Establecimiento

| Documento | Quién lo genera | Quién lo verifica | Actualización | Qué demuestra | Obligatorio | Oficial | Automatizable |
|---|---|---|---|---|---|---|---|
| RENSPA | SENASA | Banco / SENASA | Al cambiar los datos | Establecimiento registrado y titular | Obl. | Sí | ◐ (OCR; sin API) |
| Título o contrato de arrendamiento | Escribano / partes | Banco | Al originar / vencer | Tenencia del campo | Obl. o Línea | Parcial | ◐ |
| Plano o geocerca | Productor / agrimensor | AgroGarantías | Al originar | Ubicación y superficie | Propuesta | No | ✓ |

### Ganadería

| Documento | Quién lo genera | Quién lo verifica | Actualización | Qué demuestra | Obligatorio | Oficial | Automatizable |
|---|---|---|---|---|---|---|---|
| Existencias SIGSA por categoría | SENASA (declarado) | Banco | Continua | Stock oficial | Línea | Sí | ◐ hoy (PDF/OCR); ✓ con acceso |
| DT-e | SENASA | Banco / AgroGarantías | Por movimiento | Entradas y salidas legales | Obl. (para mover) | Sí | ◐ / ✓ con acceso |
| Vacunaciones (aftosa, brucelosis) | SENASA / fundación | SENASA | Campaña | Sanidad, conteo implícito | Obl. sanitario | Sí | ◐ |
| Certificado de tacto | Veterinario | Banco | Anual (cría) | Preñez = valor | Línea | No | ◐ (OCR) |
| Boleto de marca y señal | Provincia | Banco | Renovación | Propiedad por marca | Línea | Sí | ◐ |
| Declaración de RFID (Res. 841/25) | Productor en SIGSA | SENASA | 10 días hábiles | Identificación individual | Obl. (desde 2026) | Sí | ✓ con acceso |

### Garantía

| Documento | Quién lo genera | Quién lo verifica | Actualización | Qué demuestra | Obligatorio | Oficial | Automatizable |
|---|---|---|---|---|---|---|---|
| Contrato de prenda (formulario RC 2/17) | Partes → Registro | Registro Prendario | Al constituir / endosar / reinscribir | Garantía constituida | Obl. (si es prenda) | Sí | ◐ |
| Informe de dominio y gravámenes | Registro Prendario | Banco | Al originar | Ausencia de prendas previas | Obl. | Sí | ◐ |
| Certificado de depósito y warrant | Warrantera | Tenedor | Por operación | Título y garantía | Obl. (si es warrant) | Sí (plataforma) | ✓ |
| Constancia de inmovilización | SENASA / emisor | Acreedor | Por operación | Bloqueo de venta | Línea | Sí | ◐ |
| Constancia TRAZA | SAGyP | Acreedor | Continua | Prendados, warrant, disponibles | Propuesta | Sí | ◐ (en desarrollo) |
| Aval de SGR | SGR | Banco | Por operación | Garantía preferida | Línea | Regulado | ◐ |
| Póliza de seguro de hacienda | Aseguradora | Banco | Anual | Cobertura del riesgo biológico | Línea | No | ◐ (OCR) |

### Financiación

| Elemento | Quién lo define | Qué contiene |
|---|---|---|
| Destino | Banco / línea | Compra de vientres, retención, engorde, capital de trabajo |
| Monto y plazo | Banco | Por ejemplo, BICE: hasta 36-48 meses, gracia de 6 meses |
| Amortización | Banco | Francés, en UVA, en kg de novillo (INMAG), en litros de leche (SIGLeA) |
| Covenants [PROPUESTA de mínimos] | Banco | Mantener la cantidad ≥ X % del declarado; verificación al día; aviso de movimientos; seguro vigente; cobertura ≥ Y % |
| Mantenimiento de la garantía | Contrato + ley | Inspección (Dec.-Ley 15.348), inmovilización, reposición de animales vendidos |

---

## 20. Respuestas concretas (las 20 preguntas)

1. **¿Cómo se garantiza hoy el ganado en Argentina?**
   - Con **prenda con registro** (formulario RC 2/17 e inmovilización en SENASA), **avales de SGR**
     (lo más usado en líneas como las del BICE para personas humanas) y, desde 2024, **warrant
     ganadero** (más inmovilización voluntaria y acceso a datos desde 2026).
   - Los fideicomisos ganaderos son la opción a escala de mercado de capitales.
   - El **control durante la vida del crédito no está documentado públicamente** y probablemente es
     débil, dado que la propia SAGyP justificó la Disp. 2/2026 en que los animales en warrant podían
     venderse.
2. **¿En EE.UU.?**
   - Con un *security interest* (UCC-9) + la **Food Security Act** para seguir el producido de las
     ventas.
   - **Inspección presencial anual** (reproductores) o por ciclo (engorde), hecha por alguien
     **independiente** del oficial de crédito, a menudo **tercerizada**.
   - En el oeste, gravámenes **sobre la marca** con inspección en la venta.
3. **¿En Australia?**
   - Con **PPSR (PMSI)** sobre los animales comprados, **NLIS RFID** individual, **acceso de solo
     lectura al PIC** del productor e **inspección inicial**.
   - El producido de la venta se canaliza al lender.
   - Financian el 100 % de la compra con pérdidas muy bajas (0,4 % histórico en NZ).
4. **¿Qué hacen mejor esos mercados?**
   - **AU:** monitoreo continuo y barato de movimientos atado a la identidad individual.
   - **US:** disciplina de inspección independiente y documentada, y protección del producido.
   - **CA:** inspección antes de pagar y propiedad del financiador.
5. **¿Qué NO se puede trasladar a Argentina (todavía)?**
   - RFID en el 100 % del rodeo: en Argentina es solo para terneros desde 2026, así que faltan años.
   - Acceso API a la base oficial: SIGSA y TRAZA no tienen una API pública para terceros.
   - Sanciones efectivas al comprador de ganado sin identificar.
   - Canalización del producido como práctica de los consignatarios.
   - El costo del inspector de EE.UU. en distancias argentinas.
6. **¿Qué problema concreto resuelve AgroGarantías?**
   - **Hacer barata, frecuente y auditable la verificación de existencia y cantidad** que la ley ya
     permite (derecho de inspección) y que los acreedores (warranteras, SGR, bancos) necesitan
     ejercer.
   - **Integrar esa evidencia** con las fuentes oficiales (SIGSA, DT-e, TRAZA) en un passport con
     score.
7. **Modelo operativo ideal:** el **F (híbrido)** con frecuencia por **riesgo (E)**: fuentes oficiales
   + documentos + evidencia física proporcional + inspección humana por excepción (§17).
8. **Frecuencia:**
   - **por evento productivo** en cría;
   - **30 días** en feedlot;
   - **60 días** en invernada;
   - **datos continuos** en tambo;
   - escalada a 7 días o inspección presencial según el riesgo (§15.2);
   - inspección humana al originar y una vez al año.
9. **Evidencia por verificación:**
   - captura en la app (no galería) con GPS, timestamp del servidor, hash y desafío;
   - conteo por el modo adecuado al tipo de producción;
   - RFID si hay manga;
   - documentos vigentes;
   - en tambo, litros y liquidación.
10. **Fuentes oficiales a cruzar:**
    - RENSPA y existencias SIGSA;
    - DT-e;
    - vacunaciones;
    - declaración de RFID (Res. 841/25);
    - **TRAZA** (prendados, warrant, disponibles);
    - Registro Prendario;
    - plataforma de warrants;
    - ARCA (CUIT);
    - BCRA (Central de Deudores);
    - precios: INMAG y SIGLeA.
11. **¿Cuándo inspección presencial?**
    - al originar;
    - una vez al año en créditos de más de 12 meses;
    - con score "no determinable" dos veces;
    - ante una caída de cantidad que supere la tolerancia;
    - ante un DT-e de salida no explicado;
    - ante una sospecha de fraude (desafío fallido, fotos repetidas, fuera de la geocerca).
12. **¿Cómo detectar fraude?** Ver §12. Lo principal es **cruzar con DT-e y TRAZA** (venta, doble
    garantía, animales inexistentes), **hacer una línea de base independiente** y usar **captura
    controlada** (fotos viejas, de otro campo o repetidas).
13. **¿Qué necesita el banco?**
    - el passport con el estado actual y su **cobertura en pesos** frente a la deuda;
    - las alertas con su motivo;
    - la evidencia descargable para el legajo y la auditoría;
    - el estado de la prelación (sin garantías previas);
    - el cumplimiento de los covenants.
14. **¿Qué necesita el productor?**
    - saber **qué tiene que hacer y cuándo** (próxima verificación, en el próximo evento de manga);
    - hacerlo **sin conexión** y en minutos;
    - entender **por qué** se le pide;
    - que una buena historia le **baje el costo** (menos frecuencia, mejor tasa).
15. **¿Qué se puede automatizar?**
    - OCR y consistencia de documentos;
    - conteo visual;
    - deduplicación;
    - controles de GPS y geocerca;
    - recencia;
    - score y alertas;
    - programación de verificaciones;
    - lectura de constancias oficiales en PDF;
    - y, con acceso formal, la consulta de DT-e y TRAZA.
16. **¿Qué queda bajo revisión humana?**
    - la **originación** (línea de base);
    - las **inconsistencias documentales**;
    - **toda alerta de riesgo alto o crítico**;
    - los casos "no determinables";
    - la **decisión de crédito y de ejecución**: siempre es del acreedor, nunca de AgroGarantías.
17. **¿Cuál es nuestro Asset Passport?** El del §14.2: identidad, garantía, declaración, fuentes
    oficiales, documentos, evidencia física, historial y estado calculado, con fuente, fecha y nivel de
    verificación en **cada** dato.
18. **¿Cómo evoluciona a financiación o tokenización?**
    - Como **proveedor de la prueba de existencia** para warranteras, fiduciarios y emisores de títulos
      (incluidos tokens).
    - **No** como emisor.
    - La tokenización solo después de tener estructura legal, verificación y seguro (§16).
19. **MVP mínimo:**
    1. Un tipo de activo. **Hipótesis por defecto: feedlot (por lote o corral)**, porque es el más
       verificable en una visita, tiene DT-e de ingreso y egreso, ciclos cortos y una unidad de
       financiación clara (el lote). El segundo candidato es la **cría en eventos de manga**, la más
       relevante para Argentina pero la más difícil de verificar. **Confirmar con las entrevistas del
       §21** qué activo tiene más demanda entre warranteras y SGR.
    2. Un tipo de cliente: **warrantera o SGR**.
    3. Passport + score con compuertas + programación por riesgo.
    4. Captura controlada.
    5. Carga de constancias SIGSA y TRAZA en PDF con OCR.
    6. Inspección humana con firma en la app.
    7. Reporte para el legajo.
20. **Producto completo a 3 años:**
    - integración formal con SENASA y TRAZA (acceso delegado como en la Disp. 2/2026);
    - RFID masivo (el rodeo nuevo);
    - datos de tambo (usinas y ordeñe);
    - satélite para cultivos y pasturas;
    - red de inspectores tercerizados con app;
    - score calibrado con historia real;
    - integración con la plataforma de warrants;
    - API para bancos, SGR y aseguradoras;
    - expansión a Uruguay (SNIG) y Paraguay.

---

## 21. Qué cambiaría en el producto actual

Inventario del producto en `feature/bovinos` contrastado con este research. [PROPUESTA]

### Mantener (está alineado con lo que piden los mercados maduros)

| Feature | Por qué |
|---|---|
| Solicitud de garantía entidad → productor → verificación | Es el flujo de originación. |
| Capas declarado / extraído / verificado internamente / fuente oficial (`NOT_CONNECTED`) | Es el principio central del passport. Que no se simule la fuente oficial es correcto. |
| OCR determinista de documentos y requisitos por producto | Resuelve la parte documental sin inventar datos. |
| Escáner de corral, barrido, fijo y **Manga + RFID** | La manga con RFID es el modo correcto para **cría en eventos**. El de corral, para **feedlot**. |
| Captura con GPS, precisión y fuente; conteo único entre fotos | Mitigan los fraudes 1, 2 y 11. |
| Estados VALIDADO / NO CONCLUYENTE / INSUFICIENTE y "cota inferior" | Es honesto y coincide con el "no determinable" que propone el §15. |
| Satélite real (Sentinel-2) para cultivos | Es el estándar para cultivos. |
| Monitoreo con frecuencia configurable | Es la base del monitoreo por riesgo. |
| Offline + sync del escáner | Es imprescindible para la conectividad rural argentina. |
| Auditoría y evidencia inmutable con hash | Lo exige el legajo y la auditoría (estilo SOC-1). |

### Modificar

| Feature | Cambio |
|---|---|
| **Score actual** (ponderado) | Pasar a **compuertas + eslabón más débil** y agregar la **cobertura en pesos** (alternativas 2 + 3 del §15.3). Agregar el estado **"no determinable"** explícito. |
| **Frecuencia de monitoreo** (manual) | Hacerla **automática por riesgo y por tipo de producción** (§15.2), con eventos de manga en cría. |
| **Proveedor SENASA** | Mantener `NOT_CONNECTED`, pero agregar **carga de constancias oficiales** (existencias SIGSA, DT-e, **TRAZA**) en PDF con OCR y comparación, como "fuente oficial aportada por el productor" (un nivel intermedio y explícito). |
| **Requisitos documentales** | Agregar el **informe de gravámenes del Registro Prendario**, la **constancia TRAZA**, la **constancia de inmovilización** y el **certificado de tacto** (cría). |
| **Fotos de galería** | En verificaciones recurrentes, **solo captura en la app**, con desafío aleatorio. La galería queda solo para documentos. |
| **Tipos de producción** | Separar **invernada/recría** de **pastoreo** y agregar **tambo** con su propia estrategia (litros + conteo). |
| **Reporte PDF** | Reformularlo como **passport + cobertura + cumplimiento de covenants** para el legajo bancario. |
| **Fuentes cruzadas** | Convertirlo en el "estado por pregunta" del §5 (titularidad, existencia, cantidad, permanencia, valor, prelación), cada una con su antigüedad. |

### Eliminar o despriorizar

| Feature | Por qué |
|---|---|
| Gateway de **cámaras simuladas** como evidencia por defecto | Las cámaras fijas son una opción para feedlot y tambo con infraestructura, no la base. Mantenerlo solo en demo. |
| Conteo satelital de **ganado** (si se planeara) | La evidencia científica muestra resultados mixtos (§18.2). No es para garantía. |
| Énfasis de UX en "verificar ahora" a demanda | El modelo correcto es **programado por riesgo**, no a pedido. |

### Agregar

1. **Asset Passport** como entidad central: versionado, con fuente, fecha y nivel por dato.
2. **Garantía legal** en el activo: instrumento, registro, acreedor, monto, vencimiento,
   inmovilización y acceso a datos otorgado.
3. **Inspección humana** como tipo de evidencia de primera clase: inspector identificado, firma, checklist
   por tipo de producción, independiente de quien origina.
4. **Programador de verificaciones por riesgo**, con escalamiento y ventanas cortas aleatorias.
5. **Cobertura en pesos** (categoría × kg × INMAG) frente al saldo de la deuda, y LTV.
6. **Covenants** configurables por el acreedor, con su cumplimiento.
7. **Prelación**: verificación de garantías previas (informes + TRAZA).
8. **Tambo**: carga de liquidaciones de la usina y litros diarios, con alertas por caída.
9. **Desafío anti-fraude** en la captura (código aleatorio en la escena).

### Dejar como roadmap

1. Integración API con SIGSA, DT-e y TRAZA, **solo con acceso formal** (convenio o el mecanismo de la
   Disp. 2/2026).
2. Integración con la plataforma de warrants de la SAGyP.
3. Collares o tags satelitales (Ceres Tag, Cowmed) y datos de ordeñe robotizado.
4. Drones para feedlot (servicio tercerizado).
5. Red de inspectores tercerizados.
6. Tokenización (después de estructura legal, verificación y seguro).
7. Uruguay (SNIG) como segundo país.

### Antes de programar: validación con el mercado

**[PROPUESTA]** El hueco más grande de esta investigación es la **práctica operativa real** de los
acreedores argentinos, que no está publicada. Antes de construir lo anterior:

1. **5-8 entrevistas:** 2 warranteras (Pampa Negocios y Garantías u otras habilitadas), 2 SGR con
   cartera ganadera, 2 oficiales de crédito agro de bancos (BNA o Galicia) y 1 aseguradora de hacienda.
2. **Preguntas clave:**
   - ¿Cómo y cada cuánto verifican hoy la existencia?
   - ¿Cuánto les cuesta una inspección?
   - ¿Qué formato tiene el legajo?
   - ¿Qué acceso a SIGSA, TRAZA o la inmovilización usan?
   - ¿Qué les haría aceptar más ganado como garantía?
3. **Leer los textos completos** de la Disp. 2/2026, la Res. 117/2026, la RC 2-E/2017 y el texto
   ordenado de Garantías del BCRA (márgenes), desde un entorno con acceso a los sitios oficiales.

---

## 22. Fuentes

Todas consultadas el **05/10/2026** (acceso por buscador; ver la limitación de método al inicio).
La fecha que se indica es la de publicación cuando se conoce.

### Argentina

| Fuente | URL | Fecha | Tipo |
|---|---|---|---|
| Decreto-Ley 15.348/46 (Prenda con registro) | https://www.argentina.gob.ar/normativa/nacional/decreto_ley-15348-1946-44079/texto | 1946 (t.o. 1995) | Norma |
| Ley de Prenda (copia del BCRA) | https://bcra.gov.ar/pdfs/texord/texcomp/DL15348-46.pdf | — | Norma |
| Resolución Conjunta 2-E/2017 (Boletín Oficial) | https://www.boletinoficial.gob.ar/detalleAviso/primera/175465/20171130 | 30/11/2017 | Norma |
| Resolución Conjunta 2-E/2017 (Infoleg) | https://servicios.infoleg.gob.ar/infolegInternet/anexos/290000-294999/293827/norma.htm | 2017 | Norma |
| OCLA: reactivación de la prenda ganadera | https://www.ocla.org.ar/noticias/11268257-agroindustria-reactiva-la-prenda-ganadera | 01/12/2017 | Prensa especializada |
| Ley 9.643 (warrants) | https://www.argentina.gob.ar/normativa/nacional/ley-9643-37048/actualizacion | 1914 / actualizada | Norma |
| Decreto 640/2024 | https://www.boletinoficial.gob.ar/detalleAviso/primera/310750/20240719 | 19/07/2024 | Norma |
| DNU 70/2023 | https://www.boletinoficial.gob.ar/detalleAviso/primera/301122/20231221 | 21/12/2023 | Norma |
| Primer warrant ganadero (gobierno) | https://www.argentina.gob.ar/noticias/por-primera-vez-en-la-historia-argentina-una-empresa-emitio-un-warrant-ganadero | 10/2024 | Oficial |
| Primer warrant ganadero (Infobae) | https://www.infobae.com/revista-chacra/2024/10/28/se-emitio-el-primer-warrant-ganadero-en-argentina/ | 28/10/2024 | Prensa |
| Warrant con "fe de vida" 24x7 (Bichos de Campo) | https://bichosdecampo.com/el-mundo-cambio-un-tambo-santafesino-se-financio-con-un-warrant-de-vacas-lecheras-que-cuentan-con-garantia-de-vida-24x7/ | 2024 | Prensa |
| Récord de warrants 2025 | https://www.argentina.gob.ar/noticias/la-emision-de-warrants-fue-record-en-2025 | 2025 | Oficial |
| Empresas warranteras habilitadas | https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/_warrants/_archivos/000997_Empresas%20Warrants/000011_Habilitadas.php | — | Oficial |
| Disposición 2/2026 | https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-2-2026-426151/texto | 2026 | Norma |
| Disposición 2/2026 (Agroempresario) | https://agroempresario.com/publicacion/118481/el-gobierno-habilito-la-inmovilizacion-de-hacienda-para-reforzar-la-seguridad-financiera-de-los-warrants-ganaderos/ | 2026 | Prensa |
| Disposición 2/2026 (Contadores en Red) | https://contadoresenred.com/warrants-y-certificados-de-depositos-habilitan-la-inmovilizacion-voluntaria-como-garantia/ | 2026 | Prensa profesional |
| Resolución SENASA 841/2025 | https://www.boletinoficial.gob.ar/detalleAviso/primera/333885/20251103 | 03/11/2025 | Norma |
| Resolución 841/2025: puntos clave | https://www.motivar.com.ar/ganaderia/identificacion-animal-puntos-claves-la-resolucion-8412025-n5334982 | 2025 | Prensa especializada |
| TRAZA, Res. 117/2026 (Infobae) | https://www.infobae.com/revista-chacra/2026/07/23/crean-el-sistema-traza-para-mejorar-el-acceso-a-la-informacion-del-ganado-y-fortalecer-la-gestion-productiva/ | 23/07/2026 | Prensa |
| TRAZA (Perfil) | https://www.perfil.com/noticias/economia/el-gobierno-creo-traza-un-nuevo-sistema-para-seguir-al-ganado-y-facilitar-el-acceso-al-credito-a40.phtml | 07/2026 | Prensa |
| TRAZA (Infocampo) | https://www.infocampo.com.ar/para-impulsar-los-warrants-ganaderos-crean-un-nuevo-sistema-informatico-de-trazabilidad-animal/ | 2026 | Prensa |
| SENASA, manuales DT-e | https://www.argentina.gob.ar/senasa/micrositios/dt-e/manuales-tutoriales-y-formularios | — | Oficial |
| SENASA, mesa de ayuda SIGSA | https://www.argentina.gob.ar/senasa/mesa-de-ayuda-sistema-integrado-de-gestion-de-sanidad-animal-sigsa | — | Oficial |
| BCRA, texto ordenado "Garantías" ⚠ | https://www.bcra.gob.ar/archivos/Pdfs/texord/t-garant.pdf | Últ. com. "A" 8447 | Norma |
| BICE, créditos en valor producto | https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/ | 2025 | Lender |
| Créditos en kilos de novillo (gobierno) | https://www.argentina.gob.ar/noticias/el-gobierno-nacional-lanzo-creditos-en-kilos-de-novillo-para-aumentar-el-stock-ganadero | 07/2025 | Oficial |
| BICE, crédito en litros de leche | https://www.bice.com.ar/bice-otorga-el-primer-credito-medido-en-litros-de-leche-a-un-tambo-de-villa-maria/ | 07/2024 | Lender |
| BCR, contratos de compraventa de leche | https://www.bcr.com.ar/es/mercados/investigacion-y-desarrollo/informativo-semanal/noticias-informativo-semanal/los-contratos | — | Institucional |
| BNA y SAGyP, créditos para engorde | https://www.argentina.gob.ar/noticias/agricultura-y-el-banco-nacion-lanzan-creditos-por-10-mil-millones-para-el-engorde-de-ganado | — | Oficial |
| Galicia, préstamo prendario | https://www.galicia.ar/empresas/financiaciones/prestamo-prendario | — | Lender |
| Banco Provincia, Procampo | https://www.bancoprovincia.com.ar/agro/agro_procampo | — | Lender |
| Evaluadora, Aval Ganadero SGR | https://www.evaluadora.com/ar/usr/archivos/822_Aval%20Ganadero%20SGR.pdf | — | Calificadora |
| Moody's Local, FF Invernea Ganadero | https://moodyslocal.com.ar/wp-content/uploads/2025/10/MLAR_IR_FF-Invernea-Ganadero.pdf | 23/10/2025 | Calificadora |
| Prospecto del FF Invernea Ganadero | https://www.cfafiduciaria.com/wp-content/uploads/2020/12/Prospecto-FF-Invernea-17-Dic-FIRMA-ANX.pdf | 12/2020 | Prospecto |
| INTA, índice de destete | https://intainforma.inta.gob.ar/aumentar-5-el-indice-de-destete-para-duplicar-la-exportacion-de-carne-2/ | — | Oficial / técnico |
| INTA, informe de preñez (Motivar) | https://www.motivar.com.ar/2022/08/inta-publico-el-informe-de-prenez-2022 | 08/2022 | Prensa especializada |
| Capitalización de hacienda | https://www.produccion-animal.com.ar/informacion_tecnica/cria/50-capitalizacion_de_hacienda_de_cria.pdf | — | Técnico |
| Conteo de ganado con IA y satélite en Argentina (ISPRS) | https://isprs-archives.copernicus.org/articles/XLVIII-4-2024/459/2024/ | 2024 | Paper |
| Agrotoken y Santander | https://www.santander.com/en/press-room/press-releases/2022/03/santander-and-agrotoken-join-forces-to-offer-loans-secured-by-cryptoassets | 03/2022 | Lender |

### Estados Unidos

| Fuente | URL | Fecha | Tipo |
|---|---|---|---|
| OCC, Comptroller's Handbook – Agricultural Lending | https://www.occ.gov/publications-and-resources/publications/comptrollers-handbook/files/agricultural-lending/pub-ch-agricultural-lending.pdf | — | Regulador |
| OCC, Asset-Based Lending | https://www.occ.treas.gov/publications-and-resources/publications/comptrollers-handbook/files/asset-based-lending/pub-ch-asset-based-lending.pdf | 2014 | Regulador |
| FCA, Examination Manual EM-22.6 | https://ww3.fca.gov/readingrm/exammanual/New%20Exam%20Manual/22.6.pdf | — | Regulador |
| FCA, Collateral Evaluation (IM) | https://ww3.fca.gov/readingrm/infomemo/Lists/InformationMemorandums/Attachments/224/IM-Collateral_Evaluation_29Aug2016.pdf | 29/08/2016 | Regulador |
| FDIC, RMS Manual – Agricultural Lending | https://www.fdic.gov/risk-management-manual-examination-policies/agricultural-lending | — | Regulador |
| 7 CFR 765 (FSA, préstamos directos) | https://www.ecfr.gov/current/title-7/subtitle-B/chapter-VII/subchapter-D/part-765 | — | Norma |
| 7 CFR 762 (FSA, préstamos garantizados) | https://www.ecfr.gov/current/title-7/subtitle-B/chapter-VII/subchapter-D/part-762 | — | Norma |
| Federal Register, Farm Loan Programs | https://www.federalregister.gov/documents/2013/11/01/2013-25836/farm-loan-programs-clarification-and-improvement | 01/11/2013 | Norma |
| FSA, Guaranteed Farm Loans | https://www.fsa.usda.gov/resources/loans/guaranteed-farm-loans | — | Oficial |
| Food Security Act §1324 (AMS) | https://www.ams.usda.gov/sites/default/files/media/Section1324oftheFoodSecurityAct.pdf | 1985 | Norma |
| National Ag Law Center, Farm Products Rule | https://nationalaglawcenter.org/protection-for-buyers-of-farm-products-a-primer-on-the-federal-farm-products-rule/ | — | Académico / legal |
| National Ag Law Center, Financing Statement | https://nationalaglawcenter.org/lending-for-livestock-credit-for-crops-filing-a-financing-statement/ | — | Académico / legal |
| Montana DOL, Brand Liens | https://liv.mt.gov/Brands-Enforcement/Brands-Liens | — | Oficial |
| Colorado C.R.S. 35-55-112 | https://law.justia.com/codes/colorado/title-35/livestock/article-55/section-35-55-112/ | 2024 | Norma |
| Farmers National Company, collateral inspection | https://www.farmersnational.com/farm-and-ranch/services/collateral-inspection | — | Claim de empresa |
| CattleQuants | https://cattlequants.com/why-use-drones-for-livestock-collateral-verification/ | 20/09/2023 | Claim de empresa |
| Crop Quest | https://www.cropquest.com/automated-cattle-counting-drone-feedlot-inventory-services/ | — | Claim de empresa |
| National Livestock, finance | https://nationallivestock.com/finance/ | — | Lender |
| DOJ, Easterday | https://justice.gov/opa/pr/washington-man-pleads-guilty-244-million-ghost-cattle-scam | 2021 | Oficial |
| AgWeb, Ponzi de US$650 millones | https://www.agweb.com/news/business/ghost-cattle-650m-ponzi-rocks-livestock-industry-money-still-missing | — | Prensa especializada |
| KCTV5, VP de banco de Missouri | https://www.kctv5.com/2026/09/10/former-bank-vp-pastor-pleads-guilty-multi-million-dollar-cattle-investment-fraud-scheme/ | 10/09/2026 | Prensa |
| FDIC OIG, Ponzi de ganado | https://live-fdic.oversight.gov/news/investigations-press-releases/two-individuals-convicted-conspiracy-and-fraud-cattle-ponzi | — | Oficial |
| ACAMS, "All hat, no cattle" | https://www.acams.org/sites/default/files/2020-08/ALL%20HAT,%20NO%20CATTLE-%20What%20the%20AML%20Professional%20Needs%20to%20Know%20About%20Cattle%20Fraud.pdf | 08/2020 | Profesional (AML) |
| FLAG, Milk check assignment | http://www.flaginc.org/wp-content/uploads/2013/03/DairyAssignment2005.pdf | 2005 | ONG legal |

### Australia y Nueva Zelanda

| Fuente | URL | Fecha | Tipo |
|---|---|---|---|
| ISC, NLIS | https://www.integritysystems.com.au/identification--traceability/national-livestock-identification-system/ | — | Oficial / operador |
| ISC, acceso de terceros | https://www.integritysystems.com.au/about/news--events/news/2023/enabling-third-party-access-to-your-integrity-systems/ | 2023 | Oficial / operador |
| NLIS, términos de uso | https://www.nlis.com.au/NLISDocuments/NLIS%20Terms%20of%20Use%20(Ed1.26).pdf | — | Operador |
| PPSR, caso agro | https://www.ppsr.gov.au/education-hub/ppsr-case-studies/agriculture-flos-cattle-feed | — | Oficial |
| FIIG, research de StockCo | https://www.fiig.com.au/docs/default-source/issues/stockco-research.pdf | — | Análisis de terceros |
| StockCo, FAQ | https://stockco.com.au/resources/faqs/ | — | Lender |
| StockCo NZ | https://stockco.co.nz/ | — | Lender |
| Beef Central, breeder finance | https://www.beefcentral.com/markets/new-stock-finance-product-will-focus-on-breeder-cattle/ | — | Prensa especializada |
| Legacy Livestock, FAQ | https://www.legacylivestock.com.au/faqs/ | — | Lender |
| Legacy Livestock, finance | https://www.legacylivestock.com.au/livestock-finance/ | — | Lender |
| NewFarm AgriFinance, proceso | https://newfarmagrifinance.com.au/process/ | — | Lender |
| Ottley Capital | https://www.ottleycapital.com/ | — | Lender |
| Ceres Tag (CSIRO) | https://research.csiro.au/livestock/our-focus/health-and-resilience/ceres-tag-smart-ear-tags-for-livestock/ | — | Organismo científico / claim |

### Otros mercados y papers

| Fuente | URL | Fecha | Tipo |
|---|---|---|---|
| Alberta, manual de feeder associations | https://www.alberta.ca/system/files/custom_downloaded_images/af-feeder-associations-in-alberta-manual-directives-procedures.pdf | — | Oficial |
| Feeder Associations of Alberta | https://www.feederassoc.com/about-faa/ | — | Institucional |
| CBC, Picture Butte | https://www.cbc.ca/news/canada/calgary/picture-butte-feeder-cooperative-falg-rj-sigurdson-alberta-1.7479866 | 2025 | Prensa |
| Canadian Cattlemen, Picture Butte | https://www.canadiancattlemen.ca/news/unpacking-the-picture-butte-feeder-cooperative-loan-suspension/ | 2025 | Prensa especializada |
| Advance Payments Program | https://agricommodity.ca/app/ | — | Administrador del programa |
| Uruguay, Ley 17.228 | https://www.impo.com.uy/bases/leyes-originales/17228-2000 | 07/01/2000 | Norma |
| Uruguay, trazabilidad (INAC) | https://www.inac.uy/innovaportal/file/5046/1/libro_trazabilidad_espanol_con_tapa_definitivo.pdf | — | Oficial |
| Uruguay, SNIG 20 años | https://enperspectiva.uy/en-perspectiva-programa/trazabilidad-obligatoria-del-ganado-uruguayo-cumplio-20-anos-es-una-politica-de-estado-exitosa-que-garantiza-el-control-sanitario-e-impulsa-la-exportacion-de-carne-dice-gabriel-oso/ | 2026 | Prensa (entrevista oficial) |
| B3, CPR | https://www.b3.com.br/data/files/CD/D2/A9/32/3ECA2810F9BC5928AC094EA8/cpr_lamina.pdf | — | Bolsa / registradora |
| CNN Brasil, vacas tokenizadas | https://www.cnnbrasil.com.br/agro/vacas-tokenizadas-movimentam-r-100-mil-na-primeira-operacao-na-b3/ | 2026 | Prensa |
| UK, Agricultural Credits Act 1928 | https://www.legislation.gov.uk/ukpga/Geo5/18-19/43/section/5 | 1928 | Norma |
| Ashfords, Agricultural charges | https://www.ashfords.co.uk/insights/articles/agricultural-charges-and-receiverships | — | Estudio jurídico |
| Detección de ganado con satélite, aéreo y UAV (Int. J. Remote Sensing) | https://www.tandfonline.com/doi/full/10.1080/01431161.2022.2051634 | 2022 | Paper |
| Densidad de ganado en la Amazonia con imágenes VHR | https://www.nature.com/articles/s44458-026-00082-2 | 2026 | Paper |
