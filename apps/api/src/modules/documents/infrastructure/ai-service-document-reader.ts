import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import { ExternalServiceError } from '../../../common/domain/errors.js';
import type { TextAnalysis } from '../domain/document-analysis.js';

interface RemoteDocumentAnalysis {
  method: 'PDF_TEXT' | 'OCR';
  text_confidence: number;
  text_excerpt: string;
  detected_type: string;
  fields: {
    renspa: string[];
    cuit: string[];
    holder_names: string[];
    issued_at: string | null;
    expires_at: string | null;
    dates: string[];
  };
  engine: string;
  version: string;
}

export interface DocumentReading extends TextAnalysis {
  engine: string;
  version: string;
}

/** Lectura de documentos en el servicio de visión (capa de texto del PDF u OCR RapidOCR). */
@Injectable()
export class AiServiceDocumentReader {
  constructor(private readonly config: AppConfig) {}

  async read(bytes: Buffer, mimeType: string, fileName: string): Promise<DocumentReading> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), fileName);
    const headers: Record<string, string> = {};
    if (this.config.env.AI_SERVICE_TOKEN)
      headers['x-internal-token'] = this.config.env.AI_SERVICE_TOKEN;
    let response: Response;
    try {
      response = await fetch(new URL('/v1/documents/analyze', this.config.env.AI_SERVICE_URL), {
        method: 'POST',
        body: form,
        headers,
        signal: AbortSignal.timeout(Math.max(this.config.env.AI_SERVICE_TIMEOUT_MS, 60_000)),
      });
    } catch (error) {
      throw new ExternalServiceError(
        `El servicio de lectura de documentos no está disponible (${(error as Error).message})`,
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ExternalServiceError(
        `El servicio de lectura respondió ${response.status}: ${detail.slice(0, 200)}`,
      );
    }
    const r = (await response.json()) as RemoteDocumentAnalysis;
    return {
      method: r.method,
      textConfidence: r.text_confidence,
      textExcerpt: r.text_excerpt,
      detectedType: r.detected_type,
      fields: {
        renspa: r.fields.renspa,
        cuit: r.fields.cuit,
        holderNames: r.fields.holder_names,
        issuedAt: r.fields.issued_at,
        expiresAt: r.fields.expires_at,
        dates: r.fields.dates,
      },
      engine: r.engine,
      version: r.version,
    };
  }
}
