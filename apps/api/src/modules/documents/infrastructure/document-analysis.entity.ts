import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import type {
  DocumentAnalysisStatus,
  ExtractedFields,
  ValidationResult,
} from '../domain/document-analysis.js';

/** Análisis de contenido de un documento (derivado y recalculable; no certifica autenticidad). */
@Entity('document_analyses')
export class DocumentAnalysisEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', unique: true })
  documentId: string;

  @Column({ type: 'varchar', length: 16 })
  status: DocumentAnalysisStatus;

  @Column({ type: 'varchar', length: 16, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  detectedType: string | null;

  @Column({ type: 'jsonb', default: {} })
  extractedFields: Partial<ExtractedFields>;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  extractionConfidence: number | null;

  @Column({ type: 'jsonb', default: [] })
  validationResults: ValidationResult[];

  @Column({ type: 'text', nullable: true })
  textExcerpt: string | null;

  @Column({ type: 'varchar', length: 48, nullable: true })
  engine: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  version: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  analyzedAt: Date | null;
}
