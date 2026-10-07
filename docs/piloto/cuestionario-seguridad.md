# Respuestas al cuestionario de seguridad de un banco

Respuestas para los cuestionarios de evaluación de proveedores. Todo lo que figura acá está implementado y verificado (ver `docs/security-audit.md`). Lo que no tenemos dice "No", y conviene contestarlo así: un banco descubre rápido una respuesta inflada.

**No tenemos certificaciones** (ISO 27001, SOC 2). No decir que estamos "en proceso" si no lo estamos.

## Acceso y autenticación

| Pregunta | Respuesta |
|---|---|
| ¿Cómo se guardan las contraseñas? | Con Argon2id. Nunca en texto plano ni con cifrado reversible. |
| ¿Hay bloqueo por intentos fallidos? | Sí. La cuenta se bloquea temporalmente y cada intento queda auditado. |
| ¿Tienen doble factor (MFA)? | **No todavía.** Se puede priorizar si es requisito. |
| ¿SSO con el directorio del banco (SAML, OIDC)? | **No.** Usuarios propios de la plataforma. |
| ¿Roles y permisos? | Sí: administrador, analista de riesgo, auditor y lectura, con permisos por acción. El productor solo ve sus solicitudes. |
| ¿Cómo acceden productores e inspectores? | Con un link de un solo destinatario: token aleatorio de 256 bits, solo se guarda su hash y vence. El del inspector se invalida al firmar el acta. |
| ¿Sesiones? | Cookies `HttpOnly` y `Secure`, protección CSRF y refresh restringido. No se guardan tokens en el navegador. |

## Datos

| Pregunta | Respuesta |
|---|---|
| ¿Separación entre clientes? | Cada consulta filtra por organización. Se probó con 45 operaciones desde otra organización: ninguna devolvió datos ajenos. |
| ¿Cifrado en tránsito? | Sí: HTTPS obligatorio con HSTS. Los servicios internos no se exponen a internet. |
| ¿Cifrado en reposo? | Depende del servidor: se usa el cifrado de disco del proveedor de nube. La aplicación no cifra campos por separado. |
| ¿Dónde están los datos? | En el servidor que se acuerde con el banco. Se puede instalar en la nube o la región que el banco pida. |
| ¿Archivos (fotos, documentos)? | Privados. Solo se descargan con una URL firmada que vence a los pocos minutos y que se emite después de verificar permisos. |
| ¿Backups? | Diarios: base de datos y archivos, con verificación de integridad (SHA-256) y 14 días de retención. La copia fuera del servidor se configura en el despliegue. |
| ¿Qué datos personales tratan? | Nombre, email y CUIT de usuarios y productores; fotos con ubicación y hora de los establecimientos. |
| ¿Borrado de datos al terminar? | Se entregan los datos y se borran a pedido. Debe quedar escrito en el acuerdo. |

## Trazabilidad

| Pregunta | Respuesta |
|---|---|
| ¿Registro de auditoría? | Sí: logins, altas de usuarios, cambios de estado, decisiones y verificaciones, con usuario, fecha y detalle. |
| ¿Logs con datos sensibles? | No. Los tokens de los links y los parámetros sensibles se ocultan antes de escribir el log. |
| ¿Se puede probar que una foto no se alteró? | Cada evidencia guarda su huella SHA-256, la hora y la ubicación de captura. |

## Desarrollo y operación

| Pregunta | Respuesta |
|---|---|
| ¿Revisión de seguridad del código? | Revisión interna (octubre 2026): 3 hallazgos corregidos y 5 pendientes documentados, ninguno de severidad alta. |
| ¿Pentest externo? | **No todavía.** Lo podemos contratar antes de pasar a producción. |
| ¿Dependencias vulnerables? | `pnpm audit` sin vulnerabilidades conocidas a la fecha de la revisión. |
| ¿Antivirus en las cargas? | **No.** Solo se aceptan PDF e imágenes, validados por su contenido real y con límite de tamaño. |
| ¿Alta disponibilidad? | **No en el piloto:** un solo servidor con backups. Para producción: base gestionada y más de una instancia. |
| ¿Plan de continuidad o de respuesta a incidentes escrito? | **No todavía.** |
| ¿Monitoreo? | Monitor externo de disponibilidad y logs estructurados. |

## Pendientes a resolver antes de producción

1. Doble factor para los usuarios del banco.
2. Pentest externo.
3. Política de privacidad y términos (Ley 25.326), y procedimiento de incidentes.
4. Antivirus de cargas y rate limit por link.
5. Alta disponibilidad, si el banco la exige.
