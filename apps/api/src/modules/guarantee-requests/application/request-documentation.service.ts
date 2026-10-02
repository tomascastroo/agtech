import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { NotFoundError, ValidationFailedError } from '../../../common/domain/errors.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { DocumentAnalysisService } from '../../documents/application/document-analysis.service.js';
import {
  creditProduct,
  evaluateRequirement,
  OBLIGATION_LABELS,
  REQUIREMENT_CATALOG,
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_STATUS_LABELS,
  type RequirementCode,
  type RequirementStatus,
} from '../../documents/domain/document-requirements.js';
import { DOCUMENT_TYPE_NAMES } from '../../documents/domain/document.types.js';
import { DocumentsRepository } from '../../documents/infrastructure/documents.repository.js';
import { OfficialDataProvider } from '../../external-data/domain/official-data.provider.js';
import type { GuaranteeRequestEntity } from '../infrastructure/guarantee-request.entity.js';
import { GuaranteeRequestRequirementEntity } from '../infrastructure/guarantee-request-requirement.entity.js';
import { InformationRequestEntity } from '../infrastructure/information-request.entity.js';

/** Producto por defecto para cada tipo de garantía (si la entidad no elige otro). */
export const DEFAULT_PRODUCT_BY_ASSET_TYPE: Record<string, string> = {
  BOVINOS: 'LIVESTOCK_GUARANTEE_BASE',
};

/**
 * Checklist documental de una solicitud y capas de datos (declarado → extraído → verificado
 * internamente → verificado por fuente oficial). El estado de cada requisito se calcula de los
 * documentos cargados y su análisis; no se guarda (no puede quedar desactualizado).
 */
@Injectable()
export class RequestDocumentationService {
  constructor(
    @InjectRepository(GuaranteeRequestRequirementEntity)
    private readonly requirements: Repository<GuaranteeRequestRequirementEntity>,
    @InjectRepository(InformationRequestEntity)
    private readonly infoRequests: Repository<InformationRequestEntity>,
    private readonly documents: DocumentsRepository,
    private readonly analyses: DocumentAnalysisService,
    private readonly official: OfficialDataProvider,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Copia los requisitos del producto a la solicitud (al crearla). */
  async initialize(
    manager: EntityManager,
    request: GuaranteeRequestEntity,
    productCode: string,
    notApplicable: string[] = [],
  ): Promise<void> {
    const product = creditProduct(productCode);
    if (!product) throw new ValidationFailedError('Producto de crédito inexistente');
    if (!product.assetTypeCodes.includes(request.assetTypeCode))
      throw new ValidationFailedError('El producto no corresponde al tipo de garantía');
    const unknown = notApplicable.filter((c) => !product.requirements.some((r) => r.code === c));
    if (unknown.length) throw new ValidationFailedError(`Requisito inexistente: ${unknown[0]}`);
    await manager.save(
      product.requirements.map((r, i) =>
        manager.create(GuaranteeRequestRequirementEntity, {
          organizationId: request.organizationId,
          guaranteeRequestId: request.id,
          requirementCode: r.code,
          obligation: r.obligation,
          condition: r.condition,
          notApplicable: notApplicable.includes(r.code),
          note: notApplicable.includes(r.code)
            ? 'Marcado como no aplica al crear la solicitud'
            : null,
          sortOrder: i,
        }),
      ),
    );
  }

  /** Checklist con estado, motivo y documento de cada requisito. */
  async checklist(request: GuaranteeRequestEntity, options: { forProducer?: boolean } = {}) {
    const rows = await this.requirements.find({
      where: { guaranteeRequestId: request.id },
      order: { sortOrder: 'ASC' },
    });
    if (!rows.length) return null;
    const docs = request.establishmentId
      ? await this.documents.forRequest(
          request.organizationId,
          request.assetId,
          request.establishmentId,
        )
      : [];
    const analyses = await this.analyses.forDocuments(docs.map((d) => d.id));
    const open = await this.infoRequests.find({
      where: { guaranteeRequestId: request.id, status: 'OPEN' },
    });
    const product = request.creditProductCode ? creditProduct(request.creditProductCode) : null;
    const items = rows
      .filter((row) => row.requirementCode in REQUIREMENT_CATALOG)
      .map((row) => {
        const def = REQUIREMENT_CATALOG[row.requirementCode as RequirementCode];
        const evaluation = evaluateRequirement(
          def,
          docs.map((d) => ({
            id: d.id,
            type: d.type,
            status: d.status,
            createdAt: d.createdAt,
            analysis: analyses.get(d.id) ?? null,
          })),
          { notApplicable: row.notApplicable },
        );
        const doc = docs.find((d) => d.id === evaluation.documentId);
        const pending = open.find((i) => i.requirementCode === row.requirementCode);
        return {
          code: def.code,
          name: def.name,
          description: def.description,
          purpose: def.purpose,
          howTo: def.howTo,
          category: def.category,
          categoryLabel: REQUIREMENT_CATEGORIES[def.category],
          obligation: row.obligation,
          obligationLabel: OBLIGATION_LABELS[row.obligation],
          condition: row.condition,
          documentTypes: def.documentTypes.map((t) => ({ code: t, name: DOCUMENT_TYPE_NAMES[t] })),
          validation: def.validation,
          status: evaluation.status,
          statusLabel: REQUIREMENT_STATUS_LABELS[evaluation.status],
          reason: evaluation.reason,
          note: row.note,
          document: doc
            ? {
                id: doc.id,
                title: doc.title,
                type: doc.type,
                uploadedAt: doc.createdAt,
                demo: doc.dataSource === 'DEMO',
              }
            : null,
          requested: pending
            ? { informationRequestId: pending.id, at: pending.createdAt, message: pending.message }
            : null,
          sources: options.forProducer ? undefined : def.sources,
          officialVerification: def.officialVerification,
        };
      });
    const count = (s: RequirementStatus) => items.filter((i) => i.status === s).length;
    return {
      product: product
        ? {
            code: product.code,
            name: product.name,
            kind: product.kind,
            description: product.description,
            sources: options.forProducer ? undefined : product.sources,
            consultedAt: product.consultedAt,
          }
        : null,
      items,
      summary: {
        total: items.length,
        consistent: count('CONSISTENT'),
        pending: count('PENDING'),
        attention: count('INCONSISTENT') + count('REVIEW_REQUIRED'),
        processing: count('PROCESSING') + count('UPLOADED'),
        notApplicable: count('NOT_APPLICABLE'),
        // Obligatorios sin documento: lo que el productor tiene que cargar sí o sí.
        mandatoryMissing: items.filter(
          (i) => i.obligation === 'MANDATORY' && i.status === 'PENDING',
        ).length,
      },
    };
  }

  /**
   * Capas de datos del productor/establecimiento: lo declarado, lo leído de los documentos
   * (OCR), la comparación interna y la fuente oficial (hoy no conectada: queda vacía).
   */
  async dataLayers(request: GuaranteeRequestEntity) {
    if (!request.establishmentId) return null;
    const [est] = (await this.dataSource.query(
      `SELECT name, holder_name AS "holderName", holder_tax_id AS "holderTaxId", renspa,
              province, locality FROM establishments WHERE id = $1`,
      [request.establishmentId],
    )) as Record<string, string | null>[];
    const docs = await this.documents.forRequest(
      request.organizationId,
      request.assetId,
      request.establishmentId,
    );
    const analyses = await this.analyses.forDocuments(docs.map((d) => d.id));
    const FIELDS = [
      { key: 'renspa', label: 'RENSPA', entry: 'RENSPA', check: 'RENSPA' },
      { key: 'holderTaxId', label: 'CUIT del titular', entry: 'CUIT', check: 'CUIT' },
      { key: 'holderName', label: 'Titular', entry: 'HOLDER', check: 'HOLDER' },
      { key: 'name', label: 'Establecimiento', entry: 'ESTABLISHMENT', check: 'ESTABLISHMENT' },
      { key: 'locality', label: 'Localidad', entry: 'LOCALITY', check: 'LOCALITY' },
      { key: 'province', label: 'Provincia', entry: 'PROVINCE', check: 'PROVINCE' },
    ] as const;
    const officialInfo = this.official.info();
    return {
      fields: FIELDS.map((f) => {
        const extracted = docs.flatMap((d) =>
          (analyses.get(d.id)?.fieldEntries ?? [])
            .filter((e) => e.field === f.entry)
            .map((e) => ({ ...e, documentId: d.id, documentTitle: d.title })),
        );
        const checks = docs.flatMap((d) =>
          (analyses.get(d.id)?.validationResults ?? []).filter((r) => r.check === f.check),
        );
        const internal = checks.some((c) => c.status === 'MISMATCH')
          ? 'MISMATCH'
          : checks.some((c) => c.status === 'MATCH')
            ? 'MATCH'
            : 'NOT_COMPARED';
        return {
          key: f.key,
          label: f.label,
          declared: est?.[f.key] ?? null,
          extracted,
          internal,
          // Sin fuente oficial conectada: nunca se marca un dato como verificado oficialmente.
          official: { status: officialInfo.status, value: null },
        };
      }),
      officialSources: [officialInfo],
    };
  }

  /** La entidad marca un requisito como NO APLICA (o lo reactiva). Queda auditado. */
  async setApplicability(
    user: AuthenticatedUser,
    request: GuaranteeRequestEntity,
    code: string,
    command: { notApplicable: boolean; note?: string },
    context: RequestContext,
  ) {
    const row = await this.requirements.findOneBy({
      guaranteeRequestId: request.id,
      requirementCode: code,
    });
    if (!row) throw new NotFoundError('Requisito', code);
    await this.requirements.update(
      { id: row.id },
      {
        notApplicable: command.notApplicable,
        note: command.note?.trim() || null,
        updatedBy: user.userId,
      },
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.REQUIREMENT_UPDATED,
      resourceType: 'guarantee_request',
      resourceId: request.id,
      metadata: { requirementCode: code, notApplicable: command.notApplicable },
      context,
    });
  }

  /** Requisito de la solicitud (para pedirlo al productor). */
  async requirement(request: GuaranteeRequestEntity, code: string) {
    const row = await this.requirements.findOneBy({
      guaranteeRequestId: request.id,
      requirementCode: code,
    });
    if (!row || !(code in REQUIREMENT_CATALOG)) throw new NotFoundError('Requisito', code);
    return REQUIREMENT_CATALOG[code as RequirementCode];
  }
}
