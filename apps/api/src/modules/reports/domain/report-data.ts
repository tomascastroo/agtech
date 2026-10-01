import type { ScoreComponentResult } from '../../scoring/domain/scoring.types.js';
import type { Anomaly } from '../../verification/domain/verification.types.js';

export const REPORT_SCHEMA_VERSION = 'guarantee-report/1.0';

export interface ReportEvidenceItem {
  id: string;
  role: string;
  sourceName: string;
  sourceKind: string;
  simulated: boolean;
  capturedAt: string;
  label: string | null;
  coordinates: [number, number] | null;
  detectedCount: number | null;
  confidence: number | null;
  qualityScore: number | null;
  model: string | null;
  sha256: string | null;
  exclusionReason: string | null;
  /** Solo para el render PDF; no se serializa. */
  image?: { bytes: Buffer; mimeType: string };
}

export interface GuaranteeReportData {
  schemaVersion: string;
  reportId: string;
  reportVersion: number;
  verificationId: string;
  generatedAt: string;
  organization: { name: string };
  establishment: {
    name: string;
    holderName: string;
    holderTaxId: string;
    renspa: string | null;
    establishmentType: string;
    tenure: string;
    province: string;
    locality: string | null;
    totalAreaHa: number | null;
    coordinates: [number, number] | null;
  };
  asset: {
    id: string;
    name: string;
    typeName: string;
    unit: string;
    unitLabel: string;
    declaredQuantity: number;
    declaredValue: number | null;
    currency: string;
  };
  verification: {
    trigger: string;
    requestedBy: string;
    queuedAt: string;
    completedAt: string | null;
    pipelineVersion: string;
  };
  result: {
    outcome: string;
    declaredQuantity: number;
    detectedQuantity: number | null;
    matchPercentage: number | null;
    difference: number | null;
    finalScore: number;
    confidence: number;
    riskLevel: string;
    locationVerified: boolean | null;
    locationDistanceM: number | null;
    scoringModelVersion: string;
    components: ScoreComponentResult[];
    weights: Record<string, number>;
    riskPenalty: number;
    anomalies: Anomaly[];
    summary: string;
  };
  evidence: ReportEvidenceItem[];
  history: {
    completedAt: string;
    declaredQuantity: number;
    detectedQuantity: number | null;
    finalScore: number;
    outcome: string;
  }[];
  documents: {
    title: string;
    type: string;
    status: string;
    expiresAt: string | null;
    sha256: string;
  }[];
  externalData: {
    source: string;
    provider: string;
    simulated: boolean;
    status: string;
    detail: string;
  }[];
  models: { code: string; version: string; simulated: boolean }[];
  simulatedSources: string[];
  methodology: string[];
}

export const LABELS = {
  outcome: {
    VERIFIED: 'Verificado',
    OBSERVED: 'Con observaciones',
    REJECTED: 'No satisfactorio',
    INCONCLUSIVE: 'No concluyente',
  } as Record<string, string>,
  risk: { LOW: 'Bajo', MEDIUM: 'Moderado', HIGH: 'Alto' } as Record<string, string>,
  tenure: { OWNED: 'Propio', LEASED: 'Arrendado', OTHER: 'Otro' } as Record<string, string>,
  documentStatus: {
    VALID: 'Válido',
    PENDING_REVIEW: 'Pendiente de revisión',
    EXPIRED: 'Vencido',
    REJECTED: 'Rechazado',
  } as Record<string, string>,
  role: { PRIMARY: 'Principal', SUPPORTING: 'Respaldo', EXCLUDED: 'Excluida' } as Record<
    string,
    string
  >,
  trigger: { MANUAL: 'Manual', SCHEDULED: 'Monitoreo programado', API: 'API' } as Record<
    string,
    string
  >,
};
