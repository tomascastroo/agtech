import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { sha256Hex } from '../../../common/crypto/hashing.js';
import { NotFoundError, ValidationFailedError } from '../../../common/domain/errors.js';
import { DOCUMENT_UPLOAD_POLICY, sanitizeFileName } from '../../../common/files/file-signature.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import { EstablishmentsRepository } from '../../establishments/infrastructure/establishments.repository.js';
import { MonitoringEventsService } from '../../monitoring/application/monitoring-events.service.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { storageKeys } from '../../storage/storage-keys.js';
import { requirementAlternatives, type DocumentType } from '../domain/document.types.js';
import type { DocumentEntity } from '../infrastructure/document.entity.js';
import { DocumentsRepository } from '../infrastructure/documents.repository.js';
import { DocumentAnalysisService, presentAnalysis } from './document-analysis.service.js';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadDocumentCommand {
  type: DocumentType;
  title?: string;
  issuedAt?: string;
  expiresAt?: string;
  /** DEMO: documento de demostración generado por "Simular solicitud". */
  dataSource?: 'REAL' | 'DEMO';
}

const TYPE_TITLES: Record<DocumentType, string> = {
  RENSPA: 'Constancia RENSPA (SENASA)',
  PROPERTY_DEED: 'Escritura del inmueble',
  LEASE_CONTRACT: 'Contrato de arrendamiento',
  ID_CUIT: 'DNI / Constancia de CUIT del titular',
  SANITARY_CERTIFICATE: 'Certificado sanitario',
  INSURANCE_POLICY: 'Póliza de seguro',
  MIPYME_CERTIFICATE: 'Certificado MiPyME',
  STOCK_CERTIFICATE: 'Informe de existencias (SENASA)',
  BRAND_TITLE: 'Boleto de marca y señal',
  FEEDLOT_REGISTRATION: 'Inscripción engorde a corral',
  FINANCIAL_STATEMENTS: 'Información financiera',
  DTE: 'DT-e (Documento de Tránsito electrónico)',
  TRAZA_REPORT: 'Constancia TRAZA',
  PLEDGE_CONTRACT: 'Contrato de prenda / warrant',
  LIEN_REPORT: 'Informe de gravámenes',
  IMMOBILIZATION_CERTIFICATE: 'Constancia de inmovilización (SENASA)',
  OTHER: 'Documentación adicional',
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documents: DocumentsRepository,
    private readonly assets: AssetsRepository,
    private readonly establishments: EstablishmentsRepository,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
    private readonly events: MonitoringEventsService,
    private readonly analysis: DocumentAnalysisService,
  ) {}

  async listForAsset(organizationId: string, assetId: string) {
    const asset = await this.assets.findById(organizationId, assetId);
    if (!asset?.assetType) throw new NotFoundError('Activo', assetId);
    const documents = await this.documents.forAsset(
      organizationId,
      asset.id,
      asset.establishmentId,
    );
    const requirements = asset.assetType.requiredDocuments.map((requirement) => {
      const alternatives = requirementAlternatives(requirement);
      const match = documents.find((d) => alternatives.includes(d.type) && d.status !== 'REJECTED');
      return {
        requirement,
        alternatives,
        satisfied: Boolean(match),
        documentId: match?.id ?? null,
        status: match?.status ?? null,
      };
    });
    const analyses = await this.analysis.forDocuments(documents.map((d) => d.id));
    return { documents, requirements, analyses };
  }

  async uploadForAsset(
    user: AuthenticatedUser,
    assetId: string,
    file: UploadedFile | undefined,
    command: UploadDocumentCommand,
    context: RequestContext,
  ): Promise<DocumentEntity> {
    const asset = await this.assets.findById(user.organizationId, assetId);
    if (!asset) throw new NotFoundError('Activo', assetId);
    const document = await this.store(
      user,
      { assetId: asset.id, establishmentId: asset.establishmentId },
      file,
      command,
      context,
    );
    await this.events.record({
      organizationId: user.organizationId,
      assetId: asset.id,
      type: 'EVIDENCE_UPLOADED',
      message: `Documento cargado: ${document.title}`,
      payload: { documentId: document.id, type: document.type },
    });
    return document;
  }

  async uploadForEstablishment(
    user: AuthenticatedUser,
    establishmentId: string,
    file: UploadedFile | undefined,
    command: UploadDocumentCommand,
    context: RequestContext,
  ): Promise<DocumentEntity> {
    const establishment = await this.establishments.findById(user.organizationId, establishmentId);
    if (!establishment) throw new NotFoundError('Establecimiento', establishmentId);
    return this.store(
      user,
      { assetId: null, establishmentId: establishment.id },
      file,
      command,
      context,
    );
  }

  /** URL firmada de corta vida. `inline` la sirve para mostrar en el visor (no como descarga). */
  async downloadUrl(
    user: AuthenticatedUser,
    id: string,
    context: RequestContext,
    options: { inline?: boolean } = {},
  ) {
    const document = await this.documents.findById(user.organizationId, id);
    if (!document) throw new NotFoundError('Documento', id);
    return this.signedUrl(user, document, context, options.inline ?? false);
  }

  /**
   * Visor para el productor: solo documentos de SU solicitud (del activo declarado o del
   * establecimiento). Cualquier otro documento responde como inexistente.
   */
  async viewUrlForRequest(
    user: AuthenticatedUser,
    scope: { organizationId: string; assetId: string | null; establishmentId: string | null },
    id: string,
    context: RequestContext,
  ) {
    const document = await this.documents.findById(scope.organizationId, id);
    const belongs =
      document !== null &&
      ((scope.assetId !== null && document.assetId === scope.assetId) ||
        (scope.establishmentId !== null &&
          document.assetId === null &&
          document.establishmentId === scope.establishmentId));
    if (!document || !belongs) throw new NotFoundError('Documento', id);
    return this.signedUrl(user, document, context, true);
  }

  private async signedUrl(
    user: AuthenticatedUser,
    document: DocumentEntity,
    context: RequestContext,
    inline: boolean,
  ) {
    const url = await this.storage.signedDownloadUrl(document.storageKey, {
      downloadFileName: document.originalFileName,
      inline: inline || document.mimeType === 'application/pdf',
    });
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.DOCUMENT_DOWNLOADED,
      resourceType: 'document',
      resourceId: document.id,
      context,
    });
    return { url, mimeType: document.mimeType, fileName: document.originalFileName };
  }

  /** Vuelve a leer el documento (OCR + reglas) y lo compara con los datos declarados actuales. */
  async reanalyze(user: AuthenticatedUser, id: string, context: RequestContext) {
    const document = await this.documents.findById(user.organizationId, id);
    if (!document) throw new NotFoundError('Documento', id);
    const bytes = await this.storage.getObject(document.storageKey);
    const analysis = await this.analysis.analyze(document, bytes);
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.DOCUMENT_ANALYZED,
      resourceType: 'document',
      resourceId: document.id,
      metadata: { status: analysis.status, version: analysis.version },
      context,
    });
    return presentAnalysis(analysis);
  }

  async review(
    user: AuthenticatedUser,
    id: string,
    status: 'VALID' | 'REJECTED',
    context: RequestContext,
  ): Promise<DocumentEntity> {
    const document = await this.documents.findById(user.organizationId, id);
    if (!document) throw new NotFoundError('Documento', id);
    await this.documents.updateReview(id, {
      status,
      reviewedBy: user.userId,
      reviewedAt: new Date(),
    });
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.DOCUMENT_REVIEWED,
      resourceType: 'document',
      resourceId: id,
      metadata: { from: document.status, to: status },
      context,
    });
    return Object.assign(document, { status, reviewedBy: user.userId, reviewedAt: new Date() });
  }

  private async store(
    user: AuthenticatedUser,
    target: { assetId: string | null; establishmentId: string },
    file: UploadedFile | undefined,
    command: UploadDocumentCommand,
    context: RequestContext,
  ): Promise<DocumentEntity> {
    if (!file) throw new ValidationFailedError('Debe adjuntar un archivo');
    const check = DOCUMENT_UPLOAD_POLICY.validate(file);
    if (!check.ok) throw new ValidationFailedError(check.reason);
    if (command.issuedAt && command.expiresAt && command.expiresAt < command.issuedAt) {
      throw new ValidationFailedError('La fecha de vencimiento es anterior a la de emisión');
    }

    const extension = check.kind.extensions[0]!;
    const key = storageKeys.document(user.organizationId, extension);
    const sha256 = sha256Hex(file.buffer);
    await this.storage.putObject({
      key,
      body: file.buffer,
      contentType: check.kind.mime,
      metadata: { sha256 },
    });
    const document = await this.documents.save({
      organizationId: user.organizationId,
      assetId: target.assetId,
      establishmentId: target.establishmentId,
      type: command.type,
      status: 'PENDING_REVIEW',
      title: command.title?.trim() || TYPE_TITLES[command.type],
      originalFileName: sanitizeFileName(file.originalname),
      storageKey: key,
      mimeType: check.kind.mime,
      sizeBytes: file.size,
      sha256,
      issuedAt: command.issuedAt ?? null,
      expiresAt: command.expiresAt ?? null,
      uploadedBy: user.userId,
      dataSource: command.dataSource ?? 'REAL',
    });
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.USER_UPLOADED_DOCUMENT,
      resourceType: 'document',
      resourceId: document.id,
      metadata: { type: document.type, sha256, sizeBytes: file.size, assetId: target.assetId },
      context,
    });
    this.analysis.schedule(document, file.buffer);
    return document;
  }
}
