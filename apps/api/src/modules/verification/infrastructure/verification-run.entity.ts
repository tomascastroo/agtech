import { Column, Entity, JoinColumn, ManyToOne, OneToOne, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { AssetEntity } from '../../assets/infrastructure/asset.entity.js';
import type {
  VerificationInputSnapshot,
  VerificationStatus,
  VerificationTrigger,
} from '../domain/verification.types.js';
import { VerificationResultEntity } from './verification-result.entity.js';

@Entity('verification_runs')
export class VerificationRunEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @ManyToOne(() => AssetEntity)
  @JoinColumn({ name: 'asset_id' })
  asset?: Relation<AssetEntity>;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: VerificationStatus;

  @Column({ type: 'varchar', length: 16 })
  trigger: VerificationTrigger;

  @Column({ type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestedByProcess: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 32 })
  pipelineVersion: string;

  @Column({ type: 'jsonb', default: {} })
  inputSnapshot: VerificationInputSnapshot;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  queuedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @OneToOne(() => VerificationResultEntity, (result) => result.run)
  result?: Relation<VerificationResultEntity> | null;
}
