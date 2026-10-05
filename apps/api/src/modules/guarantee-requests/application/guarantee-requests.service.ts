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
import { CollateralService } from '../../collateral/application/collateral.service.js';
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
import { crossSources } from './cross-sources.js';
import {
  OBLIGATION_LABELS,
  productsFor,
  REQUIREMENT_CATALOG,
  type RequirementCode,
} from '../../documents/domain/document-requirements.js';
import {
  DEFAULT_PRODUCT_BY_ASSET_TYPE,
  RequestDocumentationService,
} from './request-documentation.service.js';
import { presentDocument } from '../../documents/presentation/documents.controller.js';
import { presentEvidence } from '../../evidence/presentation/evidence.presenter.js';
import { GuaranteeRequestEntity } from '../infrastructure/guarantee-request.entity.js';
import {
  InformationRequestEntity,
  type InformationRequestKind,
} from '../infrastructure/information-request.entity.js';
import { PasswordHasher } from '../../auth/application/password-hasher.js';
import { livestockProfile } from '../../assets/domain/livestock-profile.js';
import {
  EVIDENCE_STATUS_BY_QUALITY,
  isLowerBound,
  SCAN_MODE_LABELS,
  STILL_MODES,
  type ScanMode,
  type ScanQuality,
} from '../../scans/domain/scan.types.js';

/** Documentos del titular o del inmueble: se registran a nivel establecimiento. */
const ESTABLISHMENT_LEVEL_DOCUMENTS = new Set([
  'RENSPA',
  'PROPERTY_DEED',
  'LEASE_CONTRACT',
  'ID_CUIT',
]);

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
  /** Producto de crédito (checklist documental). Por defecto, el base del tipo de garantía. */
  creditProductCode?: string;
  /** Requisitos del producto que no aplican a esta solicitud. */
  notApplicableRequirements?: string[];
  /** Establecimiento ya registrado del productor (no se le vuelve a pedir). */
  establishmentId?: string;
}

/** Solo para "Simular solicitud": mismos servicios, datos marcados DEMO. */
export interface CreateRequestOptions {
  dataSource?: 'REAL' | 'DEMO';
  demoScenario?: string;
  producerEmail?: string;
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
    @InjectRepository(InformationRequestEntity)
    private readonly infoRequests: Repository<InformationRequestEntity>,
    private readonly hasher: PasswordHasher,
    private readonly dataSource: DataSource,
    private readonly config: AppConfig,
    private readonly assetsRepository: AssetsRepository,
    private readonly establishments: EstablishmentsService,
    private readonly assets: AssetsService,
    private readonly documentsService: DocumentsService,
    private readonly evidence: EvidenceService,
    private readonly verifications: VerificationRequestService,
    private readonly audit: AuditService,
    private readonly documentation: RequestDocumentationService,
    private readonly collateral: CollateralService,
  ) {}

  // ------------------------------------------------------------------ banco
  async create(
    user: AuthenticatedUser,
    command: CreateGuaranteeRequestCommand,
    context: RequestContext,
    options: CreateRequestOptions = {},
  ) {
    if (!isValidCuit(command.producerTaxId)) {
      throw new ValidationFailedError('El CUIT del productor no es válido (dígito verificador)');
    }
    const type = await this.assetsRepository.typeByCode(command.assetTypeCode);
    if (!type) throw new ValidationFailedError('Tipo de garantía inexistente');
    const productCode = command.creditProductCode ?? DEFAULT_PRODUCT_BY_ASSET_TYPE[type.code];
    if (command.establishmentId) {
      // Establecimiento ya registrado: tiene que ser de la entidad y del mismo titular.
      const [est] = (await this.dataSource.query(
        `SELECT holder_tax_id AS "holderTaxId" FROM establishments
           WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [command.establishmentId, user.organizationId],
      )) as { holderTaxId: string }[];
      if (!est) throw new NotFoundError('Establecimiento', command.establishmentId);
      if (est.holderTaxId.replace(/\D/g, '') !== command.producerTaxId.replace(/\D/g, ''))
        throw new ValidationFailedError('El establecimiento es de otro titular');
    }
    const token = randomToken();
    const request = await this.dataSource.transaction(async (manager) => {
      const role = await manager.findOneByOrFail(RoleEntity, { code: 'PRODUCER' });
      const producer = await manager.save(
        manager.create(UserEntity, {
          organizationId: user.organizationId,
          roleId: role.id,
          email:
            options.producerEmail ??
            `productor+${randomToken(6).toLowerCase()}@invitacion.agrogarantias.local`,
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
          creditProductCode: productCode ?? null,
          dataSource: options.dataSource ?? 'REAL',
          demoScenario: options.demoScenario ?? null,
          establishmentId: command.establishmentId ?? null,
        }),
      );
      // Garantía bovina: nace con la solicitud (pendiente de la declaración del productor).
      if (type.code === 'BOVINOS') await this.collateral.createForRequest(manager, created);
      if (productCode)
        await this.documentation.initialize(
          manager,
          created,
          productCode,
          command.notApplicableRequirements ?? [],
        );
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.GUARANTEE_REQUEST_CREATED,
          resourceType: 'guarantee_request',
          resourceId: created.id,
          metadata: {
            producerTaxId: created.producerTaxId,
            assetTypeCode: created.assetTypeCode,
            creditProductCode: created.creditProductCode,
            dataSource: created.dataSource,
          },
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

  /**
   * Datos para crear una solicitud rápido: productos de crédito del tipo de garantía y
   * productores que la entidad ya tiene (con sus establecimientos), para no volver a pedirlos.
   */
  async creationOptions(organizationId: string, assetTypeCode: string) {
    const producers = (await this.dataSource.query(
      `SELECT DISTINCT ON (r.producer_tax_id) r.producer_name AS name, r.producer_tax_id AS "taxId",
              r.producer_email AS email, r.data_source = 'DEMO' AS demo
         FROM guarantee_requests r WHERE r.organization_id = $1
         ORDER BY r.producer_tax_id, r.created_at DESC`,
      [organizationId],
    )) as { name: string; taxId: string; email: string | null; demo: boolean }[];
    const establishments = (await this.dataSource.query(
      `SELECT id, name, province, locality, renspa, holder_tax_id AS "holderTaxId",
              data_source = 'DEMO' AS demo
         FROM establishments WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name`,
      [organizationId],
    )) as { id: string; holderTaxId: string }[];
    const digits = (v: string) => v.replace(/\D/g, '');
    return {
      products: productsFor(assetTypeCode).map((p) => ({
        ...p,
        requirements: p.requirements.map((r) => ({
          ...r,
          name: REQUIREMENT_CATALOG[r.code].name,
          obligationLabel: OBLIGATION_LABELS[r.obligation],
        })),
      })),
      defaultProductCode: DEFAULT_PRODUCT_BY_ASSET_TYPE[assetTypeCode] ?? null,
      producers: producers
        .filter((p) => !p.demo)
        .map((p) => ({
          ...p,
          establishments: establishments.filter((e) => digits(e.holderTaxId) === digits(p.taxId)),
        })),
    };
  }

  async setRequirementApplicability(
    user: AuthenticatedUser,
    id: string,
    code: string,
    command: { notApplicable: boolean; note?: string },
    context: RequestContext,
  ) {
    const request = await this.requests.findOneBy({ id, organizationId: user.organizationId });
    if (!request) throw new NotFoundError('Solicitud de garantía', id);
    await this.documentation.setApplicability(user, request, code, command, context);
    return this.present(request);
  }

  // ------------------------------------------------------------------ productor: invitación
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

  /**
   * Aceptación de la invitación: el productor crea su acceso (email + contraseña) sobre su
   * usuario PRODUCER. Desde entonces el link deja de ser credencial y entra con su cuenta.
   * Si ya tiene cuenta de productor en la misma entidad, la solicitud se suma a esa cuenta.
   */
  async acceptInvitation(
    token: string,
    command: { email: string; password: string; fullName?: string },
    context: RequestContext,
  ) {
    const request = await this.resolveToken(token);
    if (request.acceptedAt) {
      throw new ConflictError('La invitación ya fue aceptada: ingresá con tu email y contraseña');
    }
    const email = command.email.trim().toLowerCase();
    const users = this.dataSource.getRepository(UserEntity);
    const existing = await users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.role', 'role')
      .where('lower(u.email) = :email', { email })
      .andWhere('u.deletedAt IS NULL')
      .getOne();
    let producerUserId = request.producerUserId;
    if (existing && existing.id !== request.producerUserId) {
      const sameProducer =
        existing.role?.code === 'PRODUCER' &&
        existing.organizationId === request.organizationId &&
        existing.status === 'ACTIVE' &&
        (await this.hasher.verify(existing.passwordHash, command.password));
      if (!sameProducer) {
        throw new ConflictError(
          'Ese email ya tiene una cuenta. Si es tuya, usá la misma contraseña para sumar esta solicitud.',
        );
      }
      producerUserId = existing.id;
    } else {
      await users.update(
        { id: request.producerUserId },
        {
          email,
          passwordHash: await this.hasher.hash(command.password),
          status: 'ACTIVE',
          ...(command.fullName?.trim() ? { fullName: command.fullName.trim() } : {}),
        },
      );
    }
    await this.requests.update(
      { id: request.id },
      {
        producerUserId,
        acceptedAt: new Date(),
        status: request.status === 'INVITED' ? 'IN_PROGRESS' : request.status,
      },
    );
    await this.audit.record({
      actor: {
        kind: 'user',
        user: await this.producerUser(
          Object.assign(new GuaranteeRequestEntity(), request, { producerUserId }),
        ),
      },
      action: AUDIT_ACTIONS.GUARANTEE_REQUEST_ACCEPTED,
      resourceType: 'guarantee_request',
      resourceId: request.id,
      metadata: { linkedToExistingAccount: producerUserId !== request.producerUserId },
      context,
    });
    return { email, requestId: request.id };
  }

  /** Operaciones por link: válidas solo mientras la invitación no fue aceptada. */
  private async byToken(token: string) {
    const request = await this.resolveToken(token);
    if (request.acceptedAt) {
      throw new ForbiddenActionError('La invitación ya fue aceptada: ingresá con tu cuenta');
    }
    return request;
  }

  async producerCreateEstablishment(
    token: string,
    command: CreateEstablishmentCommand,
    context: RequestContext,
  ) {
    await this.establishmentFor(await this.byToken(token), command, context);
    return this.producerView(token);
  }

  async producerCreateAsset(
    token: string,
    command: Omit<CreateAssetCommand, 'establishmentId' | 'assetTypeCode'>,
    context: RequestContext,
  ) {
    await this.assetFor(await this.byToken(token), command, context);
    return this.producerView(token);
  }

  async producerUploadDocument(
    token: string,
    file: UploadedFile | undefined,
    command: UploadDocumentCommand,
    context: RequestContext,
  ) {
    return this.documentFor(await this.byToken(token), file, command, context);
  }

  async producerUploadEvidence(
    token: string,
    file: UploadedFile | undefined,
    command: UploadEvidenceCommand,
    context: RequestContext,
  ) {
    return this.evidenceFor(await this.byToken(token), file, command, context);
  }

  async producerSubmit(token: string, context: RequestContext) {
    await this.submitFor(await this.byToken(token), context);
    return this.producerView(token);
  }

  // ------------------------------------------------------------------ productor: portal (sesión)
  /** Solicitud del productor autenticado (rol PRODUCER, solo las propias). */
  async mine(user: AuthenticatedUser, id: string): Promise<GuaranteeRequestEntity> {
    if (user.role !== 'PRODUCER')
      throw new ForbiddenActionError('Acceso exclusivo para productores');
    const request = await this.requests.findOneBy({
      id,
      producerUserId: user.userId,
      organizationId: user.organizationId,
    });
    if (!request) throw new NotFoundError('Solicitud de garantía', id);
    return request;
  }

  /** Inicio del portal: solicitudes, tareas, establecimientos y activos del productor. */
  async overview(user: AuthenticatedUser) {
    if (user.role !== 'PRODUCER')
      throw new ForbiddenActionError('Acceso exclusivo para productores');
    const rows = await this.requests.find({
      where: { producerUserId: user.userId, organizationId: user.organizationId },
      order: { createdAt: 'DESC' },
    });
    const requests = await Promise.all(rows.map((r) => this.present(r, { forProducer: true })));
    const establishments = new Map<string, unknown>();
    const assets = new Map<string, unknown>();
    for (const r of requests) {
      if (r.establishment) establishments.set(String(r.establishment.id), r.establishment);
      if (r.asset)
        assets.set(String(r.asset.id), {
          ...r.asset,
          requestId: r.id,
          guaranteeType: r.guaranteeType,
        });
    }
    return {
      producer: { name: user.fullName, email: user.email },
      requests,
      tasks: requests.flatMap((r) =>
        r.tasks.map((t) => ({ ...t, requestId: r.id, assetName: r.asset?.name ?? null })),
      ),
      establishments: [...establishments.values()],
      assets: [...assets.values()],
    };
  }

  /** El productor ve un documento de su propia solicitud (URL firmada, para el visor). */
  async producerDocumentUrl(
    user: AuthenticatedUser,
    id: string,
    documentId: string,
    context: RequestContext,
  ) {
    const request = await this.mine(user, id);
    return this.documentsService.viewUrlForRequest(
      user,
      {
        organizationId: request.organizationId,
        assetId: request.assetId,
        establishmentId: request.establishmentId,
      },
      documentId,
      context,
    );
  }

  async producerDetail(user: AuthenticatedUser, id: string) {
    const request = await this.mine(user, id);
    const view = await this.present(request, { forProducer: true });
    const [documents, evidence] = await Promise.all([
      request.assetId
        ? this.documentsService.listForAsset(request.organizationId, request.assetId)
        : null,
      request.assetId ? this.evidence.listForAsset(request.organizationId, request.assetId) : [],
    ]);
    return {
      ...view,
      documents: documents
        ? {
            documents: documents.documents.map((d) =>
              presentDocument(d, documents.analyses.get(d.id)),
            ),
            requirements: documents.requirements,
          }
        : null,
      evidence: evidence.map((e) => presentEvidence(e.evidence, e.url)),
    };
  }

  async establishmentFor(
    request: GuaranteeRequestEntity,
    command: CreateEstablishmentCommand,
    context: RequestContext,
  ) {
    this.assertDeclarationOpen(request);
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
             AND data_source = 'REAL' AND $4::text = 'REAL'
           ORDER BY (holder_tax_id = $3) DESC, created_at ASC LIMIT 1`,
          [request.organizationId, command.renspa, command.holderTaxId, request.dataSource],
        )) as { id: string; sameHolder: boolean }[])
      : [];
    if (existing && !existing.sameHolder) {
      throw new ConflictError('El RENSPA ya está registrado a nombre de otro titular');
    }
    const establishment =
      existing ??
      (await this.establishments.create(
        producer,
        { ...command, dataSource: request.dataSource },
        context,
      ));
    await this.requests.update(
      { id: request.id },
      { establishmentId: establishment.id, status: 'IN_PROGRESS' },
    );
  }

  async assetFor(
    request: GuaranteeRequestEntity,
    command: Omit<CreateAssetCommand, 'establishmentId' | 'assetTypeCode'>,
    context: RequestContext,
  ) {
    this.assertDeclarationOpen(request);
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
        dataSource: request.dataSource,
      },
      context,
    );
    await this.requests.update({ id: request.id }, { assetId: asset.id, status: 'IN_PROGRESS' });
  }

  /**
   * Documentación: se puede aportar también después de enviar la declaración (no la modifica).
   * Los documentos del titular/inmueble quedan a nivel establecimiento, como en la vista bancaria.
   */
  async documentFor(
    request: GuaranteeRequestEntity,
    file: UploadedFile | undefined,
    command: UploadDocumentCommand,
    context: RequestContext,
  ) {
    if (!request.assetId || !request.establishmentId)
      throw new ValidationFailedError('Primero declará el activo');
    const producer = await this.producerUser(request);
    return ESTABLISHMENT_LEVEL_DOCUMENTS.has(command.type)
      ? this.documentsService.uploadForEstablishment(
          producer,
          request.establishmentId,
          file,
          command,
          context,
        )
      : this.documentsService.uploadForAsset(producer, request.assetId, file, command, context);
  }

  /** Evidencia nueva (fotos): siempre permitida; no modifica la declaración enviada. */
  async evidenceFor(
    request: GuaranteeRequestEntity,
    file: UploadedFile | undefined,
    command: UploadEvidenceCommand,
    context: RequestContext,
  ) {
    if (!request.assetId) throw new ValidationFailedError('Primero declará el activo');
    const producer = await this.producerUser(request);
    return this.evidence.uploadManual(producer, request.assetId, file, command, context);
  }

  /** El productor confirma su declaración: queda inmutable y AgroGarantías ejecuta la verificación. */
  async submitFor(request: GuaranteeRequestEntity, context: RequestContext) {
    this.assertDeclarationOpen(request);
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
    // La declaración queda congelada (versión 1, inmutable) en la garantía bovina.
    if (request.assetTypeCode === 'BOVINOS')
      await this.collateral.freezeDeclaration(request.id, producer);
    await this.runVerification(request, 'Declaración del productor completada');
  }

  // ------------------------------------------------------------------ pedidos de información
  async requestInformation(
    user: AuthenticatedUser,
    id: string,
    command: {
      kind: InformationRequestKind;
      documentType?: string;
      requirementCode?: string;
      message?: string;
    },
    context: RequestContext,
  ) {
    const request = await this.requests.findOneBy({ id, organizationId: user.organizationId });
    if (!request) throw new NotFoundError('Solicitud de garantía', id);
    // Un requisito del checklist se puede pedir desde que existe la solicitud; un pedido libre
    // (evidencia, otro documento) requiere el activo declarado.
    const requirement = command.requirementCode
      ? await this.documentation.requirement(request, command.requirementCode)
      : null;
    if (!requirement && !request.assetId) {
      throw new ValidationFailedError('El productor todavía no declaró el activo');
    }
    const message =
      command.message?.trim() ||
      (requirement ? `${requirement.name}: ${requirement.purpose} ${requirement.howTo}` : '');
    if (!message) throw new ValidationFailedError('Indicá qué información necesitás');
    const created = await this.infoRequests.save(
      this.infoRequests.create({
        organizationId: user.organizationId,
        guaranteeRequestId: id,
        kind: requirement ? 'DOCUMENT' : command.kind,
        documentType: requirement
          ? requirement.documentTypes[0]!
          : command.kind === 'DOCUMENT'
            ? (command.documentType ?? null)
            : null,
        requirementCode: requirement?.code ?? null,
        message: message.slice(0, 500),
        status: 'OPEN',
        requestedBy: user.userId,
      }),
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.INFORMATION_REQUESTED,
      resourceType: 'guarantee_request',
      resourceId: id,
      metadata: {
        informationRequestId: created.id,
        kind: created.kind,
        documentType: created.documentType,
        requirementCode: created.requirementCode,
      },
      context,
    });
    return this.present(request);
  }

  /**
   * El productor indica que respondió el pedido. Exige al menos un aporte nuevo del tipo
   * pedido posterior al pedido; si la declaración ya fue enviada, AgroGarantías vuelve a verificar.
   */
  async respondInformation(
    user: AuthenticatedUser,
    id: string,
    informationRequestId: string,
    context: RequestContext,
  ) {
    const request = await this.mine(user, id);
    const info = await this.infoRequests.findOneBy({
      id: informationRequestId,
      guaranteeRequestId: id,
    });
    if (!info) throw new NotFoundError('Pedido de información', informationRequestId);
    if (info.status !== 'OPEN') throw new ConflictError('El pedido ya fue respondido');
    const [row] = (await this.dataSource.query(
      info.kind === 'EVIDENCE'
        ? `SELECT count(*)::int AS n FROM evidence WHERE asset_id = $1 AND type IN ('IMAGE','SCAN') AND created_at > $2`
        : `SELECT count(*)::int AS n FROM documents WHERE (asset_id = $1 OR establishment_id = $3)
             AND created_at > $2 AND ($4::text[] IS NULL OR type = ANY($4::text[]))`,
      info.kind === 'EVIDENCE'
        ? [request.assetId, info.createdAt]
        : [
            request.assetId,
            info.createdAt,
            request.establishmentId,
            info.requirementCode && info.requirementCode in REQUIREMENT_CATALOG
              ? [...REQUIREMENT_CATALOG[info.requirementCode as RequirementCode].documentTypes]
              : info.documentType
                ? [info.documentType]
                : null,
          ],
    )) as { n: number }[];
    if (!row || row.n === 0) {
      throw new ValidationFailedError(
        info.kind === 'EVIDENCE' ? 'Agregá al menos una foto nueva' : 'Subí el documento pedido',
      );
    }
    await this.infoRequests.update(
      { id: info.id },
      { status: 'RESPONDED', respondedAt: new Date() },
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.INFORMATION_RESPONDED,
      resourceType: 'guarantee_request',
      resourceId: id,
      metadata: { informationRequestId: info.id, kind: info.kind, contributions: row.n },
      context,
    });
    if (request.status === 'READY_FOR_VERIFICATION') {
      await this.runVerification(
        request,
        'Nueva evidencia/documentación aportada por el productor',
      );
    }
    return this.producerDetail(user, id);
  }

  // ------------------------------------------------------------------ helpers
  private assertDeclarationOpen(request: GuaranteeRequestEntity) {
    if (request.status === 'READY_FOR_VERIFICATION') {
      throw new ConflictError('La declaración ya fue enviada y no puede modificarse');
    }
  }

  /** Ejecuta la verificación existente; si ya hay una en curso, se conserva esa. */
  private async runVerification(request: GuaranteeRequestEntity, note: string) {
    try {
      const run = await this.verifications.request(
        { kind: 'system', organizationId: request.organizationId, process: 'guarantee-request' },
        { assetId: request.assetId!, note, trigger: 'API' },
      );
      await this.requests.update({ id: request.id }, { verificationRunId: run.id });
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
    }
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
    const [
      [org],
      [type],
      [establishment],
      [asset],
      counts,
      [verification],
      alerts,
      docs,
      info,
      [guarantee],
    ] = await Promise.all([
      q(`SELECT name, kind FROM organizations WHERE id = $1`, [request.organizationId]),
      q(
        `SELECT code, name, default_unit AS unit, verification_strategy AS "verificationStrategy",
                  metadata_schema AS "metadataSchema", evidence_sources AS "evidenceSources",
                  required_documents AS "requiredDocuments", evidence_guidance AS "evidenceGuidance"
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
                      ST_AsGeoJSON(location)::json AS location, area IS NOT NULL AS "hasArea",
                      (SELECT data FROM asset_metadata m WHERE m.asset_id = assets.id
                        ORDER BY version DESC LIMIT 1) AS metadata
               FROM assets WHERE id = $1`,
            [request.assetId],
          )
        : Promise.resolve([]),
      request.assetId
        ? q(
            `SELECT (SELECT count(*)::int FROM evidence WHERE asset_id = $1 AND type IN ('IMAGE','SCAN')) AS evidence,
                      (SELECT count(*)::int FROM documents
                        WHERE asset_id = $1 OR (asset_id IS NULL AND establishment_id = $2)) AS documents`,
            [request.assetId, request.establishmentId],
          )
        : Promise.resolve([{ evidence: 0, documents: 0 }]),
      request.verificationRunId
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
               WHERE asset_id = $1 AND status NOT IN ('RESOLVED','DISMISSED') ORDER BY created_at DESC LIMIT 20`,
            [request.assetId],
          )
        : Promise.resolve([]),
      request.assetId
        ? q(
            `SELECT type, status FROM documents
               WHERE asset_id = $1 OR (asset_id IS NULL AND establishment_id = $2)`,
            [request.assetId, request.establishmentId],
          )
        : Promise.resolve([]),
      q(
        `SELECT id, kind, document_type AS "documentType", requirement_code AS "requirementCode",
                  message, status, created_at AS "createdAt", responded_at AS "respondedAt"
           FROM information_requests WHERE guarantee_request_id = $1 ORDER BY created_at DESC`,
        [request.id],
      ),
      request.assetId
        ? q(`SELECT id FROM guarantees WHERE asset_id = $1 AND status = 'ACTIVE' LIMIT 1`, [
            request.assetId,
          ])
        : Promise.resolve([]),
    ]);
    const scans = (await this.dataSource.query(
      `SELECT id, mode, status, started_at AS "startedAt", duration_s::float AS "durationS",
              official_count AS "officialCount", quality,
              (client_result->>'netCount')::int AS "deviceCount",
              server_result->'metrics'->>'coverageViews' AS "coverageViews",
              server_result->'guidance' AS guidance,
              (server_result->'chute'->>'rfidSimulated')::boolean AS "rfidSimulated",
              (server_result->'chute'->>'confirmed')::int AS "chuteConfirmed",
              (server_result->'chute'->>'ambiguous')::int AS "chuteAmbiguous",
              (server_result->'chute'->>'insufficient')::int AS "chuteInsufficient",
              jsonb_array_length(warnings) AS "warningCount", error
         FROM scan_sessions WHERE guarantee_request_id = $1 ORDER BY started_at DESC LIMIT 20`,
      [request.id],
    )) as Record<string, unknown>[];
    const counting =
      verification?.outcome && !options.forProducer
        ? await this.countingBreakdown(String(verification.runId))
        : null;
    const sources =
      asset &&
      request.establishmentId &&
      !options.forProducer &&
      type?.verificationStrategy === 'LIVESTOCK_COUNTING'
        ? await crossSources(this.dataSource, {
            organizationId: request.organizationId,
            assetId: String(asset.id),
            establishmentId: request.establishmentId,
            declaredQuantity: (asset.declaredQuantity as number | null) ?? null,
            runId: verification?.outcome ? String(verification.runId) : null,
            uniqueEstimate:
              counting?.uniqueEstimate ??
              (verification?.detectedQuantity as number | null | undefined) ??
              null,
            possibleOverlap: counting?.possibleOverlap ?? false,
          })
        : undefined;
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

    // Documentación requerida por el tipo de activo (misma regla que la ficha del activo).
    const requiredDocuments = ((type?.requiredDocuments as string[] | undefined) ?? []).map(
      (requirement) => {
        const alternatives = requirement.split('|');
        const match = (docs as { type: string; status: string }[]).find(
          (d) => alternatives.includes(d.type) && d.status !== 'REJECTED',
        );
        return {
          requirement,
          alternatives,
          satisfied: Boolean(match),
          status: match?.status ?? null,
        };
      },
    );
    // Checklist del producto de crédito (si la solicitud tiene uno); si no, la regla histórica
    // del tipo de activo. Para avanzar solo cuentan los OBLIGATORIOS sin documento.
    const [documentation, dataLayers] = await Promise.all([
      this.documentation.checklist(request, options),
      options.forProducer ? Promise.resolve(null) : this.documentation.dataLayers(request),
    ]);
    const missingDocuments: { name: string; requested?: boolean }[] = documentation
      ? documentation.items
          .filter((i) => i.obligation === 'MANDATORY' && i.status === 'PENDING')
          .map((i) => ({ name: i.name, requested: Boolean(i.requested) }))
      : requiredDocuments
          .filter((r) => !r.satisfied)
          .map((r) => ({ name: r.alternatives.join(' o ') }));
    const openInfo = (info as { status: string }[]).filter((i) => i.status === 'OPEN');

    const stage = verification?.outcome
      ? 'VERIFIED'
      : request.status === 'READY_FOR_VERIFICATION'
        ? verification?.status === 'FAILED'
          ? 'VERIFICATION_FAILED'
          : 'READY_FOR_VERIFICATION'
        : request.status;
    const submitted = request.status === 'READY_FOR_VERIFICATION';
    const verifying =
      verification && ['PENDING', 'PROCESSING'].includes(String(verification.status));
    // Estado comprensible para el productor (sin estados técnicos).
    const producerStatus = guarantee
      ? 'FINALIZED'
      : openInfo.length > 0
        ? 'INFO_REQUIRED'
        : submitted
          ? verification?.outcome
            ? 'VERIFIED'
            : verifying
              ? 'VERIFYING'
              : 'READY_FOR_VERIFICATION'
          : !request.acceptedAt && request.status === 'INVITED'
            ? 'INVITATION_PENDING'
            : !establishment || !asset
              ? 'PREPARING'
              : missing.length > 0
                ? 'PENDING_EVIDENCE'
                : missingDocuments.length > 0
                  ? 'PENDING_DOCUMENTATION'
                  : 'PREPARING';

    const step = (done: boolean, warn = false) => (done ? 'DONE' : warn ? 'PENDING' : 'TODO');
    const progress = [
      { key: 'request', label: 'Solicitud', state: 'DONE' },
      { key: 'establishment', label: 'Establecimiento', state: step(Boolean(establishment)) },
      { key: 'asset', label: 'Activo', state: step(Boolean(asset)) },
      {
        key: 'evidence',
        label: 'Evidencia',
        state: asset
          ? step(!missing.some((m) => m.startsWith('evidencia') || m.startsWith('polígono')), true)
          : 'TODO',
      },
      {
        key: 'documents',
        label: 'Documentación',
        state: asset ? step(missingDocuments.length === 0, true) : 'TODO',
      },
      {
        key: 'verification',
        label: 'Verificación',
        state: verification?.outcome ? 'DONE' : submitted ? 'IN_PROGRESS' : 'TODO',
      },
      { key: 'result', label: 'Resultado', state: verification?.outcome ? 'DONE' : 'TODO' },
    ];

    // Tareas pendientes del productor, en el orden en que conviene resolverlas.
    const assetName = (asset?.name as string | undefined) ?? 'el activo';
    const requesterName = (org?.name as string | undefined) ?? 'La entidad';
    const typeName = (type?.name as string | undefined) ?? 'Activo';
    const tasks: {
      kind: string;
      title: string;
      description: string;
      informationRequestId?: string;
      documentType?: string | null;
      requirementCode?: string | null;
    }[] = [];
    for (const i of info as {
      id: string;
      kind: string;
      documentType: string | null;
      requirementCode: string | null;
      message: string;
      status: string;
    }[]) {
      if (i.status !== 'OPEN') continue;
      const requirement =
        i.requirementCode && i.requirementCode in REQUIREMENT_CATALOG
          ? REQUIREMENT_CATALOG[i.requirementCode as RequirementCode]
          : null;
      tasks.push({
        kind: i.kind === 'EVIDENCE' ? 'INFO_EVIDENCE' : 'INFO_DOCUMENT',
        title: requirement
          ? `${requesterName} solicita: ${requirement.name}`
          : `${requesterName} solicita ${i.kind === 'EVIDENCE' ? 'más evidencia' : 'documentación adicional'}`,
        description: requirement ? `${requirement.purpose} ${requirement.howTo}` : i.message,
        informationRequestId: i.id,
        documentType: i.documentType,
        requirementCode: i.requirementCode,
      });
    }
    if (!submitted) {
      if (!establishment)
        tasks.push({
          kind: 'ESTABLISHMENT',
          title: 'Registrar el establecimiento',
          description: 'Dónde está el activo que ofrecés en garantía.',
        });
      else if (!asset)
        tasks.push({
          kind: 'ASSET',
          title: 'Declarar el activo',
          description: `${typeName}: qué ofrecés y cuánto.`,
        });
      else {
        if (missing.length > 0)
          tasks.push({
            kind: 'EVIDENCE',
            title: vegetation ? 'Delimitar el lote' : `Agregar evidencia de ${assetName}`,
            description:
              (type?.evidenceGuidance as string | undefined) ?? 'Agregá fotos del activo.',
          });
        // Lo que la entidad ya pidió aparece como su propia tarea: no se repite acá.
        const notRequested = missingDocuments.filter((d) => !d.requested);
        if (notRequested.length > 0)
          tasks.push({
            kind: 'DOCUMENTS',
            title: 'Completar documentación',
            description: `Falta: ${notRequested.map((d) => d.name).join(', ')}.`,
          });
        if (missing.length === 0)
          tasks.push({
            kind: 'SUBMIT',
            title: 'Enviar la declaración',
            description: 'Revisá y enviá para que AgroGarantías verifique.',
          });
      }
    }

    return {
      id: request.id,
      status: request.status,
      stage,
      producerStatus,
      progress,
      tasks,
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
      acceptedAt: request.acceptedAt,
      submittedAt: request.submittedAt,
      createdAt: request.createdAt,
      establishment: establishment ?? null,
      asset: asset ? ({ ...asset, metadata: undefined } as typeof asset) : null,
      // Ganadería: tipo de producción y métodos recomendados (feedlot / cría / pastoreo).
      livestockProfile:
        request.assetTypeCode === 'BOVINOS' && asset
          ? livestockProfile((asset.metadata as Record<string, unknown> | null) ?? null)
          : null,
      evidenceCount: c.evidence,
      documentCount: c.documents,
      requiredDocuments,
      documentation,
      dataLayers,
      dataSource: request.dataSource,
      demoScenario: request.demoScenario,
      creditProductCode: request.creditProductCode,
      missing,
      informationRequests: info,
      // El productor ve el estado de la verificación, no la evaluación (score/alertas) de la entidad.
      verification: options.forProducer
        ? verification
          ? { status: verification.status, completed: Boolean(verification.outcome) }
          : null
        : verification
          ? { ...verification, counting }
          : null,
      alerts: options.forProducer ? undefined : alerts,
      crossSources: sources,
      scans: scans.map((scan) => {
        const mode = scan.mode as ScanMode;
        const quality = scan.quality as ScanQuality | null;
        return {
          ...scan,
          coverageViews: scan.coverageViews === null ? null : Number(scan.coverageViews),
          guidance: scan.guidance ?? [],
          modeLabel: SCAN_MODE_LABELS[mode],
          lowerBound: isLowerBound(mode, scan.rfidSimulated as boolean | null),
          stillAnimals: STILL_MODES.includes(mode),
          evidenceStatus: quality ? EVIDENCE_STATUS_BY_QUALITY[quality] : null,
        };
      }),
    };
  }

  /**
   * Desglose del conteo de una corrida: detecciones por imagen, suma ingenua, animales únicos
   * estimados y advertencia de posible duplicación (ver verification/domain/unique-count.ts).
   */
  private async countingBreakdown(runId: string) {
    const [photos, metrics, [run]] = await Promise.all([
      this.dataSource.query(
        `SELECT ve.evidence_id AS "evidenceId", ve.role, ve.detected_count AS "detectedCount",
                ve.confidence::float AS confidence, ve.exclusion_reason AS "exclusionReason",
                e.captured_at AS "capturedAt", e.device_id IS NOT NULL AS "fromCamera",
                e.metadata->>'originalFileName' AS "fileName"
           FROM verification_evidence ve JOIN evidence e ON e.id = ve.evidence_id
          WHERE ve.verification_run_id = $1 ORDER BY e.captured_at`,
        [runId],
      ) as Promise<Record<string, unknown>[]>,
      this.dataSource.query(
        `SELECT key, value::float AS value FROM verification_metrics
          WHERE verification_run_id = $1
            AND key IN ('detections_sum','unique_estimated','overlap_groups','detection_confidence')`,
        [runId],
      ) as Promise<{ key: string; value: number }[]>,
      this.dataSource.query(
        `SELECT anomalies FROM verification_results WHERE verification_run_id = $1`,
        [runId],
      ) as Promise<{ anomalies: { code: string; message: string; details?: unknown }[] }[]>,
    ]);
    if (photos.length === 0) return null;
    const m = Object.fromEntries(metrics.map((x) => [x.key, x.value]));
    const overlap = (run?.anomalies ?? []).find((a) => a.code === 'POSSIBLE_EVIDENCE_DUPLICATION');
    return {
      photos,
      // Corridas anteriores a la estimación de únicos no tienen estas métricas.
      detectionsSum: m['detections_sum'] ?? null,
      uniqueEstimate: m['unique_estimated'] ?? null,
      overlapGroups: m['overlap_groups'] ?? null,
      confidence: m['detection_confidence'] ?? null,
      possibleOverlap: Boolean(overlap),
      overlapMessage: overlap?.message ?? null,
      overlapDetails: overlap?.details ?? null,
    };
  }
}
