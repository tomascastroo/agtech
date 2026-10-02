import type { AlertEntity } from '../../../alerts/infrastructure/alert.entity.js';
import type { AssetTypeEntity } from '../../../assets/infrastructure/asset-type.entity.js';
import type { AssetEntity } from '../../../assets/infrastructure/asset.entity.js';
import type { DeviceInstallationEntity } from '../../../devices/infrastructure/device-installation.entity.js';
import type { DocumentEntity } from '../../../documents/infrastructure/document.entity.js';
import type { EstablishmentEntity } from '../../../establishments/infrastructure/establishment.entity.js';
import type { EvidenceEntity } from '../../../evidence/infrastructure/evidence.entity.js';
import type { Anomaly, EvidenceRole } from '../../domain/verification.types.js';
import type { HistoricalResultRow } from '../../infrastructure/verification.repository.js';
import type { VerificationEvidenceEntity } from '../../infrastructure/verification-evidence.entity.js';
import type { VerificationRunEntity } from '../../infrastructure/verification-run.entity.js';

export interface PipelineContext {
  now: Date;
  run: VerificationRunEntity;
  asset: AssetEntity;
  assetType: AssetTypeEntity;
  establishment: EstablishmentEntity;
  /** Metadata vigente del activo según el esquema de su tipo (p. ej. fecha de siembra). */
  metadata: Record<string, unknown>;
  documents: DocumentEntity[];
  monitoring: { enabled: boolean; maxEvidenceAgeHours: number; intervalHours: number } | null;
  history: HistoricalResultRow[];
  openAlerts: AlertEntity[];
  cameraInstallations: DeviceInstallationEntity[];
  requestId?: string;
}

export interface AcquiredEvidence {
  evidence: EvidenceEntity;
  role: EvidenceRole;
  detectedCount?: number | null;
  confidence?: number | null;
  analysis?: Record<string, unknown>;
  aiModelVersionId?: string | null;
}

export interface MetricInput {
  key: string;
  value: number;
  unit?: string | null;
  source: string;
  details?: Record<string, unknown>;
}

export interface StrategyOutcome {
  detectedQuantity: number | null;
  confidence: number | null;
  averageQuality: number | null;
  primaryEvidenceCount: number;
  newestEvidenceAt: Date | null;
  aiModelVersionId: string | null;
  expectedDevices: number;
  activeDevices: number;
  vegetationChangePct: number | null;
  /**
   * CENSUS: el conteo es comparable con lo declarado (paso controlado, área completa).
   * LOWER_BOUND: cota inferior (fotos o barrido de una parte del rodeo): si es menor a lo
   * declarado no prueba faltante, solo cobertura parcial. Por defecto CENSUS.
   */
  countBasis?: 'CENSUS' | 'LOWER_BOUND';
  metrics: MetricInput[];
  anomalies: Anomaly[];
}

/**
 * Estrategia de verificación por tipo de activo. Cada tipo declara su estrategia en
 * asset_types.verification_strategy; agregar una nueva no modifica el pipeline.
 */
export interface VerificationStrategy {
  readonly code: string;
  acquire(ctx: PipelineContext): Promise<AcquiredEvidence[]>;
  analyze(ctx: PipelineContext, links: VerificationEvidenceEntity[]): Promise<StrategyOutcome>;
}

export const isAnalyzed = (link: VerificationEvidenceEntity): boolean =>
  typeof link.analysis === 'object' && link.analysis !== null && 'analyzedAt' in link.analysis;
