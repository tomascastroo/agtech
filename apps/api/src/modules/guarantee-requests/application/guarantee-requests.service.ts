import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { randomToken, sha256Hex } from '../../../common/crypto/hashing.js';
import {
  ConflictError,
  ForbiddenActionError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain/errors.js';
import { isValidCuit } from '../../establishments/domain/establishment.types.js';
import { AppConfig } from '../../../config/app-config.js';
import { AssetsService, type CreateAssetCommand } from '../../assets/application/assets.service.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import {
  DocumentsService,
  type UploadDocumentCommand,
  type UploadedFile,
} from '../../documents/application/documents.service.js';
import {
  EstablishmentsService,
  type CreateEstablishmentCommand,
} from '../../establishments/application/establishments.service.js';
import {
  EvidenceService,
  type UploadEvidenceCommand,
} from '../../evidence/application/evidence.service.js';
import { RoleEntity } from '../../users/infrastructure/role.entity.js';
import { UserEntity } from '../../users/infrastructure/user.entity.js';
import { VerificationRequestService } from '../../verification/application/verification-request.service.js';
import { GuaranteeRequestEntity } from '../infrastructure/guarantee-request.entity.js';

const DAY_MS = 86_400_000;
export const INVITATION_DAYS = 30;

export interface CreateGuaranteeRequestCommand {
  producerName: string;
  producerTaxId: string;
  producerEmail?: string;
  assetTypeCode: string;
  requestedAmount?: number;
  currency?: string;
  notes?: string;
}

/**
 * Solicitudes de garantía. Separa tres momentos:
 *   1. el banco solicita (sin acceso a editar la declaración);
 *   2. el productor declara establecimiento, activo, documentación y evidencia (por link);
 *   3. AgroGarantías verifica con el pipeline existente y el banco consulta el resultado.
 * El productor opera con un usuario propio (rol PRODUCER, sin contraseña ni permisos sobre la
 * cartera) y cada operación se limita a la solicitud del token.
 */
@Injectable()
export class GuaranteeRequestsService {
  constructor(
    @InjectRepository(GuaranteeRequestEntity)
    private readonly requests: Repository<GuaranteeRequestEntity>,
    private readonly dataSource: DataSource,
    private readonly config: AppConfig,
    private readonly assetsRepository: AssetsRepository,
    private readonly establishments: EstablishmentsService,
    private readonly assets: AssetsService,
    private readonly documents: DocumentsService,
    private readonly evidence: EvidenceService,
    private readonly verifications: VerificationRequestService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ banco
  async create(
    user: AuthenticatedUser,
    command: CreateGuaranteeRequestCommand,
    context: RequestContext,
  ) {
    if (!isValidCuit(command.producerTaxId)) {
      throw new ValidationFailedError('El CUIT del productor no es válido (dígito verificador)');
    }
    const type = await this.assetsRepository.typeByCode(command.assetTypeCode);
    if (!type) throw new ValidationFailedError('Tipo de garantía inexistente');
    const token = randomToken();
    const request = await this.dataSource.transaction(async (manager) => {
      const role = await manager.findOneByOrFail(RoleEntity, { code: 'PRODUCER' });
      const producer = await manager.save(
        manager.create(UserEntity, {
          organizationId: user.organizationId,
          roleId: role.id,
          email: `productor+${randomToken(6).toLowerCase()}@invitacion.agrogarantias.local`,
          fullName: command.producerName.trim(),
          // Sin contraseña utilizable y deshabilitado para login: accede solo con el link.
          passwordHash: `!invitation-only:${randomToken(16)}`,
          status: 'DISABLED',
        }),
      );
      const created = await manager.save(
        manager.create(GuaranteeRequestEntity, {
          organizationId: user.organizationId,
          producerName: command.producerName.trim(),
          producerTaxId: command.producerTaxId,
          producerEmail: command.producerEmail?.trim() || null,
          producerUserId: producer.id,
          assetTypeCode: type.code,
          requestedAmount: command.requestedAmount ?? null,
          currency: command.currency ?? 'USD',
          notes: command.notes?.trim() || null,
          status: 'INVITED',
          inviteTokenHash: sha256Hex(token),
          inviteExpiresAt: new Date(Date.now() + INVITATION_DAYS * DAY_MS),
          createdBy: user.userId,
        }),
      );
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.GUARANTEE_REQUEST_CREATED,
          resourceType: 'guarantee_request',
          resourceId: created.id,
          metadata: { producerTaxId: created.producerTaxId, assetTypeCode: created.assetTypeCode },
          context,
        },
        manager,
      );
      return created;
    });
    return {
      ...(await this.detail(user.organizationId, request.id)),
      invitation: this.invitation(token, request.inviteExpiresAt),
    };
  }

  /** Genera un link nuevo (el anterior deja de funcionar). */
  async renewInvitation(user: AuthenticatedUser, id: string, context: RequestContext) {
    const request = await this.requests.findOneBy({ id, organizationId: user.organizationId });
    if (!request) throw new NotFoundError('Solicitud de garantía', id);
    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITATION_DAYS * DAY_MS);
    await this.requests.update(
      { id },
      { inviteTokenHash: sha256Hex(token), inviteExpiresAt: expiresAt },
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.GUARANTEE_REQUEST_INVITATION_RENEWED,
      resourceType: 'guarantee_request',
      resourceId: id,
      context,
    });
    return this.invitation(token, expiresAt);
  }

  async list(organizationId: string) {
    const rows = await this.requests.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return Promise.all(rows.map((r) => this.present(r)));
  }

  async detail(organizationId: string, id: string) {
    const request = await this.requests.findOneBy({ id, organizationId });
    if (!request) throw new NotFoundError('Solicitud de garantía', id);
    return this.present(request);
  }

  // ------------------------------------------------------------------ productor
  async resolveToken(token: string): Promise<GuaranteeRequestEntity> {
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw new NotFoundError('Solicitud de garantía');
    const request = await this.requests.findOneBy({ inviteTokenHash: sha256Hex(token) });
    if (!request) throw new NotFoundError('Solicitud de garantía');
    if (request.inviteExpiresAt.getTime() < Date.now()) {
      throw new ForbiddenActionError('El link de la solicitud venció: pedí uno nuevo a la entidad');
    }
    return request;
  }

  async producerView(token: string) {
    return this.present(await this.resolveToken(token), { forProducer: true });
  }

  async producerCreateEstablishment(
    token: string,
    command: CreateEstablishmentCommand,
    context: RequestContext,
  ) {
    const request = await this.editable(token);
    if (request.establishmentId)
      throw new ConflictError('La solicitud ya tiene un establecimiento');
    const producer = await this.producerUser(request);
    // Si el establecimiento ya está registrado con el mismo RENSPA y el mismo CUIT del titular se
    // reutiliza. Puede haber más de uno con ese RENSPA: se prioriza el del mismo titular y solo se
    // rechaza si el RENSPA pertenece únicamente a otros titulares.
    const [existing] = command.renspa
      ? ((await this.dataSource.query(
          `SELECT id, holder_tax_id = $3 AS "sameHolder" FROM establishments
           WHERE organization_id = $1 AND renspa = $2 AND deleted_at IS NULL
           ORDER BY (holder_tax_id = $3) DESC, created_at ASC LIMIT 1`,
          [request.organizationId, command.renspa, command.holderTaxId],
        )) as { id: string; sameHolder: boolean }[])
      : [];
    if (existing && !existing.sameHolder) {
      throw new ConflictError('El RENSPA ya está registrado a nombre de otro titular');
    }
    const establishment =
      existing ?? (await this.establishments.create(producer, command, context));
    await this.requests.update(
      { id: request.id },
      { establishmentId: establishment.id, status: 'IN_PROGRESS' },
    );
    return this.producerView(token);
  }

  async producerCreateAsset(
    token: string,
    command: Omit<CreateAssetCommand, 'establishmentId' | 'assetTypeCode'>,
    context: RequestContext,
  ) {
    const request = await this.editable(token);
    if (!request.establishmentId)
      throw new ValidationFailedError('Primero registrá el establecimiento');
    if (request.assetId) throw new ConflictError('La solicitud ya tiene un activo declarado');
    const producer = await this.producerUser(request);
    const { asset } = await this.assets.create(
      producer,
      {
        ...command,
        establishmentId: request.establishmentId,
        assetTypeCode: request.assetTypeCode,
      },
      context,
    );
    await this.requests.update({ id: request.id }, { assetId: asset.id, status: 'IN_PROGRESS' });
    return this.producerView(token);
  }

  async producerUploadDocument(
    token: string,
    file: UploadedFile | undefined,
    command: UploadDocumentCommand,
    context: RequestContext,
  ) {
    const request = await this.editable(token);
    if (!request.assetId) throw new ValidationFailedError('Primero declará el activo');
    const producer = await this.producerUser(request);
    return this.documents.uploadForAsset(producer, request.assetId, file, command, context);
  }

  async producerUploadEvidence(
    token: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    command: UploadEvidenceCommand,
    context: RequestContext,
  ) {
    const request = await this.editable(token);
    if (!request.assetId) throw new ValidationFailedError('Primero declará el activo');
    const producer = await this.producerUser(request);
    return this.evidence.uploadManual(producer, request.assetId, file, command, context);
  }

  /** El productor confirma su declaración: queda lista y AgroGarantías ejecuta la verificación. */
  async producerSubmit(token: string, context: RequestContext) {
    const request = await this.editable(token);
    const view = await this.present(request);
    if (view.missing.length > 0) {
      throw new ValidationFailedError(`Falta completar: ${view.missing.join(', ')}`);
    }
    const producer = await this.producerUser(request);
    await this.requests.update(
      { id: request.id },
      { status: 'READY_FOR_VERIFICATION', submittedAt: new Date() },
    );
    await this.audit.record({
      actor: { kind: 'user', user: producer },
      action: AUDIT_ACTIONS.GUARANTEE_REQUEST_SUBMITTED,
      resourceType: 'guarantee_request',
      resourceId: request.id,
      metadata: { assetId: request.assetId },
      context,
    });
    const run = await this.verifications.request(
      { kind: 'system', organizationId: request.organizationId, process: 'guarantee-request' },
      { assetId: request.assetId!, note: 'Declaración del productor completada', trigger: 'API' },
    );
    await this.requests.update({ id: request.id }, { verificationRunId: run.id });
    return this.producerView(token);
  }

  // ------------------------------------------------------------------ helpers
  private async editable(token: string) {
    const request = await this.resolveToken(token);
    if (request.status === 'READY_FOR_VERIFICATION') {
      throw new ConflictError('La declaración ya fue enviada y no puede modificarse');
    }
    return request;
  }

  /** Identidad del productor para reutilizar los servicios existentes (auditoría incluida). */
  private async producerUser(request: GuaranteeRequestEntity): Promise<AuthenticatedUser> {
    const user = await this.dataSource.getRepository(UserEntity).findOneOrFail({
      where: { id: request.producerUserId },
      relations: { organization: true },
    });
    return {
      userId: user.id,
      organizationId: request.organizationId,
      organizationName: user.organization?.name ?? '',
      email: user.email,
      fullName: user.fullName,
      role: 'PRODUCER',
      roleName: 'Productor',
      permissions: new Set(),
      authenticatedVia: 'bearer',
    };
  }

  private invitation(token: string, expiresAt: Date) {
    const base = this.config.env.WEB_ORIGIN.replace(/\/$/, '');
    return { url: `${base}/solicitud/${token}`, expiresAt };
  }

  private async present(request: GuaranteeRequestEntity, options: { forProducer?: boolean } = {}) {
    const q = (sql: string, params: unknown[]) =>
      this.dataSource.query(sql, params) as Promise<Record<string, unknown>[]>;
    const [[org], [type], [establishment], [asset], counts, [verification], alerts] =
      await Promise.all([
        q(`SELECT name, kind FROM organizations WHERE id = $1`, [request.organizationId]),
        q(
          `SELECT code, name, default_unit AS unit, verification_strategy AS "verificationStrategy",
                  metadata_schema AS "metadataSchema", evidence_sources AS "evidenceSources"
           FROM asset_types WHERE code = $1`,
          [request.assetTypeCode],
        ),
        request.establishmentId
          ? q(
              `SELECT e.id, e.name, e.province, e.locality, e.renspa, ST_AsGeoJSON(l.point)::json AS point
               FROM establishments e LEFT JOIN establishment_locations l
                 ON l.establishment_id = e.id AND l.kind = 'MAIN' WHERE e.id = $1`,
              [request.establishmentId],
            )
          : Promise.resolve([]),
        request.assetId
          ? q(
              `SELECT id, name, declared_quantity::float AS "declaredQuantity", unit, status,
                      ST_AsGeoJSON(location)::json AS location, area IS NOT NULL AS "hasArea"
               FROM assets WHERE id = $1`,
              [request.assetId],
            )
          : Promise.resolve([]),
        request.assetId
          ? q(
              `SELECT (SELECT count(*)::int FROM evidence WHERE asset_id = $1 AND type = 'IMAGE') AS evidence,
                      (SELECT count(*)::int FROM documents WHERE asset_id = $1) AS documents`,
              [request.assetId],
            )
          : Promise.resolve([{ evidence: 0, documents: 0 }]),
        request.verificationRunId && !options.forProducer
          ? q(
              `SELECT r.id AS "runId", r.status, r.completed_at AS "completedAt", res.outcome,
                      res.declared_quantity::float AS "declaredQuantity",
                      res.detected_quantity::float AS "detectedQuantity",
                      res.match_percentage::float AS "matchPercentage", res.final_score AS "finalScore",
                      res.confidence::float AS confidence, res.risk_level AS "riskLevel"
               FROM verification_runs r LEFT JOIN verification_results res ON res.verification_run_id = r.id
               WHERE r.asset_id = $1 ORDER BY r.queued_at DESC LIMIT 1`,
              [request.assetId],
            )
          : Promise.resolve([]),
        request.assetId && !options.forProducer
          ? q(
              `SELECT id, type, severity, title, status, created_at AS "createdAt" FROM alerts
               WHERE asset_id = $1 AND status <> 'RESOLVED' ORDER BY created_at DESC LIMIT 20`,
              [request.assetId],
            )
          : Promise.resolve([]),
      ]);
    const c = (counts[0] ?? { evidence: 0, documents: 0 }) as {
      evidence: number;
      documents: number;
    };
    const vegetation = type?.verificationStrategy === 'VEGETATION_AREA';
    const missing: string[] = [];
    if (!establishment) missing.push('establecimiento');
    if (!asset) missing.push('activo declarado');
    // Los activos con vegetación se verifican por satélite; el resto requiere fotos de campo.
    if (asset && !vegetation && c.evidence === 0) missing.push('evidencia (fotos)');
    if (asset && vegetation && !asset.hasArea) missing.push('polígono del lote');

    const stage = verification?.outcome
      ? 'VERIFIED'
      : request.status === 'READY_FOR_VERIFICATION'
        ? verification?.status === 'FAILED'
          ? 'VERIFICATION_FAILED'
          : 'READY_FOR_VERIFICATION'
        : request.status;
    return {
      id: request.id,
      status: request.status,
      stage,
      requester: { name: org?.name ?? '', kind: org?.kind ?? null },
      producer: {
        name: request.producerName,
        taxId: request.producerTaxId,
        email: options.forProducer ? undefined : request.producerEmail,
      },
      guaranteeType: type ?? { code: request.assetTypeCode },
      requestedAmount: request.requestedAmount,
      currency: request.currency,
      notes: request.notes,
      inviteExpiresAt: request.inviteExpiresAt,
      submittedAt: request.submittedAt,
      createdAt: request.createdAt,
      establishment: establishment ?? null,
      asset: asset ?? null,
      evidenceCount: c.evidence,
      documentCount: c.documents,
      missing,
      verification: options.forProducer ? undefined : (verification ?? null),
      alerts: options.forProducer ? undefined : alerts,
    };
  }
}
