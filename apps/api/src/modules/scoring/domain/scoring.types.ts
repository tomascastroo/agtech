import type { Mobility, QuantityUnit } from '../../assets/domain/asset.types.js';
import type { DocumentStatus, DocumentType } from '../../documents/domain/document.types.js';
import type { Tenure } from '../../establishments/domain/establishment.types.js';
import type {
  Anomaly,
  RiskLevel,
  VerificationOutcome,
} from '../../verification/domain/verification.types.js';

export const SCORE_COMPONENT_KEYS = [
  'documentation',
  'existence',
  'historical',
  'risk',
  'consistency',
] as const;
export type ScoreComponentKey = (typeof SCORE_COMPONENT_KEYS)[number];

export type ScoringWeights = Record<ScoreComponentKey, number>;

export interface ScoreFactor {
  label: string;
  value: string;
  /** Impacto en puntos sobre el componente (positivo o negativo). */
  impact?: number;
}

export interface ComponentEvaluation {
  score: number;
  explanation: string;
  factors: ScoreFactor[];
}

export interface ScoreComponentResult extends ComponentEvaluation {
  key: ScoreComponentKey;
  label: string;
  weight: number;
  contribution: number;
}

export interface RequiredDocumentInput {
  type: DocumentType;
  status: DocumentStatus;
  expiresAt: string | null;
}

export interface HistoricalRunInput {
  completedAt: Date;
  matchRatio: number | null;
  finalScore: number;
}

export type RegistryStatus = 'OK' | 'NOT_FOUND' | 'ERROR' | 'NOT_APPLICABLE';

export interface ScoringInput {
  now: Date;
  asset: {
    declaredQuantity: number;
    unit: QuantityUnit;
    mobility: Mobility;
    tenure: Tenure;
  };
  detection: {
    detectedQuantity: number | null;
    confidence: number | null;
    evidenceCount: number;
    averageQuality: number | null;
  };
  freshness: { newestEvidenceAt: Date | null; maxEvidenceAgeHours: number };
  documents: { requirements: string[]; documents: RequiredDocumentInput[] };
  history: { previous: HistoricalRunInput[] };
  location: { verified: boolean | null; distanceM: number | null };
  registry: { status: RegistryStatus; registeredQuantity: number | null };
  risk: {
    openAlerts: { severity: 'INFO' | 'WARNING' | 'CRITICAL' }[];
    activeDevices: number;
    expectedDevices: number;
    monitoringEnabled: boolean;
    /** null = el tipo de activo no admite seguro o no aplica. */
    insured: boolean | null;
  };
  anomalies: Anomaly[];
}

export interface ScoringOutput {
  modelVersion: string;
  finalScore: number;
  weightedScore: number;
  riskPenalty: number;
  matchRatio: number | null;
  confidence: number;
  outcome: VerificationOutcome;
  riskLevel: RiskLevel;
  weights: ScoringWeights;
  components: ScoreComponentResult[];
}

export interface ScoreComponent {
  readonly key: ScoreComponentKey;
  readonly label: string;
  evaluate(input: ScoringInput): ComponentEvaluation;
}
