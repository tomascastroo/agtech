import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';

@Entity('monitoring_configurations')
export class MonitoringConfigurationEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', unique: true })
  assetId: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 24 })
  intervalHours: number;

  @Column({ type: 'integer', default: 72 })
  maxEvidenceAgeHours: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextRunAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;
}
