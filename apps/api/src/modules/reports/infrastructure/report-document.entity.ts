import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import type { ReportFormat } from '../domain/report.types.js';
import { ReportEntity } from './report.entity.js';

@Entity('report_documents')
export class ReportDocumentEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  reportId: string;

  @ManyToOne(() => ReportEntity, (report) => report.documents)
  @JoinColumn({ name: 'report_id' })
  report?: Relation<ReportEntity>;

  @Column({ type: 'varchar', length: 8 })
  format: ReportFormat;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 512, unique: true })
  storageKey: string;

  @Column({ type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  sizeBytes: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;
}
