# Documentación para créditos a productores ganaderos (Argentina)

Investigación de fuentes públicas sobre qué documentación o datos **pueden** pedirse a un
productor ganadero para acceder a financiación. Sirve para modelar el checklist documental
(`apps/api/src/modules/documents/domain/document-requirements.ts`).

**No es una lista universal.** Cada banco y cada línea define sus propios requisitos, y la
entidad puede pedir más documentación al calificar al cliente. Nada de esta tabla se convierte
solo en un requisito obligatorio del sistema: el banco elige el producto de crédito y el
checklist marca cada ítem como obligatorio, condicional o según evaluación.

## Cómo se hizo

- **Fecha de consulta:** 02/10/2026.
- **Método:** búsqueda web sobre fuentes públicas.
  - Desde el entorno de desarrollo no se pudieron abrir directamente las páginas de
    `argentina.gob.ar` ni de `bna.com.ar` (bloqueo de red del entorno).
  - Lo que se cita de esas páginas proviene del texto que indexa el buscador. Hay que
    **re-verificarlo en la página oficial** antes de usarlo frente a un cliente o un banco.
- **Prioridad de fuentes:** primero las oficiales (BCRA, SENASA, organismos nacionales,
  BICE). Las notas de prensa se usan solo para ubicar la línea, y se aclara cuando son la
  única fuente.
- **Bancos privados:** no se encontró una lista pública y detallada de documentación de Banco
  Galicia para crédito ganadero. Galicia figura con lo que publica sobre sus productos; sus
  requisitos documentales concretos quedan **sin confirmar**.

## Categorías

- **A. Generales del productor:** identidad, situación fiscal.
- **B. Específicos de la actividad ganadera:** sanitarios, registro del establecimiento.
- **C. Del crédito o línea:** dependen del programa.
- **D. De la garantía o la hacienda.**
- **E. Adicionales para calificar al cliente:** a criterio del banco.

## Tabla

Obligatoriedad: **Obligatorio** = la fuente lo exige para esa línea. **Condicional** = solo
en ciertos casos (tipo de persona, tipo de producción, garantía). **Según evaluación** =
depende de la política de crédito de la entidad.

| Cat. | Documento / dato | Uso | Fuente | Contexto | Obligatoriedad |
|---|---|---|---|---|---|
| A | CUIT / CUIL y clave fiscal | Identificar al productor ante el sistema financiero y fiscal | [argentina.gob.ar – Acceder a un crédito (Plan GanAr)](https://www.argentina.gob.ar/servicio/acceder-un-credito-productores-ganaderos-tamberos-y-cooperativas-agropecuarias) | Plan GanAr (BNA y bancos provinciales adheridos): "contar con clave fiscal" | Obligatorio (en esa línea) |
| A | Constancia de inscripción en ARCA (situación fiscal) | Verificar condición fiscal y actividad declarada | [argentina.gob.ar – Certificado MiPyME](https://www.argentina.gob.ar/produccion/registrar-una-pyme/certificado-pyme) | Se obtiene con CUIT y clave fiscal; los bancos la usan para la apertura y el legajo | Según evaluación |
| A | Certificado MiPyME vigente | Acceder a líneas con cupo o bonificación MiPyME | [argentina.gob.ar – Certificado MiPyME](https://www.argentina.gob.ar/produccion/registrar-una-pyme/certificado-pyme) · [BICE – valor producto ganadero](https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/) | Líneas MiPyME de BNA y BICE (créditos en kilos de novillo: "ser una MiPyME registrada") | Condicional (líneas MiPyME) |
| A | DNI del titular / estatuto y autoridades (persona jurídica) | Conocer al cliente y comprobar facultades para obligarse | [BCRA – Gestión crediticia, texto ordenado](https://www.bcra.gob.ar/archivos/Pdfs/texord/t-gescre.pdf) | El banco debe llevar un **legajo de cada deudor**; el contenido exacto lo define su política | Según evaluación |
| B | Inscripción en el RENSPA (SENASA) | Asociar al productor con el establecimiento y la producción; requisito sanitario para comercializar | [SENASA – Inscribir/actualizar RENSPA](https://www.argentina.gob.ar/inscribir-reinscribir-en-el-registro-nacional-sanitario-de-productores-agropecuarios-renspa) · [BICE](https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/) · [argentina.gob.ar – Plan GanAr](https://www.argentina.gob.ar/servicio/acceder-un-credito-productores-ganaderos-tamberos-y-cooperativas-agropecuarias) | Obligatorio en SENASA para productores pecuarios. Exigido expresamente por la línea BICE valor novillo y por líneas BNA para ganadería | Obligatorio (en esas líneas) |
| B | Certificado de vacunación (aftosa y brucelosis) | Acreditar cumplimiento sanitario del rodeo | Búsqueda sobre líneas BNA para MiPyMEs ganaderas (página de BNA no accesible desde el entorno) · [SENASA – normativa sanitaria](https://www.argentina.gob.ar/normativa/nacional/norma-423874) | Líneas BNA para producción de carne: "RENSPA y certificado de vacunación de brucelosis y aftosa" (a re-verificar en bna.com.ar) | Condicional (según línea) |
| B | Inscripción en el Registro Especial de Bovinos de Engorde a Corral (Res. SENASA 329/17) | Acreditar que el establecimiento es un feedlot registrado | [Res. SENASA E 329/2017](https://www.argentina.gob.ar/normativa/nacional/norma-274944/texto) · [MAGyP – líneas vigentes](https://magyp.gob.ar/acercaralimentos/_pdf/211022_lineas_de_creditos_vigentes.pdf) | Línea BNA + FONDAGRO para compra de maíz para feedlot | Condicional (engorde a corral) |
| B | Existencias (stock) certificadas por SENASA | Dimensionar el crédito por cabeza y respaldar el stock declarado | [MAGyP – líneas vigentes](https://magyp.gob.ar/acercaralimentos/_pdf/211022_lineas_de_creditos_vigentes.pdf) · [FONDAGRO – maíz para feedlot](https://www.argentina.gob.ar/agricultura/fondagro/credito-para-compra-de-maiz-para-feedlot-con-bonificacion-de-tasa-de-fondagro) | Línea feedlot: monto por cabeza según el informe de stock de SENASA, con antigüedad máxima de 30 días | Condicional (según línea) |
| B | Antigüedad en la actividad (5 años) comprobable | Acreditar trayectoria productiva | [BICE – valor producto ganadero](https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/) | Créditos en kilos de novillo: actividad verificable por registros oficiales (SENASA, ARCA) o documentación contable | Condicional (esa línea) |
| B | Boleto / título de marca y señal | Acreditar la propiedad del ganado marcado | [Chaco – requisitos de marca y señal](https://ele.chaco.gob.ar/mod/book/view.php?id=229594) · [Entre Ríos – renovación de marcas](https://ganaderiaynegocios.com/novedades-para-la-renovacion-de-marcas-y-senales-en-entre-rios/) | Registro **provincial**, con vigencia según la provincia | Según evaluación (no se encontró una línea que lo exija explícitamente) |
| C | Proyecto de inversión / destino de fondos | Encuadrar la operación en la línea (vientres, retención, capital de trabajo) | [BICE – valor producto ganadero](https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/) | Valor novillo: compra de vaquillonas hasta 30 % del stock declarado, retención de terneras hasta 20 % | Condicional (según línea) |
| C | Declaración del stock bovino | Base para calcular topes del crédito | [BICE – valor producto ganadero](https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/) | Los topes se expresan como porcentaje del "stock declarado" | Condicional (según línea) |
| D | Garantía de SGR o fondo de garantía | Cubrir el riesgo cuando el deudor es persona humana | [BICE – valor producto ganadero](https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/) | Valor novillo: obligatorio para personas humanas | Condicional (persona humana) |
| D | Prenda con registro sobre hacienda | Constituir la hacienda como garantía | [Decreto-Ley 15.348/46 – Prenda con registro](https://www.argentina.gob.ar/normativa/nacional/norma-44079/texto) | La prenda se inscribe en el registro del lugar donde están los bienes; solo a favor de bancos y entidades autorizadas | Condicional (si la garantía es prendaria) |
| D | Título de propiedad o contrato de arrendamiento del campo | Ubicar la hacienda y acreditar la tenencia del establecimiento | Práctica bancaria; no se encontró una fuente pública que lo exija para una línea ganadera concreta | Pedido habitual en el legajo; sin fuente específica | Según evaluación |
| D | Póliza de seguro sobre la hacienda | Cubrir el bien en garantía | Sin fuente pública específica para ganadería | Puede pedirlo el banco | Según evaluación |
| E | Estados contables / manifestación de bienes / flujo de fondos | Evaluar la capacidad de repago | [BCRA – Gestión crediticia](https://www.bcra.gob.ar/archivos/Pdfs/texord/t-gescre.pdf) | Con garantías preferidas "A" no es obligatorio incorporar el flujo de fondos ni los estados contables al legajo | Según evaluación |
| E | Situación en la Central de Deudores (BCRA) | Ver el historial crediticio del sistema | [BCRA – Clasificación de deudores](https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-cladeu.pdf) | Consulta pública por CUIT, con situación 1 a 5. La hace el banco; el productor no la "presenta" | Según evaluación |

## Lo que NO se pudo confirmar

- **Banco Galicia:** publica productos para ganadería (compra de hacienda, financiación con
  garantía de hacienda, plataforma Galicia Rural), pero no una lista de documentación. Sus
  requisitos documentales concretos no están confirmados.
  - Referencias: [galicia.ar – Financiaciones](https://www.galicia.ar/empresas/financiaciones)
    · [Expoagro – Galicia y ganadería](https://www.expoagro.com.ar/banco-galicia-ofrece-herramientas-financieras-100-digitales-para-la-ganaderia/).
- **Banco Nación:** los requisitos de las líneas ganaderas se citan desde el texto indexado.
  La página [bna.com.ar – Agronegocios](https://www.bna.com.ar/Empresas/AgroNegocios/Creditos)
  no se pudo abrir desde el entorno.
- **Banco Provincia y otros bancos provinciales:** no se encontró documentación publicada
  confiable. No se incluyeron.

## Cómo se usa en el sistema

- Cada ítem es un **requisito documental** con su fuente, su categoría y su obligatoriedad
  (`OBLIGATORIO`, `CONDICIONAL`, `SEGUN_EVALUACION`).
- Un **producto de crédito** (por ejemplo "Línea ganadera MiPyME – referencia") agrupa
  requisitos. El banco lo elige al crear la solicitud.
- El checklist muestra para cada requisito su estado:
  - pendiente, cargado o procesando;
  - consistente o inconsistente;
  - requiere revisión;
  - no aplica.
- **Validación automática** (OCR + reglas): RENSPA, CUIT/constancia ARCA y certificado
  sanitario. El resto se revisa a mano.
- Ningún producto incluido afirma ser la lista oficial de un banco. Los productos de
  referencia citan su fuente y su fecha de consulta.

## Datos declarados, extraídos y verificados

| Capa | Qué es | Estado |
|---|---|---|
| Declarados | Lo que carga el productor | Disponible |
| Extraídos | Lo que lee el OCR del documento, con su valor original y normalizado | Disponible |
| Verificados internamente | La comparación entre declarados y extraídos | Disponible |
| Verificados por fuente oficial | Consulta a SENASA u otro registro oficial | **No disponible**: `OfficialDataProvider` = `NOT_CONNECTED` |

Para conectar SENASA hace falta:
- un convenio institucional;
- las credenciales;
- la especificación del servicio.

No existe una API pública abierta para estas consultas, y el sistema **no** hace scraping ni
inventa respuestas. El detalle está en [`docs/integrations/senasa.md`](integrations/senasa.md).

## Qué es demo

- Los escenarios de "Simular solicitud" usan **datos ficticios**: Juan Pérez, establecimiento
  "La Esperanza" en Entre Ríos.
- El CUIT y el RENSPA de la demo **no corresponden a personas reales**. El CUIT usa un
  número con dígito verificador válido, elegido para la demo.
- Los documentos de la demo son PDF generados por el sistema con la leyenda "DOCUMENTO DE
  DEMOSTRACIÓN – SIN VALOR". No imitan el formato oficial de SENASA, ARCA ni ningún otro
  organismo.
