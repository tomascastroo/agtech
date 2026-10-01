export const PERMISSIONS = {
  ESTABLISHMENTS_READ: 'establishments:read',
  ESTABLISHMENTS_WRITE: 'establishments:write',
  ASSETS_READ: 'assets:read',
  ASSETS_WRITE: 'assets:write',
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_WRITE: 'documents:write',
  DOCUMENTS_REVIEW: 'documents:review',
  EVIDENCE_READ: 'evidence:read',
  EVIDENCE_WRITE: 'evidence:write',
  DEVICES_READ: 'devices:read',
  DEVICES_WRITE: 'devices:write',
  VERIFICATIONS_READ: 'verifications:read',
  VERIFICATIONS_RUN: 'verifications:run',
  GUARANTEES_CONFIRM: 'guarantees:confirm',
  ALERTS_READ: 'alerts:read',
  ALERTS_MANAGE: 'alerts:manage',
  REPORTS_READ: 'reports:read',
  REPORTS_GENERATE: 'reports:generate',
  MONITORING_READ: 'monitoring:read',
  MONITORING_MANAGE: 'monitoring:manage',
  SETTINGS_READ: 'settings:read',
  SETTINGS_MANAGE: 'settings:manage',
  USERS_READ: 'users:read',
  AUDIT_READ: 'audit:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'establishments:read': 'Consultar establecimientos',
  'establishments:write': 'Crear y editar establecimientos',
  'assets:read': 'Consultar activos',
  'assets:write': 'Crear y editar activos',
  'documents:read': 'Consultar y descargar documentación',
  'documents:write': 'Cargar documentación',
  'documents:review': 'Revisar y validar documentación',
  'evidence:read': 'Consultar evidencias',
  'evidence:write': 'Cargar evidencias',
  'devices:read': 'Consultar dispositivos',
  'devices:write': 'Gestionar dispositivos e instalaciones',
  'verifications:read': 'Consultar verificaciones',
  'verifications:run': 'Ejecutar verificaciones',
  'guarantees:confirm': 'Confirmar activos como garantía',
  'alerts:read': 'Consultar alertas',
  'alerts:manage': 'Gestionar alertas',
  'reports:read': 'Consultar y descargar informes',
  'reports:generate': 'Generar informes',
  'monitoring:read': 'Consultar monitoreo',
  'monitoring:manage': 'Configurar monitoreo',
  'settings:read': 'Consultar configuración',
  'settings:manage': 'Modificar configuración de la organización',
  'users:read': 'Consultar usuarios',
  'audit:read': 'Consultar registro de auditoría',
};

const ALL = Object.values(PERMISSIONS);
const READ_ONLY = ALL.filter((p) => p.endsWith(':read'));

export const ROLE_DEFINITIONS: Record<
  string,
  { name: string; description: string; permissions: Permission[] }
> = {
  ADMIN: {
    name: 'Administrador',
    description: 'Acceso completo a la organización',
    permissions: ALL,
  },
  RISK_ANALYST: {
    name: 'Analista de riesgo',
    description: 'Gestiona activos, verificaciones, alertas e informes',
    permissions: ALL.filter(
      (p) => !['settings:manage', 'audit:read', 'documents:review'].includes(p),
    ),
  },
  AUDITOR: {
    name: 'Auditor',
    description: 'Consulta toda la información y el registro de auditoría',
    permissions: READ_ONLY,
  },
  PRODUCER: {
    name: 'Productor',
    description: 'Declara establecimiento, activos y evidencia de su solicitud (acceso por link)',
    permissions: [],
  },
  VIEWER: {
    name: 'Consulta',
    description: 'Acceso de solo lectura a la cartera',
    permissions: READ_ONLY.filter((p) => !['audit:read', 'users:read'].includes(p)),
  },
};
