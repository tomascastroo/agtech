import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EstablishmentsRepository } from '../../establishments/infrastructure/establishments.repository.js';
import { validateDocument } from '../domain/document-analysis.js';
import { DocumentAnalysisEntity } from '../infrastructure/document-analysis.entity.js';
import type { DocumentEntity } from '../infrastructure/document.entity.js';
import { AiServiceDocumentReader } from '../infrastructure/ai-service-document-reader.js';

/**
 * Análisis de documentos: lectura (capa de texto u OCR), clasificación, extracción de campos y
 * comparación contra lo declarado (RENSPA, CUIT y titular del establecimiento). Corre en segundo
 * plano tras la carga; si el servicio de lectura no responde queda FAILED y el documento sigue
 * su revisión manual normal. No afirma que el documento sea auténtico.
 */
@Injectable()
export class DocumentAnalysisService {
  private readonly logger = new Logger(DocumentAnalysisService.name);
  private readonly running = new Set<Promise<void>>();

  constructor(
    @InjectRepository(DocumentAnalysisEntity)
    private readonly analyses: Repository<DocumentAnalysisEntity>,
    private readonly establishments: EstablishmentsRepository,
    private readonly reader: AiServiceDocumentReader,
  ) {}

  /** Lanza el análisis sin bloquear la carga. */
  schedule(document: DocumentEntity, bytes: Buffer): void {
    const task: Promise<void> = this.analyze(document, bytes)
      .then(() => undefined)
      .catch((error: unknown) =>
        this.logger.warn(`Análisis del documento ${document.id} no registrado: ${String(error)}`),
      )
      .finally(() => this.running.delete(task));
    this.running.add(task);
  }

  /** Espera los análisis en curso (cierre ordenado y tests). */
  async drain(): Promise<void> {
    await Promise.all(this.running);
  }

  async analyze(document: DocumentEntity, bytes: Buffer): Promise<DocumentAnalysisEntity> {
    await this.analyses.upsert(
      {
        organizationId: document.organizationId,
        documentId: document.id,
        status: 'PENDING',
        error: null,
      },
      ['documentId'],
    );
    const establishment = document.establishmentId
      ? await this.establishments.findById(document.organizationId, document.establishmentId)
      : null;
    try {
      const reading = await this.reader.read(bytes, document.mimeType, document.originalFileName);
      const { status, results } = validateDocument(reading, {
        documentType: document.type,
        renspa: establishment?.renspa ?? null,
        holderName: establishment?.holderName ?? null,
        holderTaxId: establishment?.holderTaxId ?? null,
      });
      await this.analyses.update(
        { documentId: document.id },
        {
          status,
          method: reading.method,
          detectedType: reading.detectedType,
          extractedFields: reading.fields,
          extractionConfidence: Math.round(reading.textConfidence * 1000) / 1000,
          validationResults: results,
          textExcerpt: reading.textExcerpt.slice(0, 4000),
          engine: reading.engine,
          version: reading.version,
          analyzedAt: new Date(),
        },
      );
    } catch (error) {
      await this.analyses.update(
        { documentId: document.id },
        {
          status: 'FAILED',
          error: String((error as Error).message).slice(0, 500),
          analyzedAt: new Date(),
        },
      );
    }
    return this.analyses.findOneByOrFail({ documentId: document.id });
  }

  async forDocuments(documentIds: string[]): Promise<Map<string, DocumentAnalysisEntity>> {
    if (documentIds.length === 0) return new Map();
    const rows = await this.analyses.findBy({ documentId: In(documentIds) });
    return new Map(rows.map((r) => [r.documentId, r]));
  }
}

/** Resumen para la UI: sin texto completo, con aviso explícito de alcance. */
export function presentAnalysis(a: DocumentAnalysisEntity | undefined) {
  if (!a) return null;
  return {
    status: a.status,
    method: a.method,
    detectedType: a.detectedType,
    extractedFields: a.extractedFields,
    extractionConfidence: a.extractionConfidence,
    validationResults: a.validationResults,
    engine: a.engine,
    version: a.version,
    error: a.error,
    analyzedAt: a.analyzedAt,
    disclaimer:
      'Lectura automática del contenido comparada con lo declarado. No certifica la autenticidad del documento.',
  };
}
