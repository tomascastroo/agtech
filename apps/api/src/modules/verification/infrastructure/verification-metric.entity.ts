import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';

@Entity('verification_metrics')
export class VerificationMetricEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  verificationRunId: string;

  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'numeric', precision: 14, scale: 4, transformer: numericTransformer })
  value: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  unit: string | null;

  @Column({ type: 'varchar', length: 48 })
  source: string;

  @Column({ type: 'jsonb', default: {} })
  details: Record<string, unknown>;
}
