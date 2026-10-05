import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { canonicalJson, randomToken, sha256Hex } from '../../../common/crypto/hashing.js';
import {
  ForbiddenActionError,
  InvalidStateError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain/errors.js';
import { point } from '../../../common/geo/geojson.js';
import { AppConfig } from '../../../config/app-config.js';
import { readExifGps } from '../../../common/files/exif-gps.js';
import { EVIDENCE_UPLOAD_POLICY } from '../../../common/files/file-signature.js';
import { AuditService, type AuditEntry } from '../../audit/application/audit.service.js';
import { EvidenceRecorder } from '../../evidence/application/evidence-recorder.js';
import { resolveCaptureLocation } from '../../evidence/domain/capture-location.js';
import { EVIDENCE_SOURCE_CODES } from '../../evidence/domain/evidence.types.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import {
  DocumentsService,
  type UploadDocumentCommand,
  type UploadedFile,
} from '../../documents/application/documents.service.js';
import {
  EvidenceService,
  type UploadEvidenceCommand,
} from '../../evidence/application/evidence.service.js';
import { VerificationRequestService } from '../../verification/application/verification-request.service.js';
import type {
  CollateralRiskLevel,
  EvidenceMethod,
  ImmobilizationStatus,
  InspectionResult,
  LegalInstrument,
  LegalStatus,
  MovementDirection,
  MovementKind,
  ProductionType,
} from '../domain/collateral.types.js';
import {
  BovineGuaranteeEntity,
  CollateralDeclarationEntity,
  CollateralInspectionEntity,
  CollateralMonitoringPolicyEntity,
  CollateralMovementEntity,
  type DeclaredCategory,
  type Discrepancy,
} from '../infrastructure/collateral.entities.js';
import { CollateralService } from './collateral.service.js';

export interface UpdateGuaranteeCommand {
  legalInstrument?: LegalInstrument;
  legalIdentifier?: string | null;
  legalStatus?: LegalStatus;
  lienPriority?: number | null;
  immobilizationStatus?: ImmobilizationStatus;
  immobilizationReference?: string | null;
  amount?: number | null;
  debtAmount?: number | null;
  currency?: 'USD' | 'ARS';
  grantedAt?: string | null;
  expiresAt?: string | null;
  productionType?: ProductionType;
  averageWeightKg?: number | null;
  weightSource?: string | null;
  pricePerKg?: number | null;
  priceCurrency?: 'USD' | 'ARS' | null;
  priceSource?: string | null;
  priceDate?: string | null;
  qualityFactor?: number | null;
}

export interface MovementCommand {
  direction: MovementDirection;
  kind: MovementKind;
  heads: number;
  category?: string;
  origin?: string;
  destination?: string;
  occurredAt: string;
  documentId?: string;
  dteNumber?: string;
  animalRefs?: string[];
  notes?: string;
}

export interface InspectionRecordCommand {
  inspectorName: string;
  performedAt: string;
  latitude?: number;
  longitude?: number;
  observedHeads: number;
  fullCount: boolean;
  rfidRead?: number;
  evidenceIds?: string[];
  observations?: string;
  discrepancies?: Discrepancy[];
  result: InspectionResult;
  signatureName: string;
  signatureAccepted: boolean;
}

export interface PolicyCommand {
  productionType: ProductionType;
  riskLevel: CollateralRiskLevel;
  frequencyDays: number;
  maxEvidenceAgeDays: number;
  recommendedMethod: EvidenceMethod;
  requiresInspection: boolean;
}

const LEGAL_FIELDS = [
  'legalInstrument',
  'legalIdentifier',
  'legalStatus',
  'lienPriority',
  'immobilizationStatus',
  'immobilizationReference',
  'amount',
  'debtAmount',
  'currency',
  'grantedAt',
  'expiresAt',
  'productionType',
  'averageWeightKg',
  'weightSource',
  'pricePerKg',
  'priceCurrency',
  'priceSource',
  'priceDate',
  'qualityFactor',
] as const;

const FIELD_LABELS: Record<string, string> = {
  legalInstrument: 'instrumento',
  legalIdentifier: 'n° de inscripción',
  legalStatus: 'estado registral',
  lienPriority: 'prioridad',
  immobilizationStatus: 'inmovilización',
  immobilizationReference: 'referencia de inmovilización',
  amount: 'monto',
  debtAmount: 'deuda',
  currency: 'moneda',
  grantedAt: 'otorgamiento',
  expiresAt: 'vencimiento',
  productionType: 'tipo de producción',
  averageWeightKg: 'peso promedio',
  weightSource: 'fuente del peso',
  pricePerKg: 'precio por kg',
  priceCurrency: 'moneda del precio',
  priceSource: 'fuente del precio',
  priceDate: 'fecha del precio',
  qualityFactor: 'factor de calidad',
};

/** Vigencia del link del inspector. */
const INSPECTOR_LINK_DAYS = 14;

/** Tipos de documento que respaldan un movimiento (DT-e) o una fuente oficial. */
const MOVEMENT_DOCUMENT_TYPES = new Set(['DTE', 'TRAZA_REPORT', 'STOCK_CERTIFICATE', 'OTHER']);

/** Comandos de la API sobre la garantía bovina. Toda modificación queda en historial y auditoría. */
@Injectable()
export class CollateralCommandsService {
  constructor(
    private readonly core: CollateralService,
    private readonly config: AppConfig,
    private readonly recorder: EvidenceRecorder,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
    private readonly documents: DocumentsService,
    private readonly verifications: VerificationRequestService,
  ) {}

  async update(
    user: AuthenticatedUser,
    id: string,
    command: UpdateGuaranteeCommand,
    context: RequestContext,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const field of LEGAL_FIELDS) {
      if (command[field] === undefined) continue;
      const value =
        typeof command[field] === 'string'
          ? (command[field] as string).trim() || null
          : command[field];
      if (value !== g[field]) {
        before[field] = g[field];
        after[field] = value;
      }
    }
    const granted = (after.grantedAt ?? g.grantedAt) as string | null;
    const expires = (after.expiresAt ?? g.expiresAt) as string | null;
    if (granted && expires && expires < granted)
      throw new ValidationFailedError('El vencimiento no puede ser anterior al otorgamiento');
    if (!Object.keys(after).length) return g;
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        BovineGuaranteeEntity,
        { id: g.id },
        after as Partial<BovineGuaranteeEntity>,
      );
      await this.core.event(manager, g, {
        type: 'DATOS_GARANTIA_ACTUALIZADOS',
        source: 'ENTIDAD',
        actorId: user.userId,
        actorLabel: user.fullName,
        summary: `Datos de la garantía actualizados: ${Object.keys(after)
          .map((k) => FIELD_LABELS[k] ?? k)
          .join(', ')}.`,
        payload: { before, after },
      });
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.BOVINE_GUARANTEE_UPDATED,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: { before, after },
          context,
        },
        manager,
      );
    });
    await this.reassess(user, g.id, 'DATOS_GARANTIA');
    return this.core.findForOrganization(user.organizationId, id);
  }

  /**
   * Corrección de la declaración: nunca modifica la vigente; crea la versión siguiente con motivo,
   * fecha y usuario. La puede pedir la entidad o el productor de la solicitud.
   */
  async correctDeclaration(
    user: AuthenticatedUser,
    id: string,
    command: { heads: number; categories?: DeclaredCategory[]; reason: string },
    context: RequestContext,
    asProducer = false,
  ) {
    const g = asProducer
      ? await this.producerGuarantee(user, id)
      : await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    if (!command.reason?.trim())
      throw new ValidationFailedError('La corrección requiere un motivo');
    if (!Number.isInteger(command.heads) || command.heads < 1)
      throw new ValidationFailedError('La cantidad declarada debe ser un entero positivo');
    const categories = command.categories ?? [];
    const sum = categories.reduce((a, c) => a + c.heads, 0);
    if (categories.length && sum !== command.heads)
      throw new ValidationFailedError(
        `Las categorías suman ${sum} y la cantidad declarada es ${command.heads}`,
      );
    const version = await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(CollateralDeclarationEntity, {
        where: { guaranteeId: g.id },
        order: { version: 'DESC' },
      });
      if (!current)
        throw new InvalidStateError('Todavía no hay una declaración enviada para corregir');
      const next = await manager.save(
        manager.create(CollateralDeclarationEntity, {
          organizationId: g.organizationId,
          guaranteeId: g.id,
          version: current.version + 1,
          heads: command.heads,
          categories,
          productionType: g.productionType,
          establishment: current.establishment,
          source: asProducer ? 'PRODUCTOR' : 'ENTIDAD',
          declaredBy: user.userId,
          declaredByLabel: user.fullName,
          declaredAt: new Date(),
          reason: command.reason.trim().slice(0, 500),
          supersedesId: current.id,
        }),
      );
      await manager.update(
        BovineGuaranteeEntity,
        { id: g.id },
        { currentDeclarationVersion: next.version },
      );
      await this.core.event(manager, g, {
        type: 'DECLARACION_CORREGIDA',
        source: asProducer ? 'PRODUCTOR' : 'ENTIDAD',
        actorId: user.userId,
        actorLabel: user.fullName,
        method: 'DECLARACION',
        result: `${current.heads} → ${command.heads} cabezas`,
        summary: `Nueva versión ${next.version} de la declaración (${current.heads} → ${command.heads} cabezas). Motivo: ${command.reason.trim()}. La versión ${current.version} se conserva.`,
        payload: { declarationId: next.id, version: next.version, supersedes: current.id },
      });
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.BOVINE_DECLARATION_CORRECTED,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: {
            from: current.version,
            to: next.version,
            heads: command.heads,
            reason: command.reason,
          },
          context,
        },
        manager,
      );
      return next.version;
    });
    await this.reassess(user, g.id, 'DECLARACION', asProducer ? 'PRODUCTOR' : 'ENTIDAD');
    return { version };
  }

  async recordMovement(
    user: AuthenticatedUser,
    id: string,
    command: MovementCommand,
    context: RequestContext,
    role: 'ENTIDAD' | 'PRODUCTOR' = 'ENTIDAD',
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    if (!Number.isInteger(command.heads) || command.heads < 1)
      throw new ValidationFailedError('La cantidad de cabezas debe ser un entero positivo');
    const occurredAt = new Date(command.occurredAt);
    if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 3_600_000)
      throw new ValidationFailedError('Fecha del movimiento inválida');
    let sourceLevel: 'DOCUMENTADO' | 'DECLARADO' = 'DECLARADO';
    let sourceLabel = `Informado por ${role === 'PRODUCTOR' ? 'el productor' : 'la entidad'} (${user.fullName}), sin documento`;
    if (command.documentId) {
      const [doc] = (await this.dataSource.query(
        `SELECT id, type, title FROM documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
            AND (asset_id = $3 OR establishment_id = $4)`,
        [command.documentId, g.organizationId, g.assetId, g.establishmentId],
      )) as { id: string; type: string; title: string }[];
      if (!doc) throw new ValidationFailedError('El documento no pertenece a esta garantía');
      if (!MOVEMENT_DOCUMENT_TYPES.has(doc.type))
        throw new ValidationFailedError(
          'Un movimiento se respalda con un DT-e o una constancia oficial',
        );
      sourceLevel = 'DOCUMENTADO';
      sourceLabel = `${doc.title}${command.dteNumber ? ` (DT-e ${command.dteNumber})` : ''} — documento cargado, no consultado en SENASA`;
    }
    const movement = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(CollateralMovementEntity, {
          organizationId: g.organizationId,
          guaranteeId: g.id,
          direction: command.direction,
          kind: command.kind,
          heads: command.heads,
          category: command.category?.trim() || null,
          animalRefs: command.animalRefs ?? [],
          origin: command.origin?.trim() || null,
          destination: command.destination?.trim() || null,
          occurredAt,
          sourceLevel,
          sourceLabel: sourceLabel.slice(0, 160),
          documentId: command.documentId ?? null,
          dteNumber: command.dteNumber?.trim() || null,
          verificationState: 'PENDIENTE',
          notes: command.notes?.trim() || null,
          recordedBy: user.userId,
          reportedByRole: role,
        }),
      );
      await this.core.event(manager, g, {
        type: 'MOVIMIENTO_REGISTRADO',
        source: role,
        actorId: user.userId,
        actorLabel: user.fullName,
        method: sourceLevel,
        evidence: command.documentId ? [{ kind: 'document', id: command.documentId }] : [],
        result: `${command.direction === 'EGRESO' ? '−' : '+'}${command.heads}`,
        summary: `${command.direction === 'EGRESO' ? 'Egreso' : 'Ingreso'} de ${command.heads} cabezas (${command.kind.toLowerCase()}), ${sourceLevel.toLowerCase()}.`,
        payload: { movementId: saved.id },
        occurredAt,
      });
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.BOVINE_MOVEMENT_RECORDED,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: {
            movementId: saved.id,
            direction: saved.direction,
            heads: saved.heads,
            sourceLevel,
          },
          context,
        },
        manager,
      );
      return saved;
    });
    await this.reassess(user, g.id, 'MOVIMIENTO', role);
    return movement;
  }

  async reviewMovement(
    user: AuthenticatedUser,
    id: string,
    movementId: string,
    command: { state: 'VERIFICADO' | 'RECHAZADO'; note: string },
    context: RequestContext,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    if (!command.note?.trim()) throw new ValidationFailedError('La revisión requiere una nota');
    await this.dataSource.transaction(async (manager) => {
      const m = await manager.findOneBy(CollateralMovementEntity, {
        id: movementId,
        guaranteeId: g.id,
      });
      if (!m) throw new NotFoundError('Movimiento', movementId);
      if (m.verificationState !== 'PENDIENTE')
        throw new InvalidStateError('El movimiento ya fue revisado');
      await manager.update(
        CollateralMovementEntity,
        { id: m.id },
        { verificationState: command.state },
      );
      await this.core.event(manager, g, {
        type: 'MOVIMIENTO_REVISADO',
        source: 'ENTIDAD',
        actorId: user.userId,
        actorLabel: user.fullName,
        result: command.state,
        summary: `Movimiento de ${m.heads} cabezas ${command.state === 'VERIFICADO' ? 'verificado' : 'rechazado'}: ${command.note.trim()}`,
        payload: { movementId: m.id, from: m.verificationState, to: command.state },
      });
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.BOVINE_MOVEMENT_REVIEWED,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: {
            movementId: m.id,
            from: m.verificationState,
            to: command.state,
            note: command.note,
          },
          context,
        },
        manager,
      );
    });
    await this.reassess(user, g.id, 'MOVIMIENTO');
  }

  async requestInspection(
    user: AuthenticatedUser,
    id: string,
    command: { reason: string; dueAt?: string; inspectorContact?: string },
    context: RequestContext,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    if (!command.reason?.trim())
      throw new ValidationFailedError('Indicá el motivo de la inspección');
    const created = await this.dataSource.transaction(async (manager) => {
      const inspection = await manager.save(
        manager.create(CollateralInspectionEntity, {
          organizationId: g.organizationId,
          guaranteeId: g.id,
          status: 'SOLICITADA',
          reason: command.reason.trim().slice(0, 500),
          requestedBy: user.userId,
          requestedAt: new Date(),
          dueAt: command.dueAt ? new Date(command.dueAt) : null,
          inspectorContact: command.inspectorContact?.trim() || null,
          evidenceIds: [],
          discrepancies: [],
        }),
      );
      await this.core.event(manager, g, {
        type: 'INSPECCION_SOLICITADA',
        source: 'ENTIDAD',
        actorId: user.userId,
        actorLabel: user.fullName,
        method: 'INSPECCION',
        summary: `Inspección presencial solicitada: ${command.reason.trim()}`,
        payload: { inspectionId: inspection.id },
      });
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.BOVINE_INSPECTION_REQUESTED,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: { inspectionId: inspection.id, reason: command.reason },
          context,
        },
        manager,
      );
      return inspection;
    });
    // Link para el inspector (se muestra una sola vez; se puede regenerar).
    const inspectorLink = await this.inspectionLink(user, g.id, created.id, context);
    return {
      id: created.id,
      status: created.status,
      reason: created.reason,
      dueAt: created.dueAt,
      requestedAt: created.requestedAt,
      inspectorLink,
    };
  }

  /**
   * Registra una inspección realizada (con firma). La firma es el nombre de quien firma + el
   * SHA-256 del contenido canónico del acta: cualquier cambio posterior no coincidiría con el hash.
   * Una vez REALIZADA, la base no permite modificarla.
   */
  async recordInspection(
    user: AuthenticatedUser,
    id: string,
    inspectionId: string | null,
    command: InspectionRecordCommand,
    context: RequestContext,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    return this.recordInspectionFor(
      g,
      inspectionId,
      command,
      { userId: user.userId, label: user.fullName, audit: { kind: 'user', user }, user },
      context,
    );
  }

  /** Registra el acta: la carga la entidad (acta en papel) o el inspector desde su link. */
  private async recordInspectionFor(
    g: BovineGuaranteeEntity,
    inspectionId: string | null,
    command: InspectionRecordCommand,
    actor: {
      userId: string | null;
      label: string;
      audit: AuditEntry['actor'];
      user?: AuthenticatedUser;
    },
    context: RequestContext,
  ) {
    this.core.assertActive(g);
    if (!command.signatureAccepted || !command.signatureName?.trim())
      throw new ValidationFailedError('El acta requiere la firma del inspector');
    if (!command.inspectorName?.trim()) throw new ValidationFailedError('Indicá el inspector');
    if (!Number.isInteger(command.observedHeads) || command.observedHeads < 0)
      throw new ValidationFailedError('La cantidad observada debe ser un entero');
    const performedAt = new Date(command.performedAt);
    if (Number.isNaN(performedAt.getTime()) || performedAt.getTime() > Date.now() + 3_600_000)
      throw new ValidationFailedError('Fecha de inspección inválida');
    const evidenceIds = [...new Set(command.evidenceIds ?? [])];
    if (evidenceIds.length) {
      const [{ n }] = (await this.dataSource.query(
        `SELECT count(*)::int AS n FROM evidence WHERE id = ANY($1) AND asset_id = $2`,
        [evidenceIds, g.assetId],
      )) as { n: number }[];
      if (n !== evidenceIds.length)
        throw new ValidationFailedError('Hay evidencias que no son de esta garantía');
    }
    const hasLocation = command.latitude !== undefined && command.longitude !== undefined;
    const signedAt = new Date();
    const act = {
      guarantee: g.code,
      inspector: command.inspectorName.trim(),
      performedAt: performedAt.toISOString(),
      location: hasLocation ? [command.longitude, command.latitude] : null,
      observedHeads: command.observedHeads,
      fullCount: command.fullCount,
      rfidRead: command.rfidRead ?? null,
      evidenceIds,
      observations: command.observations?.trim() ?? '',
      discrepancies: command.discrepancies ?? [],
      result: command.result,
      signatureName: command.signatureName.trim(),
      signedAt: signedAt.toISOString(),
    };
    const signatureHash = sha256Hex(canonicalJson(act));
    const fields = {
      status: 'REALIZADA' as const,
      inspectorName: act.inspector,
      inspectorUserId: actor.userId,
      performedAt,
      location: hasLocation ? point(command.longitude!, command.latitude!) : null,
      observedHeads: command.observedHeads,
      fullCount: command.fullCount,
      rfidRead: command.rfidRead ?? null,
      evidenceIds,
      observations: act.observations || null,
      discrepancies: act.discrepancies,
      result: command.result,
      signatureName: act.signatureName,
      signatureHash,
      signedAt,
      recordedBy: actor.userId,
    };
    const saved = await this.dataSource.transaction(async (manager) => {
      let inspection: CollateralInspectionEntity;
      if (inspectionId) {
        const existing = await manager.findOneBy(CollateralInspectionEntity, {
          id: inspectionId,
          guaranteeId: g.id,
        });
        if (!existing) throw new NotFoundError('Inspección', inspectionId);
        if (existing.status !== 'SOLICITADA')
          throw new InvalidStateError('La inspección ya fue registrada o cancelada');
        await manager.update(CollateralInspectionEntity, { id: existing.id }, fields);
        inspection = await manager.findOneByOrFail(CollateralInspectionEntity, { id: existing.id });
      } else {
        inspection = await manager.save(
          manager.create(CollateralInspectionEntity, {
            organizationId: g.organizationId,
            guaranteeId: g.id,
            reason: 'Inspección registrada sin solicitud previa',
            requestedBy: actor.userId,
            requestedAt: performedAt,
            ...fields,
          }),
        );
      }
      await this.core.event(manager, g, {
        type: 'INSPECCION_REALIZADA',
        source: 'INSPECTOR',
        actorId: actor.userId,
        actorLabel: act.inspector,
        method: 'INSPECCION',
        evidence: evidenceIds.map((e) => ({ kind: 'evidence', id: e })),
        result: command.result,
        summary: `Inspección ${command.result.replace('_', ' ').toLowerCase()}: ${command.observedHeads} animales observados (${command.fullCount ? 'conteo completo' : 'conteo parcial'}). Firmada por ${act.signatureName}.`,
        payload: { inspectionId: inspection.id, signatureHash },
        occurredAt: performedAt,
      });
      await this.audit.record(
        {
          actor: actor.audit,
          action: AUDIT_ACTIONS.BOVINE_INSPECTION_RECORDED,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: { inspectionId: inspection.id, result: command.result, signatureHash },
          context,
        },
        manager,
      );
      return inspection;
    });
    const fresh = await this.dataSource
      .getRepository(BovineGuaranteeEntity)
      .findOneByOrFail({ id: g.id });
    await this.core.reassess(
      fresh,
      'INSPECCION',
      actor.user
        ? { kind: 'user', user: actor.user, source: 'INSPECTOR' }
        : { kind: 'system', organizationId: g.organizationId, process: 'inspector-link' },
    );
    return saved;
  }

  /**
   * El productor avisa un movimiento desde su portal. Con el DT-e adjunto queda DOCUMENTADO; sin
   * él, DECLARADO. La entidad lo acepta o lo rechaza; hasta entonces cuenta como PENDIENTE.
   */
  async producerMovement(
    user: AuthenticatedUser,
    requestId: string,
    command: MovementCommand,
    file: UploadedFile | undefined,
    context: RequestContext,
  ) {
    const g = await this.producerGuarantee(user, requestId);
    this.core.assertActive(g);
    if (g.currentDeclarationVersion === null || !g.assetId)
      throw new InvalidStateError('Primero enviá tu declaración');
    let documentId: string | undefined;
    if (file) {
      const doc = await this.documents.uploadForAsset(
        user,
        g.assetId,
        file,
        { type: 'DTE', title: `DT-e ${command.dteNumber ?? ''}`.trim() },
        context,
      );
      documentId = doc.id;
    }
    return this.recordMovement(user, g.id, { ...command, documentId }, context, 'PRODUCTOR');
  }

  /** Genera (o regenera) el link del inspector de una inspección solicitada. */
  async inspectionLink(
    user: AuthenticatedUser,
    id: string,
    inspectionId: string,
    context: RequestContext,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    const repo = this.dataSource.getRepository(CollateralInspectionEntity);
    const inspection = await repo.findOneBy({ id: inspectionId, guaranteeId: g.id });
    if (!inspection) throw new NotFoundError('Inspección', inspectionId);
    if (inspection.status !== 'SOLICITADA')
      throw new InvalidStateError('La inspección ya fue realizada o cancelada');
    const token = randomToken();
    const expiresAt = new Date(Date.now() + INSPECTOR_LINK_DAYS * 86_400_000);
    await repo.update(
      { id: inspection.id },
      { inviteTokenHash: sha256Hex(token), inviteExpiresAt: expiresAt },
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.BOVINE_INSPECTION_REQUESTED,
      resourceType: 'bovine_guarantee',
      resourceId: g.id,
      metadata: { inspectionId: inspection.id, link: 'GENERATED', expiresAt },
      context,
    });
    const base = this.config.env.WEB_ORIGIN.replace(/\/$/, '');
    return { url: `${base}/inspeccion/${token}`, expiresAt };
  }

  /** Inspección del link: el token tiene que ser válido, vigente y de una inspección pendiente. */
  private async inspectionByToken(token: string) {
    const inspection = await this.dataSource
      .getRepository(CollateralInspectionEntity)
      .createQueryBuilder('i')
      .where('i.invite_token_hash = :hash', { hash: sha256Hex(token) })
      .getOne();
    if (!inspection) throw new NotFoundError('Link de inspección', 'inválido');
    if (inspection.status !== 'SOLICITADA')
      throw new InvalidStateError('Esta inspección ya fue registrada: el link dejó de servir');
    if (!inspection.inviteExpiresAt || inspection.inviteExpiresAt < new Date())
      throw new ForbiddenActionError('El link venció: pedile uno nuevo a la entidad');
    const g = await this.dataSource
      .getRepository(BovineGuaranteeEntity)
      .findOneByOrFail({ id: inspection.guaranteeId });
    return { inspection, g };
  }

  /**
   * Lo que ve el inspector. Conteo a ciegas: no se le muestran las cabezas declaradas ni las
   * esperadas, para que su conteo sea independiente.
   */
  async inspectorView(token: string) {
    const { inspection, g } = await this.inspectionByToken(token);
    const [row] = (await this.dataSource.query(
      `SELECT o.name AS "organizationName", e.name AS establishment, e.locality, e.province, e.renspa,
              ST_Y(l.point) AS latitude, ST_X(l.point) AS longitude, a.name AS "assetName"
         FROM bovine_guarantees g
         JOIN organizations o ON o.id = g.organization_id
         LEFT JOIN establishments e ON e.id = g.establishment_id
         LEFT JOIN establishment_locations l ON l.establishment_id = e.id AND l.kind = 'MAIN'
         LEFT JOIN assets a ON a.id = g.asset_id
        WHERE g.id = $1`,
      [g.id],
    )) as Record<string, string | number | null>[];
    return {
      guarantee: { code: g.code, productionType: g.productionType, demo: g.dataSource === 'DEMO' },
      requester: row?.organizationName ?? null,
      producer: g.producerName,
      establishment: row
        ? {
            name: row.establishment,
            locality: row.locality,
            province: row.province,
            renspa: row.renspa,
            location:
              row.latitude !== null ? { latitude: row.latitude, longitude: row.longitude } : null,
          }
        : null,
      assetName: row?.assetName ?? null,
      reason: inspection.reason,
      dueAt: inspection.dueAt,
      expiresAt: inspection.inviteExpiresAt,
      photos: inspection.evidenceIds.length,
      blindCount: true,
    };
  }

  /** Foto del inspector (con GPS): queda como evidencia de la inspección. */
  async inspectorEvidence(
    token: string,
    file: UploadedFile | undefined,
    command: UploadEvidenceCommand & { inspectorName?: string },
    context: RequestContext,
  ) {
    const { inspection, g } = await this.inspectionByToken(token);
    if (!g.assetId || !g.establishmentId)
      throw new InvalidStateError('La garantía no tiene rodeo declarado');
    if (!file) throw new ValidationFailedError('Adjuntá una foto');
    const check = EVIDENCE_UPLOAD_POLICY.validate(file);
    if (!check.ok) throw new ValidationFailedError(check.reason);
    const location = resolveCaptureLocation(command, readExifGps(file.buffer));
    const capturedAt = command.capturedAt ? new Date(command.capturedAt) : new Date();
    if (Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 300_000)
      throw new ValidationFailedError('Fecha de captura inválida');
    const evidence = await this.recorder.record({
      organizationId: g.organizationId,
      assetId: g.assetId,
      establishmentId: g.establishmentId,
      sourceCode: EVIDENCE_SOURCE_CODES.MANUAL_UPLOAD,
      type: 'IMAGE',
      capturedAt,
      location: location.capture
        ? point(location.capture.longitude, location.capture.latitude)
        : null,
      file: { bytes: file.buffer, mimeType: check.kind.mime },
      uploadedBy: null,
      metadata: {
        originalFileName: file.originalname.slice(0, 200),
        locationSource: location.source,
        locationAccuracyM: location.accuracyM,
        captureOrigin: command.captureOrigin === 'FILE' ? 'ARCHIVO_CARGADO' : 'CAPTURA_EN_CAMPO',
        inspectionId: inspection.id,
        inspectorName: command.inspectorName?.slice(0, 160) ?? null,
        description: 'Foto de la inspección presencial',
      },
    });
    await this.dataSource
      .getRepository(CollateralInspectionEntity)
      .update({ id: inspection.id }, { evidenceIds: [...inspection.evidenceIds, evidence.id] });
    await this.audit.record({
      actor: { kind: 'anonymous', organizationId: g.organizationId },
      action: AUDIT_ACTIONS.EVIDENCE_UPLOADED,
      resourceType: 'evidence',
      resourceId: evidence.id,
      metadata: { inspectionId: inspection.id, via: 'inspector-link', sha256: evidence.sha256 },
      context,
    });
    return { evidenceId: evidence.id, sha256: evidence.sha256, location: location.source };
  }

  /** El inspector firma el acta desde el link (después el link deja de servir). */
  async inspectorRecord(token: string, command: InspectionRecordCommand, context: RequestContext) {
    const { inspection, g } = await this.inspectionByToken(token);
    return this.recordInspectionFor(
      g,
      inspection.id,
      {
        ...command,
        evidenceIds: [...new Set([...inspection.evidenceIds, ...(command.evidenceIds ?? [])])],
      },
      {
        userId: null,
        label: command.inspectorName,
        audit: { kind: 'anonymous', organizationId: g.organizationId },
      },
      context,
    );
  }

  /** Pide una verificación nueva con el pipeline existente (evidencia cargada del activo). */
  async requestVerification(
    user: AuthenticatedUser,
    id: string,
    context: RequestContext,
    note?: string,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    if (!g.assetId || g.currentDeclarationVersion === null)
      throw new InvalidStateError('La garantía todavía no tiene una declaración enviada');
    const run = await this.verifications.request(
      { kind: 'user', user },
      {
        assetId: g.assetId,
        trigger: 'MANUAL',
        note: note ?? `Verificación de la garantía ${g.code}`,
      },
      context,
    );
    await this.core.event(this.dataSource.manager, g, {
      type: 'VERIFICACION_SOLICITADA',
      source: 'ENTIDAD',
      actorId: user.userId,
      actorLabel: user.fullName,
      summary: 'Se solicitó una verificación con la evidencia disponible.',
      payload: { verificationRunId: run.id },
    });
    return { verificationRunId: run.id, status: run.status };
  }

  /** Evidencia nueva (foto) para la garantía + verificación con el pipeline. */
  async uploadEvidence(
    user: AuthenticatedUser,
    id: string,
    file: UploadedFile | undefined,
    command: UploadEvidenceCommand,
    context: RequestContext,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    if (!g.assetId) throw new InvalidStateError('La garantía todavía no tiene un rodeo declarado');
    const evidence = await this.evidence.uploadManual(user, g.assetId, file, command, context);
    const origin =
      typeof evidence.metadata.captureOrigin === 'string'
        ? evidence.metadata.captureOrigin
        : 'DESCONOCIDO';
    await this.core.event(this.dataSource.manager, g, {
      type: 'EVIDENCIA_CARGADA',
      source: 'ENTIDAD',
      actorId: user.userId,
      actorLabel: user.fullName,
      method: 'FOTO',
      evidence: [{ kind: 'evidence', id: evidence.id, sha256: evidence.sha256 }],
      result: origin,
      summary: `Foto cargada (${origin.replace('_', ' ').toLowerCase()}).`,
      payload: { evidenceId: evidence.id },
    });
    const run = await this.requestVerification(
      user,
      id,
      context,
      'Evidencia nueva de la garantía',
    ).catch(() => null);
    return {
      evidenceId: evidence.id,
      sha256: evidence.sha256,
      verificationRunId: run?.verificationRunId ?? null,
    };
  }

  /** Documento oficial cargado (RENSPA, existencias SIGSA, DT-e, TRAZA, prenda...). */
  async uploadDocument(
    user: AuthenticatedUser,
    id: string,
    file: UploadedFile | undefined,
    command: UploadDocumentCommand,
    context: RequestContext,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    if (!g.assetId) throw new InvalidStateError('La garantía todavía no tiene un rodeo declarado');
    const doc = await this.documents.uploadForAsset(user, g.assetId, file, command, context);
    await this.core.event(this.dataSource.manager, g, {
      type: 'DOCUMENTO_CARGADO',
      source: 'DOCUMENTO',
      actorId: user.userId,
      actorLabel: user.fullName,
      method: doc.type,
      evidence: [{ kind: 'document', id: doc.id, sha256: doc.sha256 }],
      summary: `Documento cargado: ${doc.title}. Es una copia aportada, no una consulta a la fuente oficial.`,
      payload: { documentId: doc.id, type: doc.type },
    });
    await this.reassess(user, g.id, 'DOCUMENTO');
    return doc;
  }

  async recalculate(user: AuthenticatedUser, id: string) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    if (g.currentDeclarationVersion === null)
      throw new InvalidStateError('La garantía todavía no tiene una declaración enviada');
    const { assessment, snapshotId } = await this.core.reassess(g, 'RECALCULO', {
      kind: 'user',
      user,
    });
    return {
      snapshotId,
      state: assessment.state,
      score: assessment.score.finalScore,
      riskLevel: assessment.risk.level,
    };
  }

  async finalize(
    user: AuthenticatedUser,
    id: string,
    command: { reason: string },
    context: RequestContext,
  ) {
    const g = await this.core.findForOrganization(user.organizationId, id);
    this.core.assertActive(g);
    if (!command.reason?.trim())
      throw new ValidationFailedError('Indicá el motivo de la finalización');
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        BovineGuaranteeEntity,
        { id: g.id },
        { finalizedAt: new Date(), finalizedBy: user.userId },
      );
      await this.core.event(manager, g, {
        type: 'GARANTIA_FINALIZADA',
        source: 'ENTIDAD',
        actorId: user.userId,
        actorLabel: user.fullName,
        summary: `Garantía finalizada: ${command.reason.trim()}. El historial se conserva.`,
      });
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.BOVINE_GUARANTEE_FINALIZED,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: { reason: command.reason },
          context,
        },
        manager,
      );
    });
    if (g.currentDeclarationVersion !== null) await this.reassess(user, g.id, 'RECALCULO');
    else
      await this.dataSource.manager.update(
        BovineGuaranteeEntity,
        { id: g.id },
        { state: 'FINALIZADA', stateReason: 'La garantía fue finalizada.' },
      );
  }

  async upsertPolicy(user: AuthenticatedUser, command: PolicyCommand, context: RequestContext) {
    if (command.maxEvidenceAgeDays < command.frequencyDays)
      throw new ValidationFailedError(
        'La antigüedad máxima de la evidencia no puede ser menor que la frecuencia',
      );
    const repo = this.dataSource.getRepository(CollateralMonitoringPolicyEntity);
    const existing = await repo.findOneBy({
      organizationId: user.organizationId,
      productionType: command.productionType,
      riskLevel: command.riskLevel,
    });
    const before = existing
      ? {
          frequencyDays: existing.frequencyDays,
          maxEvidenceAgeDays: existing.maxEvidenceAgeDays,
          recommendedMethod: existing.recommendedMethod,
          requiresInspection: existing.requiresInspection,
        }
      : null;
    const saved = await repo.save(
      Object.assign(existing ?? repo.create({ organizationId: user.organizationId }), command, {
        updatedBy: user.userId,
      }),
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.BOVINE_POLICY_UPDATED,
      resourceType: 'collateral_monitoring_policy',
      resourceId: saved.id,
      metadata: { before, after: command },
      context,
    });
    return saved;
  }

  private async reassess(
    user: AuthenticatedUser,
    id: string,
    trigger: Parameters<CollateralService['reassess']>[1],
    source?: 'ENTIDAD' | 'PRODUCTOR' | 'INSPECTOR',
  ) {
    const g = await this.dataSource.getRepository(BovineGuaranteeEntity).findOneByOrFail({ id });
    if (g.currentDeclarationVersion === null) return;
    await this.core.reassess(g, trigger, { kind: 'user', user, source });
  }

  private async producerGuarantee(user: AuthenticatedUser, requestId: string) {
    const [row] = (await this.dataSource.query(
      `SELECT g.id FROM bovine_guarantees g JOIN guarantee_requests r ON r.id = g.guarantee_request_id
        WHERE r.id = $1 AND r.producer_user_id = $2`,
      [requestId, user.userId],
    )) as { id: string }[];
    if (!row) throw new ForbiddenActionError('La solicitud no es tuya');
    return this.dataSource.getRepository(BovineGuaranteeEntity).findOneByOrFail({ id: row.id });
  }
}
