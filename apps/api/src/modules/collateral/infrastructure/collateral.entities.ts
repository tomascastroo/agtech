import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity, TimestampedEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import type { GeoPoint } from '../../../common/geo/geojson.js';
import type {
  CollateralRiskLevel,
  CollateralState,
  ImmobilizationStatus,
  InspectionResult,
  LegalInstrument,
  LegalStatus,
  MovementDirection,
  MovementKind,
  MovementSourceLevel,
  MovementVerificationState,
  ProductionType,
} from '../domain/collateral.types.js';

const numeric = (precision: number, scale: number) => ({
  type: 'numeric' as const,
  precision,
  scale,
  nullable: true,
  transformer: numericTransformer,
});

/** Garantía bovina: datos legales informados por la entidad + estado calculado por el motor. */
@Entity('bovine_guarantees')
export class BovineGuaranteeEntity extends TimestampedEntity {
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'varchar', length: 16, insert: false, update: false }) code: string;
  @Column({ type: 'uuid', nullable: true }) guaranteeRequestId: string | null;
  @Column({ type: 'uuid', nullable: true }) assetId: string | null;
  @Column({ type: 'uuid', nullable: true }) establishmentId: string | null;
  @Column({ type: 'varchar', length: 160 }) producerName: string;
  @Column({ type: 'varchar', length: 13 }) producerTaxId: string;
  @Column({ type: 'varchar', length: 16 }) productionType: ProductionType;
  @Column({ type: 'varchar', length: 24 }) state: CollateralState;
  @Column({ type: 'varchar', length: 400, nullable: true }) stateReason: string | null;
  @Column({ type: 'varchar', length: 16 }) legalInstrument: LegalInstrument;
  @Column({ type: 'varchar', length: 80, nullable: true }) legalIdentifier: string | null;
  @Column({ type: 'varchar', length: 16 }) legalStatus: LegalStatus;
  @Column({ type: 'smallint', nullable: true }) lienPriority: number | null;
  @Column({ type: 'varchar', length: 16 }) immobilizationStatus: ImmobilizationStatus;
  @Column({ type: 'varchar', length: 80, nullable: true }) immobilizationReference: string | null;
  @Column(numeric(18, 2)) amount: number | null;
  @Column(numeric(18, 2)) debtAmount: number | null;
  @Column({ type: 'char', length: 3 }) currency: 'USD' | 'ARS';
  @Column({ type: 'date', nullable: true }) grantedAt: string | null;
  @Column({ type: 'date', nullable: true }) expiresAt: string | null;
  @Column(numeric(8, 2)) averageWeightKg: number | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) weightSource: string | null;
  @Column(numeric(14, 4)) pricePerKg: number | null;
  @Column({ type: 'char', length: 3, nullable: true }) priceCurrency: 'USD' | 'ARS' | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) priceSource: string | null;
  @Column({ type: 'date', nullable: true }) priceDate: string | null;
  @Column(numeric(4, 3)) qualityFactor: number | null;
  @Column({ type: 'integer', nullable: true }) currentDeclarationVersion: number | null;
  @Column({ type: 'smallint', nullable: true }) score: number | null;
  @Column({ type: 'varchar', length: 8, nullable: true }) riskLevel: CollateralRiskLevel | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) coverageStatus: string | null;
  @Column(numeric(10, 2)) coverageRatio: number | null;
  @Column(numeric(18, 2)) verifiableValue: number | null;
  @Column({ type: 'integer', nullable: true }) verifiableHeads: number | null;
  @Column({ type: 'integer', nullable: true }) expectedHeads: number | null;
  @Column({ type: 'timestamptz', nullable: true }) lastEvidenceAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) lastVerificationAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) nextVerificationAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) lastSnapshotId: string | null;
  @Column({ type: 'varchar', length: 8 }) dataSource: 'REAL' | 'DEMO';
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) finalizedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) finalizedBy: string | null;
}

export interface DeclaredCategory {
  category: string;
  heads: number;
}

/** Declaración del productor. INMUTABLE (trigger): una corrección es una versión nueva. */
@Entity('collateral_declarations')
export class CollateralDeclarationEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'uuid' }) guaranteeId: string;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'integer' }) heads: number;
  @Column({ type: 'jsonb' }) categories: DeclaredCategory[];
  @Column({ type: 'varchar', length: 16 }) productionType: ProductionType;
  @Column({ type: 'jsonb' }) establishment: Record<string, unknown>;
  @Column({ type: 'varchar', length: 16 }) source: 'PRODUCTOR' | 'ENTIDAD' | 'MIGRACION';
  @Column({ type: 'uuid', nullable: true }) declaredBy: string | null;
  @Column({ type: 'varchar', length: 160 }) declaredByLabel: string;
  @Column({ type: 'timestamptz' }) declaredAt: Date;
  @Column({ type: 'varchar', length: 500, nullable: true }) reason: string | null;
  @Column({ type: 'uuid', nullable: true }) supersedesId: string | null;
}

@Entity('collateral_movements')
export class CollateralMovementEntity extends TimestampedEntity {
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'uuid' }) guaranteeId: string;
  @Column({ type: 'varchar', length: 8 }) direction: MovementDirection;
  @Column({ type: 'varchar', length: 16 }) kind: MovementKind;
  @Column({ type: 'integer' }) heads: number;
  @Column({ type: 'varchar', length: 40, nullable: true }) category: string | null;
  @Column({ type: 'jsonb' }) animalRefs: string[];
  @Column({ type: 'varchar', length: 160, nullable: true }) origin: string | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) destination: string | null;
  @Column({ type: 'timestamptz' }) occurredAt: Date;
  @Column({ type: 'varchar', length: 12 }) sourceLevel: MovementSourceLevel;
  @Column({ type: 'varchar', length: 160 }) sourceLabel: string;
  @Column({ type: 'uuid', nullable: true }) documentId: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) dteNumber: string | null;
  @Column({ type: 'varchar', length: 12 }) verificationState: MovementVerificationState;
  @Column({ type: 'varchar', length: 500, nullable: true }) notes: string | null;
  @Column({ type: 'uuid', nullable: true }) recordedBy: string | null;
}

/** Evaluación del motor (inmutable). */
@Entity('collateral_score_snapshots')
export class CollateralScoreSnapshotEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'uuid' }) guaranteeId: string;
  @Column({ type: 'varchar', length: 16 }) trigger: string;
  @Column({ type: 'varchar', length: 24 }) state: CollateralState;
  @Column({ type: 'varchar', length: 400 }) stateReason: string;
  @Column({ type: 'smallint', nullable: true }) score: number | null;
  @Column({ type: 'smallint', nullable: true }) weightedScore: number | null;
  @Column({ type: 'varchar', length: 8 }) riskLevel: CollateralRiskLevel;
  @Column({ type: 'smallint' }) riskPoints: number;
  @Column({ type: 'varchar', length: 16 }) coverageStatus: string;
  @Column(numeric(10, 2)) coverageRatio: number | null;
  @Column({ type: 'integer', nullable: true }) expectedHeads: number | null;
  @Column({ type: 'integer', nullable: true }) observedHeads: number | null;
  @Column({ type: 'integer', nullable: true }) verifiableHeads: number | null;
  @Column({ type: 'jsonb' }) components: unknown;
  @Column({ type: 'jsonb' }) gates: unknown;
  @Column({ type: 'jsonb' }) riskFactors: unknown;
  @Column({ type: 'jsonb' }) coverage: unknown;
  @Column({ type: 'jsonb' }) reconciliation: unknown;
  @Column({ type: 'jsonb' }) schedule: unknown;
  @Column({ type: 'jsonb' }) inputs: unknown;
  @Column({ type: 'varchar', length: 40 }) engineVersion: string;
  @Column({ type: 'timestamptz' }) evaluatedAt: Date;
}

@Entity('collateral_verifications')
export class CollateralVerificationEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'uuid' }) guaranteeId: string;
  @Column({ type: 'timestamptz' }) verifiedAt: Date;
  @Column({ type: 'varchar', length: 16 }) method: string;
  @Column({ type: 'uuid', nullable: true }) verificationRunId: string | null;
  @Column({ type: 'uuid', nullable: true }) inspectionId: string | null;
  @Column({ type: 'integer', nullable: true }) declaredHeads: number | null;
  @Column({ type: 'integer', nullable: true }) expectedHeads: number | null;
  @Column({ type: 'integer', nullable: true }) observedHeads: number | null;
  @Column({ type: 'integer', nullable: true }) verifiedHeads: number | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) countBasis: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) quality: string | null;
  @Column({ type: 'jsonb' }) qualityReasons: string[];
  @Column({ type: 'varchar', length: 20, nullable: true }) captureOrigin: string | null;
  @Column({ type: 'varchar', length: 24 }) resultState: CollateralState;
  @Column({ type: 'smallint', nullable: true }) score: number | null;
  @Column({ type: 'varchar', length: 8, nullable: true }) riskLevel: string | null;
  @Column({ type: 'uuid', array: true }) evidenceIds: string[];
  @Column({ type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'varchar', length: 160 }) actorLabel: string;
  @Column({ type: 'text' }) explanation: string;
  @Column({ type: 'uuid', nullable: true }) snapshotId: string | null;
}

export type EventSource =
  | 'SISTEMA'
  | 'ENTIDAD'
  | 'PRODUCTOR'
  | 'INSPECTOR'
  | 'DOCUMENTO'
  | 'FUENTE_OFICIAL';

/** Historial de la garantía (inmutable). */
@Entity('collateral_events')
export class CollateralEventEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'uuid' }) guaranteeId: string;
  @Column({ type: 'varchar', length: 40 }) type: string;
  @Column({ type: 'timestamptz' }) occurredAt: Date;
  @Column({ type: 'varchar', length: 16 }) source: EventSource;
  @Column({ type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'varchar', length: 160 }) actorLabel: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) method: string | null;
  @Column({ type: 'jsonb' }) evidence: unknown[];
  @Column({ type: 'varchar', length: 80, nullable: true }) result: string | null;
  @Column({ type: 'varchar', length: 24, nullable: true }) previousState: string | null;
  @Column({ type: 'varchar', length: 24, nullable: true }) newState: string | null;
  @Column({ type: 'varchar', length: 600 }) summary: string;
  @Column({ type: 'jsonb' }) payload: Record<string, unknown>;
}

export interface Discrepancy {
  topic: string;
  description: string;
}

@Entity('collateral_inspections')
export class CollateralInspectionEntity extends TimestampedEntity {
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'uuid' }) guaranteeId: string;
  @Column({ type: 'varchar', length: 12 }) status: 'SOLICITADA' | 'REALIZADA' | 'CANCELADA';
  @Column({ type: 'varchar', length: 500, nullable: true }) reason: string | null;
  @Column({ type: 'uuid', nullable: true }) requestedBy: string | null;
  @Column({ type: 'timestamptz' }) requestedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) dueAt: Date | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) inspectorName: string | null;
  @Column({ type: 'uuid', nullable: true }) inspectorUserId: string | null;
  @Column({ type: 'timestamptz', nullable: true }) performedAt: Date | null;
  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: GeoPoint | null;
  @Column({ type: 'integer', nullable: true }) observedHeads: number | null;
  @Column({ type: 'boolean', nullable: true }) fullCount: boolean | null;
  @Column({ type: 'integer', nullable: true }) rfidRead: number | null;
  @Column({ type: 'uuid', array: true }) evidenceIds: string[];
  @Column({ type: 'text', nullable: true }) observations: string | null;
  @Column({ type: 'jsonb' }) discrepancies: Discrepancy[];
  @Column({ type: 'varchar', length: 20, nullable: true }) result: InspectionResult | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) signatureName: string | null;
  @Column({ type: 'char', length: 64, nullable: true }) signatureHash: string | null;
  @Column({ type: 'timestamptz', nullable: true }) signedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) recordedBy: string | null;
}

@Entity('collateral_monitoring_policies')
export class CollateralMonitoringPolicyEntity extends TimestampedEntity {
  @Column({ type: 'uuid', nullable: true }) organizationId: string | null;
  @Column({ type: 'varchar', length: 16 }) productionType: ProductionType;
  @Column({ type: 'varchar', length: 8 }) riskLevel: CollateralRiskLevel;
  @Column({ type: 'integer' }) frequencyDays: number;
  @Column({ type: 'integer' }) maxEvidenceAgeDays: number;
  @Column({ type: 'varchar', length: 16 }) recommendedMethod: string;
  @Column({ type: 'boolean' }) requiresInspection: boolean;
  @Column({ type: 'uuid', nullable: true }) updatedBy: string | null;
}

@Entity('monitoring_schedules')
export class MonitoringScheduleEntity extends TimestampedEntity {
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'uuid' }) guaranteeId: string;
  @Column({ type: 'varchar', length: 8 }) riskLevel: CollateralRiskLevel;
  @Column({ type: 'integer' }) frequencyDays: number;
  @Column({ type: 'integer' }) maxEvidenceAgeDays: number;
  @Column({ type: 'varchar', length: 16 }) recommendedMethod: string;
  @Column({ type: 'boolean' }) requiresInspection: boolean;
  @Column({ type: 'timestamptz', nullable: true }) lastVerificationAt: Date | null;
  @Column({ type: 'timestamptz' }) nextVerificationAt: Date;
  @Column({ type: 'varchar', length: 400 }) explanation: string;
}

export const COLLATERAL_ENTITIES = [
  BovineGuaranteeEntity,
  CollateralDeclarationEntity,
  CollateralMovementEntity,
  CollateralScoreSnapshotEntity,
  CollateralVerificationEntity,
  CollateralEventEntity,
  CollateralInspectionEntity,
  CollateralMonitoringPolicyEntity,
  MonitoringScheduleEntity,
];
