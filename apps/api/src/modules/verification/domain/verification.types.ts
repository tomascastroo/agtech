export type VerificationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type VerificationTrigger = 'MANUAL' | 'SCHEDULED' | 'API';
export type VerificationOutcome = 'VERIFIED' | 'OBSERVED' | 'REJECTED' | 'INCONCLUSIVE';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type EvidenceRole = 'PRIMARY' | 'SUPPORTING' | 'EXCLUDED';
export type AnomalySeverity = 'INFO' | 'WARNING' | 'CRITICAL';

/** Versión del pipeline de verificación: se registra en cada ejecución para reproducibilidad. */
export const PIPELINE_VERSION = 'verification-pipeline/1.0.0';

export interface Anomaly {
  code: string;
  severity: AnomalySeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface VerificationInputSnapshot {
  declaredQuantity: number;
  unit: string;
  assetTypeCode: string;
  verificationStrategy: string;
  metadataVersion: number | null;
  establishment: { id: string; name: string; renspa: string | null; tenure: string };
  requestedEvidenceIds: string[];
  maxEvidenceAgeHours: number;
  note?: string;
}

/** Etapas del pipeline, en orden. Se publican como progreso del job mientras se procesa. */
export const PIPELINE_STEPS = [
  'EVIDENCE',
  'METRICS',
  'CROSS_CHECKS',
  'SCORING',
  'ALERTS',
  'REPORT',
] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export interface PipelineProgress {
  step: PipelineStep;
  index: number;
  total: number;
}

export function isPipelineProgress(value: unknown): value is PipelineProgress {
  return (
    typeof value === 'object' &&
    value !== null &&
    PIPELINE_STEPS.includes((value as PipelineProgress).step) &&
    typeof (value as PipelineProgress).index === 'number'
  );
}
