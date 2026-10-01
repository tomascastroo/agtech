import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';

@Entity('satellite_observations')
export class SatelliteObservationEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'uuid' })
  satelliteImageId: string;

  @Column({ type: 'uuid', nullable: true })
  evidenceId: string | null;

  @Column({ type: 'timestamptz' })
  observedAt: Date;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  ndviMean: number | null;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  ndviStd: number | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  vegetatedAreaHa: number | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  declaredAreaHa: number | null;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  coverageRatio: number | null;

  @Column({
    type: 'numeric',
    precision: 7,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  changeVsPreviousPct: number | null;

  @Column({ type: 'jsonb', default: {} })
  metrics: Record<string, unknown>;
}
