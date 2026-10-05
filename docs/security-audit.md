# Auditoría de seguridad: frontend y API

Fecha: 5 de octubre de 2026 · Branch `feature/bovinos`.

**Alcance.** La auditoría cubre:

- todos los endpoints que usa la web;
- los links públicos (productor e inspector);
- la configuración de Next.js y del build;
- la gestión de sesión, las cargas de archivos y las dependencias.

**Método.**

1. Revisión de código.
2. Pruebas empíricas contra el stack local en modo producción. Se repitieron las 45 operaciones (lecturas y escrituras) sobre recursos del Banco del Campo con cuatro sesiones:
   - una sesión de otra organización (Pampa Seguros);
   - un productor;
   - una sesión anónima;
   - un productor sobre una solicitud ajena.

Regla aplicada: se corrigió lo que era claro y seguro de corregir. Lo que requiere una decisión de arquitectura o credenciales externas queda como pendiente.

## Resultado

### Corregido en esta revisión

| # | Hallazgo | Severidad | Corrección |
|---|---|---|---|
| 1 | **Open redirect en el login.** El filtro de `?next=` aceptaba `/\evil.com`, y los navegadores interpretan `\` como `/`. Después de iniciar sesión, el usuario podía terminar en un dominio externo. | Media | `safeInternalPath()` (`apps/web/src/lib/security/safe-redirect.ts`) rechaza `//`, `\`, esquemas y caracteres de control, y valida el origen con `URL`. Tiene tests. |
| 2 | **Tokens de los links en los logs.** Las rutas `/producer/requests/:token` e `/inspections/:token` llevan la credencial en la URL, y el logger de la API las escribía completas. Cualquier persona con acceso a los logs podía usar el link del productor o del inspector. | Media | `redactUrl()` en el serializer de pino reemplaza el token por `[REDACTED]`. También oculta `token=`, `code=`, `password=` y `secret=` en la query. Tiene tests. |
| 3 | **Carga ilimitada por el link del inspector.** Mientras el acta no está firmada, el link público permitía subir fotos sin tope (hasta 20 MB cada una) al almacenamiento de la entidad. | Baja | Tope de 40 fotos por inspección (`INSPECTOR_MAX_PHOTOS`). Se suma al rate limit global y a la validación por *magic bytes*. |

### Verificado sin hallazgos

**Autenticación**
- Todos los endpoints exigen sesión salvo `auth/login|refresh|logout`, `health` y los dos controladores de links. Esos links usan un token aleatorio de 256 bits, guardan solo su hash, vencen, y el del inspector muere al firmar el acta.
- Una sesión anónima recibe 401 en las 45 pruebas.
- Un token inválido devuelve 404.

**Aislamiento entre organizaciones (IDOR/BOLA)**
- Otra organización recibe 404 en todos los recursos con ID: garantía, passport, PDF, solicitud, activo, documento (ver, descargar, revisar, analizar), evidencia, alerta, verificación, informe y establecimiento. También en todas las escrituras.
- Algunos sub-listados (`/bovine-guarantees/:id/timeline|alerts|movements|inspections|verifications`, `/assets/:id/satellite|scans|animals|rfid/observations`) devuelven `200 []` a otra organización. **No exponen datos**: la consulta filtra por organización y la respuesta es igual exista o no el recurso. Ver el punto 4 de pendientes.

**Productor**
- Recibe 403 o 404 en todos los endpoints de la entidad.
- No puede operar solicitudes ajenas: movimientos, correcciones y envío devuelven 403 ("La solicitud no es tuya"). El monitoreo y la declaración ajenos no devuelven datos.
- No accede a `demo`, `users`, `audit-logs`, la configuración de scoring ni las políticas (403).

**RBAC**
- Cada endpoint de garantías declara su permiso (`MONITORING_READ/MANAGE`, `VERIFICATIONS_RUN`, `DOCUMENTS_WRITE`, `EVIDENCE_WRITE`).
- `recalculate` exige `MONITORING_MANAGE`, queda serializado por un advisory lock por garantía y tiene rate limit.

**Sesión y tokens**
- Las cookies `ag_at` y `ag_rt` son `HttpOnly`. `ag_rt` está restringida a `/api/auth` con `SameSite=Strict`. No se guardan tokens en `localStorage`.
- En producción, la API no arranca sin `COOKIE_SECURE=true` ni con secretos de desarrollo.

**CSRF y CORS**
- Una escritura sin `x-csrf-token` devuelve 403 (double submit).
- No se emite `Access-Control-Allow-Origin` para orígenes externos.

**XSS y cabeceras**
- No se usa `dangerouslySetInnerHTML`.
- La CSP lleva un nonce por request con `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'` y `base-uri 'self'`.
- También se envían `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin` (los links con token no filtran la ruta a terceros) y `Permissions-Policy`.

**Archivos**
- El tipo real del archivo se valida por *magic bytes* (PDF, JPG, PNG, WebP), con límite de tamaño por endpoint.
- Las descargas usan URLs firmadas con TTL (`SIGNED_URL_TTL_SECONDS`), emitidas después de verificar la organización.
- El PDF del passport exige sesión y el permiso `REPORTS_READ`.

**Secretos y build**
- Se buscaron en el bundle del cliente (`.next/static`) los valores de `JWT_ACCESS_SECRET`, `S3_SECRET_KEY`, `AI_SERVICE_TOKEN`, `SEED_DEMO_PASSWORD` y `POSTGRES_PASSWORD`: 0 apariciones.
- No hay variables `NEXT_PUBLIC_*`, ni source maps públicos (`productionBrowserSourceMaps: false`), ni URLs internas en el bundle.
- Las credenciales demo del login solo se muestran con `SHOW_DEMO_CREDENTIALS=true`.
- Swagger solo existe fuera de producción.

**Dependencias**
- `pnpm audit --prod` en web y API: sin vulnerabilidades conocidas.

### Pendientes (requieren decisión o configuración del despliegue)

1. **`DEMO_MODE` vale `enabled` por defecto, también en producción.** Los datos DEMO están marcados y no cuentan en los KPIs, pero el endpoint `POST /demo/guarantee-requests` crea datos ficticios y una cuenta de productor con contraseña.
   - Recomendación: `DEMO_MODE=disabled` en cualquier entorno con clientes reales, o hacer que la API se niegue a arrancar así en `NODE_ENV=production`.
   - No se cambió el default porque el despliegue local con `docker compose` lo usa para la demo.
2. **Token en la ruta de los links.** Es el diseño acordado (un link que se comparte por WhatsApp). La exposición en logs ya está mitigada. Para reducirla más:
   - intercambiar el token por una cookie de corta duración en la primera visita, o
   - revocar el link al usarse por primera vez.

   Las dos opciones cambian el flujo, así que hace falta una decisión.
3. **Rate limit por link.** Hoy el límite es global por IP (`RATE_LIMIT_PER_MINUTE`). Para los endpoints públicos conviene sumar un límite por token. Requiere configurar el throttler con un tracker por ruta.
4. **Respuestas `200 []` en sub-listados de recursos ajenos.** No filtran datos ni permiten adivinar IDs, pero por consistencia convendría responder 404 cuando el recurso padre no pertenece a la organización. Cambia el contrato de varios endpoints, así que no se tocó en esta revisión de UI.
5. **Antivirus de cargas.** Solo se aceptan PDF e imágenes validadas por firma, pero no hay escaneo antimalware. Requiere un servicio externo (por ejemplo, ClamAV).
