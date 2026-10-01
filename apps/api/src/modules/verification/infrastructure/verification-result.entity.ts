import { Column, Entity, JoinColumn, OneToOne, type Relation } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import type { ScoreComponentResult } from '../../scoring/domain/scoring.types.js';
import type { Anomaly, RiskLevel, VerificationOutcome } from '../domain/verification.types.js';
import { VerificationRunEntity } from './verification-run.entity.js';

@Entity('verification_results')
export class VerificationResultEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', unique: true })
  verificationRunId: string;

  @OneToOne(() => VerificationRunEntity, (run) => run.result)
  @JoinColumn({ name: 'verification_run_id' })
  run?: Relation<VerificationRunEntity>;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'varchar', length: 16 })
  outcome: VerificationOutcome;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  declaredQuantity: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  detectedQuantity: number | null;

  @Column({ type: 'varchar', length: 16 })
  unit: string;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  matchPercentage: number | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  difference: number | null;

  @Column({ type: 'smallint' })
  finalScore: number;

  @Column({ type: 'numeric', precision: 4, scale: 3, transformer: numericTransformer })
  confidence: number;

  @Column({ type: 'varchar', length: 8 })
  riskLevel: RiskLevel;

  @Column({ type: 'boolean', nullable: true })
  locationVerified: boolean | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 1,
    nullable: true,
    transformer: numericTransformer,
  })
  locationDistanceM: number | null;

  @Column({ type: 'varchar', length: 32 })
  scoringModelVersion: string;

  @Column({ type: 'jsonb' })
  scoreComponents: ScoreComponentResult[];

  @Column({ type: 'jsonb' })
  scoreWeights: Record<string, number>;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: numericTransformer })
  riskPenalty: number;

  @Column({ type: 'jsonb', default: [] })
  anomalies: Anomaly[];

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'uuid', nullable: true })
  aiModelVersionId: string | null;
}
