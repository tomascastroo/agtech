/** Contratos de la API REST consumidos por el frontend. */
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AssetStatus = 'DRAFT' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'OBSERVED' | 'REJECTED';
export type Outcome = 'VERIFIED' | 'OBSERVED' | 'REJECTED' | 'INCONCLUSIVE';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type RunStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type PortfolioState = 'OK' | 'ALERTA' | 'EN_REVISION' | 'OBSERVADO';
export type Unit = 'HEAD' | 'HECTARE' | 'TONNE' | 'UNIT' | 'CUBIC_METER';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}
export interface GeoMultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  organizationId: string;
  organizationName: string;
  permissions: string[];
}

export interface AssetType {
  id: string;
  code: string;
  name: string;
  category: string;
  defaultUnit: Unit;
  verificationStrategy: 'LIVESTOCK_COUNTING' | 'VEGETATION_AREA' | 'EVIDENCE_REVIEW';
  evidenceSources: string[];
  requiredDocuments: string[];
  metadataSchema: JsonSchema;
  mobility: 'LOW' | 'HIGH';
}

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  pattern?: string;
  'x-widget'?: string;
  'x-unit'?: string;
  'x-order'?: number;
}

export interface JsonSchema {
  type?: 'object';
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
  additionalProperties?: boolean;
}

export interface MonitoringConfig {
  enabled: boolean;
  intervalHours: number;
  maxEvidenceAgeHours: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export interface AssetSummary {
  id: string;
  name: string;
  status: AssetStatus;
  declaredQuantity: number;
  unit: Unit;
  declaredValue: number | null;
  currency: string;
  location: GeoPoint;
  lastVerificationRunId: string | null;
  lastVerifiedAt: string | null;
  lastScore: number | null;
  lastDetectedQuantity: number | null;
  assetType: { code: string; name: string; category: string } | null;
  establishment: { id: string; name: string; province: string; locality: string | null } | null;
  openAlerts?: number;
  highestAlertSeverity?: Severity | null;
  guaranteeActive?: boolean;
}

export interface AssetDetail extends Omit<AssetSummary, 'assetType' | 'establishment'> {
  area: GeoMultiPolygon | null;
  assetType: AssetType;
  establishment: {
    id: string;
    name: string;
    holderName: string;
    holderTaxId: string;
    renspa: string | null;
    establishmentType: string;
    tenure: string;
    province: string;
    locality: string | null;
    totalAreaHa: number | null;
    point: GeoPoint | null;
    boundary: GeoMultiPolygon | null;
  };
  metadata: { version: number; data: Record<string, unknown>; updatedAt: string } | null;
  guarantee: {
    id: string;
    status: string;
    coveredQuantity: number;
    valuation: number | null;
    currency: string;
    confirmedAt: string;
    verificationRunId: string;
  } | null;
}

export interface EstablishmentSummary {
  id: string;
  name: string;
  holderName: string;
  province: string;
  locality: string | null;
  establishmentType: string;
  renspa: string | null;
  totalAreaHa: number | null;
  point: GeoPoint | null;
  boundary: GeoMultiPolygon | null;
  assetCount: number;
  openAlerts: number;
  criticalAlerts: number;
  lastVerifiedAt: string | null;
  averageScore: number | null;
}

export interface DocumentItem {
  id: string;
  type: string;
  status: 'PENDING_REVIEW' | 'VALID' | 'EXPIRED' | 'REJECTED';
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  issuedAt: string | null;
  expiresAt: string | null;
  scope: 'ASSET' | 'ESTABLISHMENT';
  uploadedAt: string;
  dataSource?: 'REAL' | 'DEMO';
  analysis?: DocumentAnalysis | null;
}

export interface OcrFieldEntry {
  field: string;
  original: string;
  normalized: string;
  confidence: number | null;
  line: number;
}

/** Lectura automática del documento comparada con lo declarado (no certifica autenticidad). */
export interface DocumentAnalysis {
  status: 'PENDING' | 'CONSISTENT' | 'REVIEW_REQUIRED' | 'FAILED';
  method: 'PDF_TEXT' | 'OCR' | null;
  detectedType: string | null;
  extractedFields: {
    renspa?: string[];
    cuit?: string[];
    holderNames?: string[];
    issuedAt?: string | null;
    expiresAt?: string | null;
  };
  extractionConfidence: number | null;
  validationResults: {
    check:
      | 'TEXT'
      | 'DOCUMENT_TYPE'
      | 'RENSPA'
      | 'CUIT'
      | 'HOLDER'
      | 'EXPIRY'
      | 'ESTABLISHMENT'
      | 'LOCALITY'
      | 'PROVINCE';
    status: 'MATCH' | 'MISMATCH' | 'NOT_FOUND' | 'NOT_DECLARED';
    required: boolean;
    expected?: string | null;
    found?: string[];
    message: string;
  }[];
  /** Campos leídos: valor original, normalizado y confianza de la línea. */
  fieldEntries?: OcrFieldEntry[];
  engine: string | null;
  error: string | null;
  analyzedAt: string | null;
  disclaimer: string;
}

export interface DocumentRequirement {
  requirement: string;
  alternatives: string[];
  satisfied: boolean;
  documentId: string | null;
  status: string | null;
}

export interface EvidenceItem {
  id: string;
  type: 'IMAGE' | 'SATELLITE_SCENE' | 'RFID_READ' | 'SENSOR_READING';
  source: { code: string; name: string; kind: string; provider: string; simulated: boolean } | null;
  deviceId: string | null;
  capturedAt: string;
  location: GeoPoint | null;
  locationSource: string | null;
  locationAccuracyM: number | null;
  mimeType: string | null;
  sha256: string | null;
  metadata: Record<string, unknown>;
  url: string | null;
}

export interface ScoreComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
  factors: { label: string; value: string; impact?: number }[];
}

export interface Anomaly {
  code: string;
  severity: Severity;
  message: string;
}

export interface VerificationResult {
  outcome: Outcome;
  declaredQuantity: number;
  detectedQuantity: number | null;
  unit: Unit;
  matchPercentage: number | null;
  difference: number | null;
  finalScore: number;
  confidence: number;
  riskLevel: RiskLevel;
  locationVerified: boolean | null;
  locationDistanceM: number | null;
  scoringModelVersion: string;
  components: ScoreComponent[];
  weights: Record<string, number>;
  riskPenalty: number;
  anomalies: Anomaly[];
  summary: string;
  createdAt: string;
}

export interface VerificationRun {
  id: string;
  status: RunStatus;
  trigger: 'MANUAL' | 'SCHEDULED' | 'API';
  assetId: string;
  asset: {
    id: string;
    name: string;
    unit: Unit;
    typeCode: string | null;
    typeName: string | null;
    establishmentName: string | null;
  } | null;
  requestedByProcess: string | null;
  attempts: number;
  pipelineVersion: string;
  failureReason: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: VerificationResult | null;
}

export interface VerificationDetail extends VerificationRun {
  inputSnapshot: Record<string, unknown>;
  metrics: {
    key: string;
    value: number;
    unit: string | null;
    source: string;
    details?: Record<string, unknown>;
  }[];
  externalData: {
    id: string;
    source: string;
    provider: string;
    subjectRef: string;
    status: string;
    simulated: boolean;
    payload: Record<string, unknown>;
    fetchedAt: string;
  }[];
  history: {
    verificationId: string;
    completedAt: string;
    declaredQuantity: number;
    detectedQuantity: number | null;
    finalScore: number;
    outcome: Outcome;
  }[];
  progress: { step: PipelineStep; index: number; total: number } | null;
}

export type PipelineStep =
  | 'EVIDENCE'
  | 'METRICS'
  | 'CROSS_CHECKS'
  | 'SCORING'
  | 'ALERTS'
  | 'REPORT';

export interface VerificationEvidence {
  role: 'PRIMARY' | 'SUPPORTING' | 'EXCLUDED';
  detectedCount: number | null;
  confidence: number | null;
  exclusionReason: string | null;
  analysis: {
    count?: number;
    quality?: { score?: number; sharpness?: number; issues?: string[] };
    model?: { code: string; version: string; simulated: boolean };
    sceneId?: string;
    ndviMean?: number;
    vegetatedAreaHa?: number;
    cloudCoverPct?: number;
  };
  evidence: EvidenceItem | null;
}

export interface AlertItem {
  id: string;
  type: string;
  severity: Severity;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  title: string;
  description: string;
  assetId: string;
  verificationId: string | null;
  asset: {
    id: string;
    name: string;
    typeName: string | null;
    establishmentName: string | null;
  } | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface ReportItem {
  id: string;
  title: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  verificationId: string;
  assetId: string;
  asset: { name: string; typeName: string | null; establishmentName: string | null } | null;
  generatedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  formats: Partial<
    Record<'PDF' | 'CSV' | 'JSON', { version: number; sizeBytes: number; sha256: string }>
  >;
}

export interface DeviceInstallation {
  id: string;
  requestType: 'KIT_REQUEST' | 'SELF_INSTALLED';
  status: 'REQUESTED' | 'SHIPPED' | 'INSTALLED' | 'ACTIVE' | 'REMOVED';
  label: string;
  location: GeoPoint | null;
  kitSpec: {
    cameras: number;
    connectivity: string;
    solarPower: boolean;
    rfidReader: boolean;
  } | null;
  shippingAddress: string | null;
  installedAt: string | null;
  createdAt: string;
  device: {
    id: string;
    type: string;
    serialNumber: string;
    model: string | null;
    connectivity: string;
    powerSource: string;
    status: string;
    gateway: string;
    lastSeenAt: string | null;
  } | null;
}

export interface PortfolioRow {
  assetId: string;
  assetName: string;
  assetTypeCode: string;
  assetTypeName: string;
  establishmentId: string;
  establishmentName: string;
  holderName: string;
  province: string;
  quantity: number;
  declaredQuantity: number;
  unit: Unit;
  status: AssetStatus;
  state: PortfolioState;
  lastVerifiedAt: string | null;
  lastScore: number | null;
  riskLevel: RiskLevel | null;
  openAlerts: number;
  highestSeverity: Severity | null;
  guaranteeActive: boolean;
  declaredValue: number | null;
  currency: string;
  location: GeoPoint;
}

export interface DashboardSummary {
  kpis: {
    portfolioAssets: number;
    verified: number;
    inReview: number;
    withAlerts: number;
    activeGuarantees: number;
    guaranteedValueUsd: number;
    monitoredAssets: number;
    openAlerts: number;
  };
  /** Qué está pendiente y de quién (solicitudes, documentación, verificaciones). */
  operations?: {
    waitingProducer: number;
    demoRequests: number;
    openInformationRequests: number;
    documentsToReview: number;
    verificationsInProgress: number;
    verificationsCompleted30d: number;
    producers: number;
  };
  alertsBySeverity: Partial<Record<Severity, number>>;
  risk: {
    weightedScore: number | null;
    portfolioValueUsd: number;
    distribution: Record<RiskLevel, number>;
  };
  byAssetType: {
    code: string;
    name: string;
    count: number;
    declaredValueUsd: number;
    averageScore: number | null;
  }[];
  latestVerifications: {
    id: string;
    status: RunStatus;
    trigger: string;
    completedAt: string | null;
    queuedAt: string;
    assetId: string;
    assetName: string;
    typeName: string;
    establishmentName: string;
    finalScore: number | null;
    outcome: Outcome | null;
    detectedQuantity: number | null;
    declaredQuantity: number | null;
    unit: Unit | null;
    matchPercentage: number | null;
  }[];
  recentAlerts: {
    id: string;
    title: string;
    severity: Severity;
    status: string;
    createdAt: string;
    assetId: string;
    assetName: string;
    establishmentName: string;
  }[];
}

export interface MonitoringEvent {
  id: string;
  assetId: string;
  type: string;
  severity: Severity;
  message: string;
  occurredAt: string;
  verificationRunId: string | null;
}

export interface SatelliteObservation {
  id: string;
  observedAt: string;
  ndviMean: number | null;
  vegetatedAreaHa: number | null;
  declaredAreaHa: number | null;
  coverageRatio: number | null;
  changeVsPreviousPct: number | null;
  scene: {
    sceneId: string;
    provider: string;
    cloudCoverPct: number | null;
    resolutionM: number;
    simulated: boolean;
    previewUrl: string | null;
  } | null;
}

export interface AnimalItem {
  id: string;
  officialTag: string;
  category: string;
  breed: string | null;
  sex: 'M' | 'H';
  status: string;
  identifications: {
    method: string;
    identifier: string;
    confidence: number | null;
    isPrimary: boolean;
  }[];
  lastObservation: { observedAt: string; method: string; confidence: number | null } | null;
}

export interface AlertRule {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: Severity;
  conditionType: string;
  parameters: Record<string, number>;
  assetTypeCodes: string[];
  enabled: boolean;
  scope: 'SYSTEM' | 'ORGANIZATION';
}

export interface IntegrationsStatus {
  providers: {
    capability: string;
    name: string;
    simulated: boolean;
    status: string;
    detail?: string | null;
    source?: string;
  }[];
  models: {
    code: string;
    name: string;
    task: string;
    provider: string;
    versions: { version: string; status: string; simulated: boolean }[];
  }[];
}

export interface AuditLogItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorType: 'USER' | 'SYSTEM';
  userId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

/** Solicitud de garantía: la crea la entidad, la completa el productor, la verifica AgroGarantías. */
export interface GuaranteeRequest {
  id: string;
  status: 'INVITED' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION';
  stage: 'INVITED' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFICATION_FAILED' | 'VERIFIED';
  requester: { name: string; kind: string | null };
  producer: { name: string; taxId: string; email?: string | null };
  guaranteeType: {
    code: string;
    name?: string;
    unit?: string;
    verificationStrategy?: string;
    metadataSchema?: AssetType['metadataSchema'];
    evidenceGuidance?: string | null;
  };
  requestedAmount: number | null;
  currency: string;
  notes: string | null;
  inviteExpiresAt: string;
  submittedAt: string | null;
  createdAt: string;
  establishment: {
    id: string;
    name: string;
    province: string;
    locality: string | null;
    renspa: string | null;
    point: GeoPoint | null;
  } | null;
  asset: {
    id: string;
    name: string;
    declaredQuantity: number;
    unit: string;
    status: string;
    location: GeoPoint | null;
    hasArea: boolean;
  } | null;
  evidenceCount: number;
  documentCount: number;
  missing: string[];
  verification?: {
    runId: string;
    status: string;
    completedAt: string | null;
    outcome: string | null;
    declaredQuantity: number | null;
    detectedQuantity: number | null;
    matchPercentage: number | null;
    finalScore: number | null;
    confidence: number | null;
    riskLevel: string | null;
    counting?: CountingBreakdown | null;
  } | null;
  alerts?: { id: string; type: string; severity: string; title: string; status: string }[];
  crossSources?: CrossSource[];
  scans?: RequestScanSummary[];
  livestockProfile?: LivestockProfile | null;
  invitation?: { url: string; expiresAt: string };
  producerStatus: ProducerStatus;
  progress: { key: string; label: string; state: 'DONE' | 'PENDING' | 'TODO' | 'IN_PROGRESS' }[];
  tasks: ProducerTask[];
  acceptedAt: string | null;
  requiredDocuments: {
    requirement: string;
    alternatives: string[];
    satisfied: boolean;
    status: string | null;
  }[];
  informationRequests: InformationRequest[];
  documentation?: Documentation | null;
  dataLayers?: DataLayers | null;
  dataSource?: 'REAL' | 'DEMO';
  demoScenario?: string | null;
  creditProductCode?: string | null;
}

export type RequirementStatus =
  | 'PENDING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'CONSISTENT'
  | 'INCONSISTENT'
  | 'REVIEW_REQUIRED'
  | 'NOT_APPLICABLE';

export interface SourceRef {
  label: string;
  url: string;
}

/** Requisito documental de una solicitud (checklist). */
export interface RequirementItem {
  code: string;
  name: string;
  description: string;
  purpose: string;
  howTo: string;
  category: string;
  categoryLabel: string;
  obligation: 'MANDATORY' | 'CONDITIONAL' | 'EVALUATION';
  obligationLabel: string;
  condition: string | null;
  documentTypes: { code: string; name: string }[];
  validation: 'OCR_CHECK' | 'MANUAL_REVIEW';
  status: RequirementStatus;
  statusLabel: string;
  reason: string;
  note: string | null;
  document: {
    id: string;
    title: string;
    type: string;
    uploadedAt: string;
    demo: boolean;
  } | null;
  requested: { informationRequestId: string; at: string; message: string } | null;
  sources?: SourceRef[];
  officialVerification: string | null;
}

export interface Documentation {
  product: {
    code: string;
    name: string;
    kind: 'BASE' | 'REFERENCE';
    description: string;
    sources?: SourceRef[];
    consultedAt: string | null;
  } | null;
  items: RequirementItem[];
  summary: {
    total: number;
    consistent: number;
    pending: number;
    attention: number;
    processing: number;
    notApplicable: number;
    mandatoryMissing: number;
  };
}

/** Declarado → extraído (OCR) → verificado internamente → fuente oficial (no conectada). */
export interface DataLayers {
  fields: {
    key: string;
    label: string;
    declared: string | null;
    extracted: (OcrFieldEntry & { documentId: string; documentTitle: string })[];
    internal: 'MATCH' | 'MISMATCH' | 'NOT_COMPARED';
    official: { status: 'NOT_CONNECTED' | 'CONNECTED'; value: string | null };
  }[];
  officialSources: {
    code: string;
    name: string;
    status: 'NOT_CONNECTED' | 'CONNECTED';
    scope: string[];
    reason: string;
  }[];
}

export interface CreditProductOption {
  code: string;
  name: string;
  description: string;
  kind: 'BASE' | 'REFERENCE';
  sources: SourceRef[];
  consultedAt: string | null;
  requirements: {
    code: string;
    name: string;
    obligation: RequirementItem['obligation'];
    obligationLabel: string;
    condition: string | null;
  }[];
}

export interface RequestCreationOptions {
  products: CreditProductOption[];
  defaultProductCode: string | null;
  producers: {
    name: string;
    taxId: string;
    email: string | null;
    establishments: { id: string; name: string; province: string; locality: string | null; renspa: string | null }[];
  }[];
}

export interface DemoScenarioOption {
  code: string;
  name: string;
  description: string;
  shows: string;
}

export interface DemoCreated {
  requestId: string;
  scenario: { code: string; name: string };
  producerAccess: { email: string; password: string };
  demo: true;
}

export type ProducerStatus =
  | 'INVITATION_PENDING'
  | 'PREPARING'
  | 'PENDING_DOCUMENTATION'
  | 'PENDING_EVIDENCE'
  | 'READY_FOR_VERIFICATION'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'INFO_REQUIRED'
  | 'FINALIZED';

export interface ProducerTask {
  kind:
    | 'ESTABLISHMENT'
    | 'ASSET'
    | 'EVIDENCE'
    | 'DOCUMENTS'
    | 'SUBMIT'
    | 'INFO_EVIDENCE'
    | 'INFO_DOCUMENT';
  title: string;
  description: string;
  informationRequestId?: string;
  documentType?: string | null;
  requirementCode?: string | null;
  requestId?: string;
  assetName?: string | null;
}

export interface InformationRequest {
  id: string;
  kind: 'DOCUMENT' | 'EVIDENCE';
  documentType: string | null;
  requirementCode?: string | null;
  message: string;
  status: 'OPEN' | 'RESPONDED';
  createdAt: string;
  respondedAt: string | null;
}

/** Detalle de una solicitud para el productor (incluye documentos y evidencia aportada). */
export interface ProducerRequestDetail extends GuaranteeRequest {
  documents: { documents: DocumentItem[] } | null;
  evidence: EvidenceItem[];
}

export interface ProducerOverview {
  producer: { name: string; email: string };
  requests: GuaranteeRequest[];
  tasks: (ProducerTask & { requestId: string })[];
  establishments: NonNullable<GuaranteeRequest['establishment']>[];
  assets: (NonNullable<GuaranteeRequest['asset']> & {
    requestId: string;
    guaranteeType: GuaranteeRequest['guaranteeType'];
  })[];
}

/** Desglose del conteo: detecciones por foto vs animales únicos estimados. */
export interface CountingBreakdown {
  photos: {
    evidenceId: string;
    role: 'PRIMARY' | 'SUPPORTING' | 'EXCLUDED';
    detectedCount: number | null;
    confidence: number | null;
    exclusionReason: string | null;
    capturedAt: string;
    fromCamera: boolean;
    fileName: string | null;
  }[];
  detectionsSum: number | null;
  uniqueEstimate: number | null;
  overlapGroups: number | null;
  confidence: number | null;
  possibleOverlap: boolean;
  overlapMessage: string | null;
}

/** Una fuente independiente de evidencia y lo que informa (informativo; no altera el score). */
export interface CrossSource {
  key: 'DECLARATION' | 'VISION' | 'RFID' | 'GPS' | 'DOCUMENTS' | 'SENASA' | 'HISTORY';
  label: string;
  value: string;
  state: 'CONSISTENT' | 'WARNING' | 'NO_DATA';
  simulated: boolean;
}

export interface RfidReading {
  id: string;
  electronicId: string;
  observedAt: string;
  status: 'IDENTIFIED' | 'UNKNOWN_TAG' | 'OTHER_ESTABLISHMENT';
  source: 'READER_BRIDGE' | 'SIMULATED';
  establishmentName: string;
  officialTag: string | null;
  readerSerial: string | null;
}

/** Manga + RFID: bovino identificado por su caravana (la identidad es el RFID). */
export interface BovineIndividual {
  id: string;
  internalCode: string;
  electronicId: string;
  simulated: boolean;
  animalId: string | null;
  firstIdentifiedAt: string;
  lastIdentifiedAt: string;
  confirmations: number;
  evidenceImages?: number;
}

export interface BovineIndividualsResponse {
  total: number;
  real: number;
  simulated: number;
  items: BovineIndividual[];
}

export interface BovineIndividualDetail extends BovineIndividual {
  captures: {
    id: string;
    scanSessionId: string;
    sequence: number;
    rfidSource: 'READER_BRIDGE' | 'SIMULATED';
    simulated: boolean;
    electronicId: string;
    evidenceId: string | null;
    processedAt: string | null;
    trackId: number | null;
    matcher: string | null;
    bestFrames: {
      index: number;
      capturedMs: number;
      box: { x: number; y: number; width: number; height: number };
      score: number;
      quality: number;
      sha256: string;
      url: string | null;
    }[];
  }[];
}

/** Escaneo de bovinos asociado a una solicitud (resumen). */
export type ScanModeCode = 'FIXED' | 'SWEEP' | 'PEN' | 'PHOTO' | 'CHUTE';
export type EvidenceStatusCode = 'VALIDATED' | 'INCONCLUSIVE' | 'INSUFFICIENT';
export interface GuidanceItem {
  code: string;
  message: string;
}

/** Tipo de producción ganadera del rodeo (lo deriva la API del sistema productivo). */
export interface LivestockProfile {
  system: 'FEEDLOT' | 'CRIA' | 'PASTOREO';
  label: string;
  declaredSystem: string | null;
  inferred: boolean;
  recommendedModes: ScanModeCode[];
  censusModes: ScanModeCode[];
  guidance: string;
  coverageNote: string;
}

export interface RequestScanSummary {
  id: string;
  mode: ScanModeCode;
  modeLabel: string;
  stillAnimals: boolean;
  evidenceStatus: EvidenceStatusCode | null;
  guidance: GuidanceItem[];
  coverageViews: number | null;
  status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  durationS: number | null;
  officialCount: number | null;
  deviceCount: number | null;
  quality: 'COMPLETE' | 'LIMITED' | 'INSUFFICIENT' | null;
  warningCount: number;
  lowerBound: boolean;
  error: string | null;
}

export interface ScanBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  label: string;
}

/** Escaneo con resultado oficial, para la entidad. */
export interface ScanDetail {
  id: string;
  mode: ScanModeCode;
  modeLabel: string;
  evidenceStatus: EvidenceStatusCode | null;
  evidenceStatusLabel: string | null;
  guidance: GuidanceItem[];
  status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  durationS: number | null;
  sampledFps: number;
  frameSize: { width: number; height: number };
  location: GeoPoint | null;
  locationAccuracyM: number | null;
  maxDisplacementM: number | null;
  heading: { startDeg: number | null; sweptDeg: number | null; source: string } | null;
  device: Record<string, unknown>;
  received: { frames: number; keyFrames: number };
  deviceResult: { netCount?: number; backend?: string; model?: string } | null;
  official: {
    count: number | null;
    method: string;
    stillAnimals: boolean;
    pen: {
      observed: number;
      tracksCounted: number;
      mergedTracks: number;
      maxSimultaneous: number;
      coverageViews: number;
      revisitRatio: number;
      occlusionRatio: number;
      edgeAnimals: number;
    } | null;
    metrics: {
      frames: number;
      blurryRatio: number;
      underexposedRatio: number;
      overexposedRatio: number;
      fastMotionRatio: number;
      occlusionRatio: number;
      smallAnimalRatio: number;
      coverageViews: number | null;
      registeredPhotos: number | null;
    } | null;
    positiveCrossings: number;
    negativeCrossings: number;
    maxSimultaneous: number;
    confirmedTracks: number;
    confidence: number;
    framesProcessed: number;
    blurryFrames: number;
    limitations: string[];
    model: { code: string; version: string; simulated: boolean };
    tracker: string;
    lowerBound: boolean;
    /** Manga + RFID: asociaciones resueltas por el servidor. */
    chute?: {
      confirmed: number;
      ambiguous: number;
      insufficient: number;
      identified: number;
      rfidSimulated: boolean;
    } | null;
  } | null;
  quality: 'COMPLETE' | 'LIMITED' | 'INSUFFICIENT' | null;
  warnings: string[];
  evidenceId: string | null;
  error: string | null;
  keyFrames?: {
    index: number;
    capturedMs: number;
    sha256: string;
    url: string;
    detections: ScanBox[] | null;
  }[];
}

/** Historial del rodeo por verificación y cambios relevantes (monitoreo recurrente). */
export interface LivestockHistory {
  rows: {
    runId: string;
    date: string;
    declared: number | null;
    observed: number | null;
    basis: 'CENSUS' | 'LOWER_BOUND' | null;
    rfidIdentified: number | null;
    rfidSimulated: number;
    coverage: number | null;
    status: 'VERIFIED' | 'OBSERVED' | 'REJECTED' | 'INCONCLUSIVE' | null;
  }[];
  changes: {
    code: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    fromRunId: string;
    toRunId: string;
    date: string;
    message: string;
  }[];
  rfidWindowDays: number;
}

/** Conciliación visual + RFID (REAL y SIMULADO por separado). */
export interface LivestockReconciliation {
  method: 'TIME_MATCH' | 'COUNTS_ONLY' | 'NO_RFID' | 'NO_VISUAL';
  observed: number | null;
  observedBasis: 'CENSUS' | 'LOWER_BOUND' | null;
  observedAt: string | null;
  real: { tags: number; identified: number; unknown: number; otherEstablishment: number };
  simulated: { tags: number; identified: number; unknown: number; otherEstablishment: number };
  matches: number | null;
  observedWithoutRfid: number | null;
  rfidWithoutVisual: number | null;
  totalsDifference: number | null;
  notes: string[];
  windowDays: number;
}
