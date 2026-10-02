import { Column, DeleteDateColumn, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import type { DocumentStatus, DocumentType } from '../domain/document.types.js';

@Entity('documents')
export class DocumentEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', nullable: true })
  establishmentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;

  @Column({ type: 'varchar', length: 32 })
  type: DocumentType;

  @Column({ type: 'varchar', length: 16, default: 'PENDING_REVIEW' })
  status: DocumentStatus;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  originalFileName: string;

  @Column({ type: 'varchar', length: 512, unique: true })
  storageKey: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  sizeBytes: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'date', nullable: true })
  issuedAt: string | null;

  @Column({ type: 'date', nullable: true })
  expiresAt: string | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** REAL o DEMO (documento de demostración, generado por "Simular solicitud"). */
  @Column({ type: 'varchar', length: 8, default: 'REAL' })
  dataSource: 'REAL' | 'DEMO';

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
