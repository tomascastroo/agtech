import { Column, Entity, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { AssetEntity } from '../../assets/infrastructure/asset.entity.js';
import type { ReportStatus } from '../domain/report.types.js';
import { ReportDocumentEntity } from './report-document.entity.js';

@Entity('reports')
export class ReportEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @ManyToOne(() => AssetEntity)
  @JoinColumn({ name: 'asset_id' })
  asset?: Relation<AssetEntity>;

  @Column({ type: 'uuid' })
  verificationRunId: string;

  @Column({ type: 'varchar', length: 32, default: 'GUARANTEE_VERIFICATION' })
  type: 'GUARANTEE_VERIFICATION';

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: ReportStatus;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  generatedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @OneToMany(() => ReportDocumentEntity, (doc) => doc.report)
  documents?: Relation<ReportDocumentEntity[]>;
}
