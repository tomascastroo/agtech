import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import type { Currency, GuaranteeStatus } from '../domain/asset.types.js';

@Entity('guarantees')
export class GuaranteeEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'uuid' })
  verificationRunId: string;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: GuaranteeStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  coveredQuantity: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  valuation: number | null;

  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: Currency;

  @Column({ type: 'uuid' })
  confirmedBy: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  confirmedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  releasedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
