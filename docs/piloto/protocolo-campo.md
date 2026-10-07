# Protocolo de prueba con hacienda real

**Objetivo:** medir con datos propios cuánto se equivoca el conteo de la app frente a un conteo manual de referencia, por modo de escaneo, antes de mostrar cifras a un banco. Hasta tener este resultado, no se promete ninguna precisión.

## 1. Qué se mide

| Modo | Qué cuenta | Referencia manual |
|---|---|---|
| Escáner fijo (manga o tranquera) | Animales que cruzan la línea | Dos personas cuentan el paso por la manga por separado; si no coinciden, se repite |
| Escáner de corral | Animales visibles (cota inferior) | Conteo en manga del mismo corral, inmediatamente antes o después |
| Barrido | Animales visibles en el potrero (cota inferior) | Conteo en manga o con la planilla de existencias del día |
| Manga + RFID | Caravanas asociadas a un único animal | Lectura con bastón y planilla de caravanas |

Indicadores del informe (`pilot:accuracy`):
- **Error medio:** en cabezas y en %.
- **Sesgo:** negativo si la app cuenta de menos, positivo si cuenta de más.
- **Dentro de tolerancia:** % de pruebas con error de ±2 % y de ±5 %.
- **Peor caso.**

## 2. Muestra mínima

- **Al menos 20 pruebas por modo**, repartidas en 3 o más establecimientos o corrales distintos.
- **Variar las condiciones** que más afectan a la visión: luz (mañana, mediodía, nublado), densidad (corral lleno o con espacio), razas y pelajes (negro, colorado, overo), y distancia de la cámara.
- **Cuidar el feedlot:** en corrales grandes los animales se tapan entre sí. Ahí el escáner de corral es una cota inferior, y el número a reportar es cuánto se queda corto, no si "acierta".

## 3. Cómo hacer cada prueba

1. Anotar en la planilla la fecha, el establecimiento, el corral, la raza, la luz y el modo.
2. **Hacer el conteo manual primero** y anotarlo en `conteo_manual`. Quien escanea no debe conocer ese número.
3. Escanear con la app, sin repetir ni "corregir" el escaneo.
4. Al sincronizar, copiar el id de la sesión de escaneo en `scan_id`; la herramienta toma el conteo oficial del servidor. Si se usó otra forma de conteo, anotar el número en `conteo_app`.
5. Anotar en `observaciones` cualquier cosa rara: polvo, animales que volvieron, el celular se movió.

La planilla modelo es `docs/piloto/planilla-campo.csv`. Se puede llenar en Excel o Google Sheets y exportar a CSV.

## 4. Informe

```bash
cd apps/api && pnpm build && pnpm pilot:accuracy ../../docs/piloto/planilla-campo.csv > informe-precision.md
```

## 5. Cómo leer el resultado (criterio propuesto, a acordar con el banco)

| Resultado | Lectura |
|---|---|
| Escáner fijo con ≥ 90 % de pruebas dentro de ±2 % | Apto para conteo completo de rodeo |
| Escáner de corral con sesgo estable (por ejemplo, −3 % a −8 %) | Apto como cota inferior y para detectar caídas grandes; no reemplaza al conteo completo |
| Error disperso o peor caso > 15 % | Revisar condiciones de captura antes de seguir |

## 6. Además de la precisión

En la misma salida a campo, anotar:
- **Señal:** si hubo cobertura y cuánto tardó en sincronizar al volver la señal.
- **Batería:** consumo de batería del celular por escaneo.
- **Tiempo:** minutos por corral, comparados con el conteo manual.
- **Dificultades:** qué no entendió el productor o el peón al usar la app.
- **Equipos:** modelo del celular y del lector RFID (marca y modelo, bastón o panel).

**Lector RFID:** si se prueba manga + RFID, hay que conectar un lector real. Hoy la app usa un lector simulado, marcado SIMULADO. La integración con el lector físico depende del modelo: averiguar antes qué lector usa el productor.
