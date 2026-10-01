import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { numericTransformer } from '../../../database/transformers.js';
import { EvidenceEntity } from '../../evidence/infrastructure/evidence.entity.js';
import type { EvidenceRole } from '../domain/verification.types.js';

/** Qué evidencia se usó en cada verificación y qué produjo su análisis. */
@Entity('verification_evidence')
export class VerificationEvidenceEntity {
  @PrimaryColumn({ type: 'uuid' })
  verificationRunId: string;

  @PrimaryColumn({ type: 'uuid' })
  evidenceId: string;

  @ManyToOne(() => EvidenceEntity)
  @JoinColumn({ name: 'evidence_id' })
  evidence?: Relation<EvidenceEntity>;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 16 })
  role: EvidenceRole;

  @Column({ type: 'integer', nullable: true })
  detectedCount: number | null;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  confidence: number | null;

  @Column({ type: 'jsonb', default: {} })
  analysis: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  exclusionReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  aiModelVersionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
