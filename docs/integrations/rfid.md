# RFID — arquitectura de lecturas de caravanas electrónicas

## Flujo

```
Lector RFID (bastón / panel de manga, ISO 11784/11785 FDX-B/HDX)
   │  Bluetooth SPP / BLE / serie (lo resuelve la app puente, no el navegador)
   ▼
App puente móvil / Android (o gateway en campo)
   │  HTTPS, POST /api/assets/{assetId}/rfid/observations  (permiso devices:write)
   ▼
API → rfid_observations (append-only, trama original en raw_payload)
   │  EID normalizado (15 dígitos) ↔ animal_identifications (method = RFID)
   ▼
Animal → establecimiento / activo → fuentes cruzadas de la verificación
```

**No usamos Web Bluetooth.** Su compatibilidad entre navegadores y lectores es pobre. La conexión con el lector la mantiene una app puente nativa, que envía lecturas por lotes de hasta 500.

## Modelo (sin duplicar entidades existentes)

| Concepto | Implementación |
|---|---|
| RFIDReader | `devices` con `type = 'RFID_READER'` (ya existía) |
| AnimalElectronicIdentity | `animal_identifications` con `method = 'RFID'` (ya existía) |
| RFIDObservation | **nueva** tabla `rfid_observations` |

Cada lectura en `rfid_observations` guarda:

- `electronic_id`, `reader_device_id`, `establishment_id`, `asset_id`, `animal_id`;
- `observed_at` (hora del lector) y `received_at`;
- `location` (solo si el puente la envía);
- `source`, que vale `READER_BRIDGE` o `SIMULATED`;
- `raw_payload`, `confidence` y `status`.

`status` toma uno de estos valores:

- `IDENTIFIED`: EID conocido, de este establecimiento;
- `UNKNOWN_TAG`: EID no registrado;
- `OTHER_ESTABLISHMENT`: EID de un animal de otro establecimiento.

Las fotos se asocian a animales por `animal_identifications.evidence_id` y `animal_observations.evidence_id`. Esa es la base para vincular RFID, animal, establecimiento y foto.

## Simulación para la demo

`POST /api/assets/{assetId}/rfid/simulate` genera lecturas de caravanas registradas del activo y agrega una desconocida. Quedan con `source = 'SIMULATED'` y la UI las marca **SIMULADO**. La tabla **Últimas lecturas RFID** está en la pestaña *Identificación individual* del activo, con las columnas RFID, Fecha/hora, Establecimiento y Estado.

## Uso en la verificación

En el detalle de la solicitud, **Fuentes cruzadas** muestra cuántas caravanas únicas se identificaron en los últimos 30 días. Es información para la entidad y **no modifica el score**: el conteo por visión no depende de RFID.
