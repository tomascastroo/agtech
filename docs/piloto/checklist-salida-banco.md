# Qué hace falta para salir a mostrarle AgroGarantías a un banco

Estado al 7 de octubre de 2026. ✅ hecho · 🟡 parcial · ⬜ falta.

## 1. Producto y tecnología

| Ítem | Estado | Notas |
|---|---|---|
| Flujo completo banco → productor → inspector → passport | ✅ | Probado de punta a punta (E2E) |
| Instalación real sin datos demo | ✅ | Catálogo base + herramienta para dar de alta la entidad y sus usuarios |
| Despliegue en un servidor con HTTPS y backups | ✅ | `docs/deploy-produccion.md`. Falta contratar el servidor y los dominios |
| Auditoría de seguridad propia | ✅ | `docs/security-audit.md`, con 5 pendientes documentados |
| Herramienta para medir la precisión del conteo | ✅ | `pnpm pilot:accuracy`, más el protocolo de campo |
| **Prueba con hacienda real** | ⬜ | `docs/piloto/protocolo-campo.md`: mínimo 20 pruebas por modo |
| **Lector RFID físico** | ⬜ | Hoy el lector es simulado. Definir el modelo del lector e integrarlo |
| Conexión con SENASA (RENSPA, SIGSA, DT-e) | ⬜ | Requiere convenio y credenciales. Hoy se trabaja con documentos cargados |
| Envío de emails (invitaciones, alertas) | ⬜ | Hoy los links se comparten por WhatsApp o mail manual |
| Alta disponibilidad (base gestionada, más de un servidor) | ⬜ | No hace falta para el piloto; sí para producción plena |
| Pruebas de penetración externas | ⬜ | Muchos bancos lo piden antes de producción |

## 2. Empresa y legal

| Ítem | Estado | Notas |
|---|---|---|
| Sociedad constituida (SAS) y CUIT | ⬜ | Sin sociedad, el banco no puede contratar ni firmar un convenio |
| Convenio de confidencialidad (NDA) | ⬜ | Firmarlo antes de recibir datos del banco |
| Acuerdo de piloto (alcance, plazos, datos y responsabilidades) | ⬜ | Borrador de contenidos en `propuesta-piloto.md`. Lo tiene que revisar un abogado |
| Términos de uso y política de privacidad (Ley 25.326 de datos personales) | ⬜ | Se tratan datos personales de productores e inspectores, y fotos con ubicación |
| Registro de bases de datos ante la AAIP | ⬜ | Consultar con un abogado si corresponde |
| Seguro de responsabilidad profesional | ⬜ | Recomendable si el banco va a tomar decisiones con nuestros informes |

## 3. Lo que va a preguntar el banco (y qué contestar)

| Pregunta | Respuesta corta |
|---|---|
| ¿Qué tan preciso es el conteo? | "Lo estamos midiendo con hacienda real con este protocolo." Mostrar el informe cuando lo tengan. Nunca dar un número sin medirlo. |
| ¿Dónde están los datos? | En el servidor que acordemos con ustedes. Cifrados en tránsito (HTTPS), con backups diarios y acceso por organización. |
| ¿Qué pasa si el productor miente? | Fotos con GPS, hora y huella digital; conteo independiente del inspector a ciegas; alertas cuando lo declarado no cierra. |
| ¿Están conectados a SENASA? | No todavía: requiere convenio. Hoy se trabaja con la documentación oficial que carga el productor, leída automáticamente, y nunca se presenta como dato oficial. |
| ¿Quiénes son y qué respaldo tienen? | Equipo de ingeniería de la FIUBA, con producto funcionando. Tener lista la sociedad y un contacto. |
| ¿Cuánto cuesta? | El piloto es gratis. Después, precio por garantía controlada por mes (ver propuesta). |

Para las preguntas de seguridad informática, ver `cuestionario-seguridad.md`.

## 4. Antes de la reunión

1. Hacer la prueba con hacienda real, aunque sea chica (un establecimiento, 10 pruebas), para llegar con un número propio.
2. Tener el sistema desplegado en un dominio propio con HTTPS. Mostrar la demo en `localhost` resta.
3. Preparar una garantía de ejemplo cargada de punta a punta, con datos reales del establecimiento de la prueba y con su autorización.
4. Llevar la propuesta de piloto impresa (una página).
5. Saber a quién le hablan: ¿riesgo crediticio, banca agro o innovación? Cada uno compra por razones distintas.
