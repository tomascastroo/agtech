import { CollateralCommandsService } from '../../collateral/application/collateral-commands.service.js';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { randomToken } from '../../../common/crypto/hashing.js';
import {
  CapabilityNotAvailableError,
  ForbiddenActionError,
  ValidationFailedError,
} from '../../../common/domain/errors.js';
import { AppConfig } from '../../../config/app-config.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import type { DocumentType } from '../../documents/domain/document.types.js';
import { GuaranteeRequestsService } from '../../guarantee-requests/application/guarantee-requests.service.js';
import { GuaranteeRequestEntity } from '../../guarantee-requests/infrastructure/guarantee-request.entity.js';
import {
  DEMO_DOCUMENT_TYPES,
  DEMO_PRODUCER,
  DEMO_SCENARIOS,
  demoScenario,
} from '../domain/demo-scenarios.js';

const DOCUMENT_TITLES: Record<string, string> = {
  'constancia-cuit': 'Constancia de CUIT (documento de demostración)',
  renspa: 'Constancia RENSPA (documento de demostración)',
  'renspa-inconsistente': 'Constancia RENSPA (documento de demostración)',
  'certificado-vacunacion': 'Certificado de vacunación (documento de demostración)',
  'contrato-arrendamiento': 'Contrato de arrendamiento (documento de demostración)',
};
const DEMO_PHOTOS = ['CAM-LE-01.jpg', 'CAM-LE-02.jpg', 'CAM-LE-03.jpg', 'CAM-LE-04.jpg'];

/**
 * "Simular solicitud": arma una solicitud de garantía completa y navegable con datos FICTICIOS,
 * llamando a los MISMOS servicios que una solicitud real (crear, aceptar la invitación, declarar
 * establecimiento y activo, cargar documentos y fotos, enviar, pedir documentación). No hay
 * modelos ni base paralelos: los datos quedan marcados data_source = DEMO y los documentos pasan
 * por el OCR real. Se puede desactivar con DEMO_MODE=disabled.
 */
@Injectable()
export class DemoService {
  constructor(
    private readonly requests: GuaranteeRequestsService,
    @InjectRepository(GuaranteeRequestEntity)
    private readonly entities: Repository<GuaranteeRequestEntity>,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly collateral: CollateralCommandsService,
  ) {}

  get enabled(): boolean {
    return this.config.env.DEMO_MODE === 'enabled';
  }

  scenarios() {
    return {
      enabled: this.enabled,
      producer: DEMO_PRODUCER,
      scenarios: DEMO_SCENARIOS.map((s) => ({
        code: s.code,
        name: s.name,
        description: s.description,
        shows: s.shows,
      })),
    };
  }

  async create(user: AuthenticatedUser, scenarioCode: string, context: RequestContext) {
    if (!this.enabled) throw new ForbiddenActionError('El modo demostración está desactivado');
    const scenario = demoScenario(scenarioCode);
    if (!scenario) throw new ValidationFailedError('Escenario de demostración inexistente');
    // Se leen todos los archivos ANTES de crear nada: si faltan, no queda una demo a medias.
    const files = await this.loadFiles(scenario.documents, scenario.photos);
    const suffix = randomToken(4)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, 'x');
    const email = `juan.perez.${suffix}@demo.agrogarantias.invalid`;
    const password = `Demo-${randomToken(9)}`;

    // 1. La entidad crea la solicitud (mismo servicio que "Crear solicitud").
    const created = await this.requests.create(
      user,
      {
        producerName: DEMO_PRODUCER.name,
        producerTaxId: DEMO_PRODUCER.taxId,
        producerEmail: email,
        assetTypeCode: 'BOVINOS',
        requestedAmount: 450_000,
        currency: 'USD',
        notes: `DATOS DE DEMOSTRACIÓN – ${scenario.name}`,
      },
      context,
      { dataSource: 'DEMO', demoScenario: scenario.code, producerEmail: email },
    );
    const token = String(created.invitation.url).split('/solicitud/')[1]!;

    // 2. El productor ficticio acepta la invitación (crea su acceso).
    await this.requests.acceptInvitation(
      token,
      { email, password, fullName: DEMO_PRODUCER.name },
      context,
    );

    // 3. Declara establecimiento y activo.
    await this.requests.establishmentFor(
      await this.entity(created.id),
      {
        name: DEMO_PRODUCER.establishment,
        holderName: DEMO_PRODUCER.name,
        holderTaxId: DEMO_PRODUCER.taxId,
        renspa: DEMO_PRODUCER.renspa,
        establishmentType: scenario.system === 'FEEDLOT' ? 'FEEDLOT' : 'CRIA',
        tenure: 'LEASED',
        province: DEMO_PRODUCER.province,
        locality: DEMO_PRODUCER.locality,
        totalAreaHa: 1200,
        location: DEMO_PRODUCER.location,
      },
      context,
    );
    await this.requests.assetFor(
      await this.entity(created.id),
      {
        name:
          scenario.system === 'FEEDLOT'
            ? 'Feedlot La Esperanza (demo)'
            : 'Rodeo de cría La Esperanza (demo)',
        declaredQuantity: scenario.heads ?? 1500,
        metadata: {
          sistema_productivo: scenario.system === 'FEEDLOT' ? 'Feedlot' : 'Cría',
          raza_predominante: 'Aberdeen Angus',
        },
      },
      context,
    );

    // 4. Documentos de demostración (OCR real) y fotos.
    for (const doc of scenario.documents) {
      const buffer = files.documents.get(doc)!;
      await this.requests.documentFor(
        await this.entity(created.id),
        { buffer, originalname: `${doc}-demo.png`, mimetype: 'image/png', size: buffer.length },
        {
          type: DEMO_DOCUMENT_TYPES[doc] as DocumentType,
          title: DOCUMENT_TITLES[doc],
          dataSource: 'DEMO',
        },
        context,
      );
    }
    for (const [photo, buffer] of files.photos) {
      await this.requests.evidenceFor(
        await this.entity(created.id),
        { buffer, originalname: `demo-${photo}`, mimetype: 'image/jpeg', size: buffer.length },
        {
          capturedAt: new Date().toISOString(),
          latitude: DEMO_PRODUCER.location.latitude,
          longitude: DEMO_PRODUCER.location.longitude,
          accuracyM: 12,
          locationSource: 'DEVICE_GPS',
          description: 'Foto de demostración (imagen de ejemplo, no del establecimiento)',
        },
        context,
      );
    }

    // 5. Estado del escenario: pedidos de la entidad y/o envío del productor.
    for (const code of scenario.requestRequirements) {
      await this.requests.requestInformation(
        user,
        created.id,
        { kind: 'DOCUMENT', requirementCode: code },
        context,
      );
    }
    if (scenario.submit) await this.requests.submitFor(await this.entity(created.id), context);
    if (scenario.collateral)
      await this.collateralLifecycle(user, created.id, scenario.collateral, context);

    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.DEMO_REQUEST_CREATED,
      resourceType: 'guarantee_request',
      resourceId: created.id,
      metadata: { scenario: scenario.code },
      context,
    });
    const [guarantee] = (await this.entities.manager.query(
      `SELECT id FROM bovine_guarantees WHERE guarantee_request_id = $1`,
      [created.id],
    )) as { id: string }[];
    return {
      requestId: created.id,
      guaranteeId: guarantee?.id ?? null,
      scenario: { code: scenario.code, name: scenario.name },
      // Acceso del productor ficticio (para mostrar su portal en la presentación).
      producerAccess: { email, password },
      demo: true,
    };
  }

  /**
   * Ciclo de la garantía bovina con los MISMOS comandos que usa la entidad. Todo queda en una
   * garantía DEMO; el inspector, los montos, el peso y el precio son ficticios y lo dicen.
   */
  private async collateralLifecycle(
    user: AuthenticatedUser,
    requestId: string,
    mode: 'VERIFIED' | 'INSPECTION',
    context: RequestContext,
  ) {
    const [g] = (await this.entities.manager.query(
      `SELECT id FROM bovine_guarantees WHERE guarantee_request_id = $1`,
      [requestId],
    )) as { id: string }[];
    if (!g) return;
    const today = new Date().toISOString().slice(0, 10);
    const DEMO = 'Valor ficticio de demostración';
    await this.collateral.update(
      user,
      g.id,
      {
        legalInstrument: 'PRENDA_FIJA',
        legalIdentifier: 'DEMO-0001',
        legalStatus: 'INSCRIPTA',
        lienPriority: 1,
        immobilizationStatus: 'SOLICITADA',
        amount: 450_000,
        debtAmount: 380_000,
        currency: 'USD',
        grantedAt: today,
        averageWeightKg: 380,
        weightSource: DEMO,
        pricePerKg: 1.9,
        priceCurrency: 'USD',
        priceSource: DEMO,
        priceDate: today,
        qualityFactor: 0.9,
      },
      context,
    );
    await this.collateral.recordMovement(
      user,
      g.id,
      {
        direction: 'EGRESO',
        kind: 'VENTA',
        heads: 25,
        destination: 'Frigorífico (demo)',
        occurredAt: new Date().toISOString(),
        notes: 'Movimiento de demostración',
      },
      context,
    );
    const inspection = (
      observedHeads: number,
      minutesAgo: number,
      result: 'CONFORME' | 'NO_CONFORME',
    ) =>
      this.collateral.recordInspection(
        user,
        g.id,
        null,
        {
          inspectorName: 'Inspector de demostración',
          performedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
          latitude: DEMO_PRODUCER.location.latitude,
          longitude: DEMO_PRODUCER.location.longitude,
          observedHeads,
          fullCount: true,
          observations: 'Inspección de demostración: conteo en manga.',
          discrepancies:
            result === 'NO_CONFORME'
              ? [{ topic: 'Cantidad', description: 'Corrales 4 y 5 vacíos (demo)' }]
              : [],
          result,
          signatureName: 'Inspector de demostración',
          signatureAccepted: true,
        },
        context,
      );
    await inspection(975, mode === 'INSPECTION' ? 60 : 1, 'CONFORME');
    if (mode === 'INSPECTION') await inspection(720, 1, 'NO_CONFORME');
  }

  private entity(id: string) {
    return this.entities.findOneByOrFail({ id });
  }

  private async loadFiles(documents: string[], photos: number) {
    const dir = this.assetsDir();
    const read = async (path: string) => {
      try {
        return await readFile(join(dir, path));
      } catch {
        throw new CapabilityNotAvailableError(
          `Faltan los archivos de demostración (${path}). Configurá SEED_ASSETS_DIR con la carpeta infra/seed-assets.`,
        );
      }
    };
    const loadedDocuments = new Map<string, Buffer>();
    for (const doc of documents)
      loadedDocuments.set(doc, await read(join('demo-documents', `${doc}.png`)));
    const loadedPhotos: [string, Buffer][] = [];
    for (const photo of DEMO_PHOTOS.slice(0, photos))
      loadedPhotos.push([photo, await read(join('cameras', photo))]);
    return { documents: loadedDocuments, photos: loadedPhotos };
  }

  private assetsDir(): string {
    return (
      this.config.env.SEED_ASSETS_DIR ??
      fileURLToPath(new URL('../../../../../../infra/seed-assets', import.meta.url))
    );
  }
}
