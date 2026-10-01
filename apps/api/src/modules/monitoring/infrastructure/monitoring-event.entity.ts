import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import type { EventSeverity, MonitoringEventType } from '../domain/monitoring.types.js';

@Entity('monitoring_events')
export class MonitoringEventEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'uuid', nullable: true })
  verificationRunId: string | null;

  @Column({ type: 'varchar', length: 48 })
  type: MonitoringEventType;

  @Column({ type: 'varchar', length: 8, default: 'INFO' })
  severity: EventSeverity;

  @Column({ type: 'varchar', length: 255 })
  message: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;
}
