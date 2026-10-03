# Integración con SENASA (RENSPA)

## Estado actual

| Adapter | `REGISTRY_PROVIDER` | Qué hace |
|---|---|---|
| `MockLivestockRegistryProvider` (`mock-senasa`) | `mock` (default) | Fichas **SIMULADAS** para los establecimientos demo. Cada consulta queda en `external_data_snapshots` con `is_simulated = true` y la UI la marca SIMULADO. |
| `OfficialSenasaRegistryProvider` (`senasa-official`) | `senasa` | Placeholder. **No consulta nada.** Sin credenciales responde `ERROR: credenciales no configuradas`. Con credenciales responde `ERROR: falta la especificación del servicio`. |

Además existe `OfficialDataProvider` (`apps/api/src/modules/external-data/domain/official-data.provider.ts`),
el puerto que alimenta la capa **Verificado por fuente oficial** del detalle de la solicitud. Su
único adapter, `SenasaOfficialDataProvider`, responde `NOT_CONNECTED` con el motivo. Por eso esa
capa queda vacía y la UI muestra "NO CONECTADA". Nada se presenta como verificado por SENASA.

El registro mock solo conoce los RENSPA de los establecimientos semilla. Ante cualquier otro
RENSPA (por ejemplo, los de las solicitudes de demostración) responde `ERROR: Sin conexión con
SENASA` en lugar de `NOT_FOUND`, para no afirmar que un RENSPA no existe.

Ambos implementan el puerto `LivestockRegistryProvider.lookupByRenspa(renspa)`
(`apps/api/src/modules/external-data/domain/livestock-registry.provider.ts`), que devuelve:

- **existencia**: `OK` o `NOT_FOUND`;
- **estado/vigencia**: `ACTIVO` o `INACTIVO`;
- **titular**: razón social y CUIT;
- **establecimiento**: nombre;
- **existencias** por categoría y la última campaña sanitaria.

La consulta se ejecuta en cada verificación de hacienda (`CrossChecksService`). El resultado se compara con lo declarado en el establecimiento y se muestra en **Fuentes cruzadas**.

## Qué no hacemos

- **No hacemos scraping** de los sitios públicos de SENASA ni de AFIP. Es frágil, puede violar los términos de uso y no da garantías de vigencia.
- **No damos por hecha una API REST pública.** SENASA no publica un servicio abierto para consultar existencias o titularidad por RENSPA.
- **No presentamos datos simulados como oficiales.** Toda ficha mock se marca como simulada.

## Qué requiere una integración oficial

1. **Convenio institucional.** La entidad financiera o AgroGarantías, con el consentimiento del productor, debe solicitar a SENASA acceso a los datos de RENSPA y existencias, por ejemplo mediante un convenio de intercambio de información o un web service con usuario institucional.
2. **Especificación técnica del servicio otorgado**: endpoint, autenticación (certificado, client credentials, etc.), formato, límites de uso y ambiente de homologación.
3. **Consentimiento del titular**, ya que se trata de datos productivos de un tercero. Debe quedar registrado junto a la solicitud de garantía.
4. **Credenciales por variables de entorno**, nunca en el código:
   `SENASA_API_URL`, `SENASA_CLIENT_ID`, `SENASA_CLIENT_SECRET` (ver `.env.example`).
5. **Implementar `lookupByRenspa`** en `OfficialSenasaRegistryProvider`. Hay que mapear la respuesta oficial al tipo `LivestockRegistryRecord` y agregar tests contra el ambiente de homologación.

Hasta completar esos pasos, el sistema funciona con el registro simulado y lo declara como tal.
