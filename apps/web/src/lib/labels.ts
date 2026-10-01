/** Textos de interfaz para códigos del dominio. */
export const ASSET_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'En alta',
  PENDING_VERIFICATION: 'En verificación',
  VERIFIED: 'Verificado',
  OBSERVED: 'Con observaciones',
  REJECTED: 'No satisfactorio',
};

export const PORTFOLIO_STATE_LABELS: Record<string, string> = {
  OK: 'OK',
  ALERTA: 'Alerta',
  EN_REVISION: 'En revisión',
  OBSERVADO: 'Observado',
};

export const OUTCOME_LABELS: Record<string, string> = {
  VERIFIED: 'Verificado',
  OBSERVED: 'Con observaciones',
  REJECTED: 'No satisfactorio',
  INCONCLUSIVE: 'No concluyente',
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En cola',
  PROCESSING: 'Procesando',
  COMPLETED: 'Completada',
  FAILED: 'Fallida',
};

export const TRIGGER_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  SCHEDULED: 'Programada',
  API: 'API',
};

export const RISK_LABELS: Record<string, string> = {
  LOW: 'Bajo',
  MEDIUM: 'Moderado',
  HIGH: 'Alto',
};

export const SEVERITY_LABELS: Record<string, string> = {
  INFO: 'Informativa',
  WARNING: 'Advertencia',
  CRITICAL: 'Crítica',
};

export const ALERT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Abierta',
  ACKNOWLEDGED: 'En seguimiento',
  RESOLVED: 'Resuelta',
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  RENSPA: 'RENSPA / SENASA',
  PROPERTY_DEED: 'Escritura',
  LEASE_CONTRACT: 'Contrato de tenencia',
  ID_CUIT: 'DNI / CUIT del titular',
  SANITARY_CERTIFICATE: 'Certificado sanitario',
  INSURANCE_POLICY: 'Póliza de seguro',
  OTHER: 'Documentación adicional',
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Pendiente de revisión',
  VALID: 'Válido',
  EXPIRED: 'Vencido',
  REJECTED: 'Rechazado',
};

export const ESTABLISHMENT_TYPE_LABELS: Record<string, string> = {
  CRIA: 'Cría',
  INVERNADA: 'Invernada',
  CICLO_COMPLETO: 'Ciclo completo',
  TAMBO: 'Tambo',
  FEEDLOT: 'Feedlot',
  AGRICOLA: 'Agrícola',
  MIXTO: 'Mixto',
  VITIVINICOLA: 'Vitivinícola',
  FRUTICOLA: 'Frutícola',
  FORESTAL: 'Forestal',
};

export const TENURE_LABELS: Record<string, string> = {
  OWNED: 'Propio',
  LEASED: 'Arrendado',
  OTHER: 'Otro',
};

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  FIXED_CAMERA: 'Cámara fija',
  SOLAR_CAMERA: 'Cámara solar',
  RFID_READER: 'Lector RFID',
  SENSOR: 'Sensor',
  GATEWAY: 'Gateway',
};

export const DEVICE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  ONLINE: 'En línea',
  OFFLINE: 'Sin señal',
  MAINTENANCE: 'Mantenimiento',
  DECOMMISSIONED: 'Dado de baja',
};

export const INSTALLATION_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Kit solicitado',
  SHIPPED: 'Kit enviado',
  INSTALLED: 'Instalado',
  ACTIVE: 'Activo',
  REMOVED: 'Retirado',
};

export const CONNECTIVITY_LABELS: Record<string, string> = {
  LTE_4G: '4G',
  WIFI: 'WiFi',
  SATELLITE: 'Satelital',
  LORA: 'LoRa',
};

export const EVENT_LABELS: Record<string, string> = {
  VERIFICATION_REQUESTED: 'Verificación solicitada',
  VERIFICATION_COMPLETED: 'Verificación completada',
  VERIFICATION_FAILED: 'Verificación fallida',
  EVIDENCE_CAPTURED: 'Capturas recibidas',
  EVIDENCE_UPLOADED: 'Carga de evidencia',
  DEVICE_NO_SIGNAL: 'Dispositivo sin señal',
  SATELLITE_SCENE_INGESTED: 'Escena satelital',
  ALERT_RAISED: 'Alerta',
  GUARANTEE_CONFIRMED: 'Garantía confirmada',
  MONITORING_SCHEDULED: 'Monitoreo programado',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  USER_LOGGED_IN: 'Inicio de sesión',
  USER_LOGIN_FAILED: 'Inicio de sesión fallido',
  USER_LOGGED_OUT: 'Cierre de sesión',
  REFRESH_TOKEN_REUSE_DETECTED: 'Reutilización de sesión detectada',
  ESTABLISHMENT_CREATED: 'Alta de establecimiento',
  ASSET_CREATED: 'Alta de activo',
  ASSET_UPDATED: 'Modificación de activo',
  USER_UPLOADED_DOCUMENT: 'Carga de documento',
  DOCUMENT_REVIEWED: 'Revisión de documento',
  DOCUMENT_DOWNLOADED: 'Descarga de documento',
  EVIDENCE_UPLOADED: 'Carga de evidencia',
  DEVICE_KIT_REQUESTED: 'Solicitud de kit',
  DEVICE_REGISTERED: 'Registro de dispositivo',
  VERIFICATION_STARTED: 'Verificación iniciada',
  VERIFICATION_COMPLETED: 'Verificación completada',
  VERIFICATION_FAILED: 'Verificación fallida',
  GUARANTEE_CONFIRMED: 'Garantía confirmada',
  ALERT_CREATED: 'Alerta generada',
  ALERT_ACKNOWLEDGED: 'Alerta en seguimiento',
  ALERT_RESOLVED: 'Alerta resuelta',
  ALERT_RULE_UPDATED: 'Regla de alerta modificada',
  REPORT_REQUESTED: 'Informe solicitado',
  REPORT_GENERATED: 'Informe generado',
  REPORT_DOWNLOADED: 'Descarga de informe',
  MONITORING_UPDATED: 'Configuración de monitoreo',
  SCORING_WEIGHTS_UPDATED: 'Pesos de scoring modificados',
};

export const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  LIVESTOCK_COUNTING:
    'Conteo por visión computacional sobre imágenes de cámaras y cargas manuales.',
  VEGETATION_AREA:
    'Superficie con vegetación activa (NDVI) sobre la escena satelital más reciente.',
  EVIDENCE_REVIEW: 'Revisión de evidencia visual: actualidad, calidad, integridad y ubicación.',
};

export const METRIC_LABELS: Record<string, string> = {
  declared_quantity: 'Cantidad declarada',
  detected_quantity: 'Cantidad detectada',
  match_percentage: 'Coincidencia',
  detection_confidence: 'Confianza de detección',
  image_quality_avg: 'Calidad media de imágenes',
  evidence_primary_count: 'Evidencias utilizadas',
  cameras_expected: 'Cámaras instaladas',
  cameras_reporting: 'Cámaras que reportaron',
  location_verified: 'Ubicación verificada',
  location_distance_m: 'Distancia a la ubicación declarada',
  registry_quantity: 'Existencias en registro externo',
  coverage_ratio: 'Cobertura de superficie',
  ndvi_mean: 'NDVI medio',
  cloud_cover_pct: 'Nubosidad',
  area_change_pct: 'Cambio de superficie',
  final_score: 'Score final',
  weighted_score: 'Score ponderado',
  risk_penalty: 'Penalización por anomalías',
  documentation_score: 'Documentación',
  existence_score: 'Existencia',
  historical_score: 'Historial',
  risk_score: 'Riesgo',
  consistency_score: 'Consistencia',
};

export const SOURCE_LABELS: Record<string, string> = {
  asset: 'Declaración',
  computer_vision: 'Visión computacional',
  satellite: 'Satélite',
  devices: 'Dispositivos',
  pipeline: 'Proceso',
  scoring: 'Motor de scoring',
  registry: 'Registro externo',
  geofence: 'Geocerca',
};

export const EXTERNAL_SOURCE_LABELS: Record<string, string> = {
  SENASA_RENSPA: 'SENASA · RENSPA (existencias declaradas)',
};
