import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import type { AlertConditionType, AlertSeverity } from '../domain/alert.types.js';

@Entity('alert_rules')
export class AlertRuleEntity extends TimestampedEntity {
  /** null = regla por defecto del sistema, aplicable a todas las organizaciones. */
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'varchar', length: 8 })
  severity: AlertSeverity;

  @Column({ type: 'varchar', length: 48 })
  conditionType: AlertConditionType;

  @Column({ type: 'jsonb', default: {} })
  parameters: Record<string, number>;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  assetTypeCodes: string[];

  @Column({ type: 'boolean', default: true })
  enabled: boolean;
}
