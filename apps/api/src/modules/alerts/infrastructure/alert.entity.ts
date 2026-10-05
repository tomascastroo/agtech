import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { AssetEntity } from '../../assets/infrastructure/asset.entity.js';
import type { AlertSeverity, AlertStatus } from '../domain/alert.types.js';

@Entity('alerts')
export class AlertEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @ManyToOne(() => AssetEntity)
  @JoinColumn({ name: 'asset_id' })
  asset?: Relation<AssetEntity>;

  @Column({ type: 'uuid', nullable: true })
  verificationRunId: string | null;

  @Column({ type: 'uuid', nullable: true })
  ruleId: string | null;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'varchar', length: 8 })
  severity: AlertSeverity;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status: AlertStatus;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', default: {} })
  context: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  acknowledgedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string | null;

  /** Garantía bovina a la que pertenece la alerta (null: alerta del activo). */
  @Column({ type: 'uuid', nullable: true })
  bovineGuaranteeId: string | null;

  /** Responsable asignado. */
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  recommendedAction: string | null;

  @Column({ type: 'uuid', nullable: true })
  dismissedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  dismissedAt: Date | null;
}
