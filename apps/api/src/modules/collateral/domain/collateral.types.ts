/**
 * Garantía bovina: tipos del dominio. AgroGarantías NO presta, no compra, no custodia ni emite
 * warrants: verifica, monitorea, cruza evidencia, detecta inconsistencias, alerta y decide cuándo
 * hace falta una inspección. Los códigos de estado están en español porque son el lenguaje que
 * ve la entidad financiera en el passport, el dashboard y el informe.
 */

export const PRODUCTION_TYPES = ['FEEDLOT', 'CRIA', 'INVERNADA', 'TAMBO'] as const;
export type ProductionType = (typeof PRODUCTION_TYPES)[number];

export const PRODUCTION_TYPE_LABELS: Record<ProductionType, string> = {
  FEEDLOT: 'Feedlot',
  CRIA: 'Cría',
  INVERNADA: 'Invernada',
  TAMBO: 'Tambo',
};

/**
 * Estado de la garantía. PENDIENTE_DECLARACION y PENDIENTE_VERIFICACION son previos al ciclo de
 * monitoreo (todavía no hay verificación inicial).
 */
export const COLLATERAL_STATES = [
  'PENDIENTE_DECLARACION',
  'PENDIENTE_VERIFICACION',
  'VERIFICADA',
  'EN_MONITOREO',
  'REQUIERE_EVIDENCIA',
  'REQUIERE_REVISION',
  'REQUIERE_INSPECCION',
  'NO_DETERMINABLE',
  'VENCIDA',
  'FINALIZADA',
] as const;
export type CollateralState = (typeof COLLATERAL_STATES)[number];

export const STATE_LABELS: Record<CollateralState, string> = {
  PENDIENTE_DECLARACION: 'Pendiente de declaración',
  PENDIENTE_VERIFICACION: 'Pendiente de verificación inicial',
  VERIFICADA: 'Verificada',
  EN_MONITOREO: 'En monitoreo',
  REQUIERE_EVIDENCIA: 'Requiere evidencia',
  REQUIERE_REVISION: 'Requiere revisión',
  REQUIERE_INSPECCION: 'Requiere inspección',
  NO_DETERMINABLE: 'No determinable',
  VENCIDA: 'Vencida',
  FINALIZADA: 'Finalizada',
};

export const RISK_LEVELS = ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'] as const;
export type CollateralRiskLevel = (typeof RISK_LEVELS)[number];

/** Modo en que se obtuvo la evidencia física. Cada uno tiene su propio techo de calidad. */
export const EVIDENCE_METHODS = [
  'FOTO',
  'VIDEO',
  'ESCANER_FIJO',
  'MANGA_RFID',
  'INSPECCION',
  'DOCUMENTO',
] as const;
export type EvidenceMethod = (typeof EVIDENCE_METHODS)[number];

export const EVIDENCE_METHOD_LABELS: Record<EvidenceMethod, string> = {
  FOTO: 'Foto',
  VIDEO: 'Video / barrido',
  ESCANER_FIJO: 'Escáner fijo (paso controlado)',
  MANGA_RFID: 'Manga + RFID',
  INSPECCION: 'Inspección presencial',
  DOCUMENTO: 'Documento',
};

export type EvidenceQualityLevel = 'ALTA' | 'MEDIA' | 'BAJA' | 'INSUFICIENTE';

/**
 * CAPTURA_EN_CAMPO: tomada desde la app en el momento (cámara / escáner). ARCHIVO_CARGADO: un
 * archivo elegido de la galería o la PC (puede ser viejo o de otro lugar). DISPOSITIVO_FIJO:
 * cámara instalada. DESCONOCIDO: cargas anteriores a este registro.
 */
export const CAPTURE_ORIGINS = [
  'CAPTURA_EN_CAMPO',
  'ARCHIVO_CARGADO',
  'DISPOSITIVO_FIJO',
  'DESCONOCIDO',
] as const;
export type CaptureOrigin = (typeof CAPTURE_ORIGINS)[number];

/** Base de un conteo: CENSO es comparable con lo declarado; COTA_INFERIOR muestra una parte. */
export type CountBasis = 'CENSO' | 'COTA_INFERIOR';

export const MOVEMENT_DIRECTIONS = ['EGRESO', 'INGRESO'] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

export const MOVEMENT_KINDS = [
  'VENTA',
  'TRASLADO',
  'FAENA',
  'MUERTE',
  'COMPRA',
  'NACIMIENTO',
  'OTRO',
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/**
 * OFICIAL: obtenido de una fuente oficial conectada (hoy ninguna). DOCUMENTADO: respaldado por un
 * documento cargado (p. ej. DT-e en PDF). DECLARADO: informado por el productor sin respaldo.
 */
export const MOVEMENT_SOURCE_LEVELS = ['OFICIAL', 'DOCUMENTADO', 'DECLARADO'] as const;
export type MovementSourceLevel = (typeof MOVEMENT_SOURCE_LEVELS)[number];

export const MOVEMENT_VERIFICATION_STATES = ['PENDIENTE', 'VERIFICADO', 'RECHAZADO'] as const;
export type MovementVerificationState = (typeof MOVEMENT_VERIFICATION_STATES)[number];

export const OFFICIAL_SOURCES = ['RENSPA', 'SIGSA', 'DTE', 'TRAZA'] as const;
export type OfficialSourceCode = (typeof OFFICIAL_SOURCES)[number];

export const OFFICIAL_SOURCE_STATUSES = [
  'CONECTADA',
  'SIN_CONEXION',
  'DOCUMENTO_CARGADO',
  'NO_DISPONIBLE',
  'ERROR',
] as const;
export type OfficialSourceStatus = (typeof OFFICIAL_SOURCE_STATUSES)[number];

export const INSPECTION_RESULTS = [
  'CONFORME',
  'CON_OBSERVACIONES',
  'NO_CONFORME',
  'NO_DETERMINABLE',
] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const LEGAL_INSTRUMENTS = [
  'PRENDA_FIJA',
  'PRENDA_FLOTANTE',
  'WARRANT',
  'OTRO',
  'NO_INFORMADO',
] as const;
export type LegalInstrument = (typeof LEGAL_INSTRUMENTS)[number];

export const LEGAL_STATUSES = [
  'NO_INFORMADO',
  'EN_TRAMITE',
  'INSCRIPTA',
  'VIGENTE',
  'CANCELADA',
] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];

export const IMMOBILIZATION_STATUSES = [
  'NO_INFORMADA',
  'NO_APLICA',
  'SOLICITADA',
  'VIGENTE',
  'LEVANTADA',
] as const;
export type ImmobilizationStatus = (typeof IMMOBILIZATION_STATUSES)[number];

export const ALERT_STATES = ['OPEN', 'ACKNOWLEDGED', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'] as const;
export type CollateralAlertState = (typeof ALERT_STATES)[number];

/** Tipos de alerta de garantía bovina (columna alerts.type). */
export const COLLATERAL_ALERT_TYPES = [
  'BG_STOCK_DECREASE',
  'BG_UNEXPECTED_MOVEMENT',
  'BG_EVIDENCE_EXPIRED',
  'BG_DOCUMENT_INCONSISTENCY',
  'BG_RFID_INCONSISTENCY',
  'BG_IDENTITY',
  'BG_LOCATION',
  'BG_QUANTITY_DIFFERENCE',
  'BG_COVERAGE',
  'BG_POSSIBLE_DOUBLE_GUARANTEE',
  'BG_SCORE_DETERIORATED',
  'BG_INSPECTION_REQUIRED',
  'BG_INSUFFICIENT_EVIDENCE',
] as const;
export type CollateralAlertType = (typeof COLLATERAL_ALERT_TYPES)[number];

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

/** Versión del motor (se guarda en cada snapshot para reproducir el cálculo). */
export const COLLATERAL_ENGINE_VERSION = 'bovine-collateral/1.0.0';
