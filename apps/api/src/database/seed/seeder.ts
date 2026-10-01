import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataSource, EntityManager } from 'typeorm';
import { PERMISSION_DESCRIPTIONS, ROLE_DEFINITIONS } from '../../common/auth/permissions.js';
import { sha256Hex } from '../../common/crypto/hashing.js';
import type { GeoMultiPolygon, Position } from '../../common/geo/geojson.js';
import {
  EVALUATORS,
  type AlertEvaluationContext,
} from '../../modules/alerts/domain/alert-evaluation.js';
import { AlertRuleEntity } from '../../modules/alerts/infrastructure/alert-rule.entity.js';
import { AlertEntity } from '../../modules/alerts/infrastructure/alert.entity.js';
import { AnimalIdentificationEntity } from '../../modules/animals/infrastructure/animal-identification.entity.js';
import { AnimalObservationEntity } from '../../modules/animals/infrastructure/animal-observation.entity.js';
import {
  AnimalEntity,
  type AnimalCategory,
} from '../../modules/animals/infrastructure/animal.entity.js';
import {
  defaultMaxEvidenceAgeHours,
  statusAfterVerification,
} from '../../modules/assets/domain/asset-status.js';
import { AssetMetadataEntity } from '../../modules/assets/infrastructure/asset-metadata.entity.js';
import { AssetTypeEntity } from '../../modules/assets/infrastructure/asset-type.entity.js';
import { AssetEntity } from '../../modules/assets/infrastructure/asset.entity.js';
import { GuaranteeEntity } from '../../modules/assets/infrastructure/guarantee.entity.js';
import { AuditLogEntity } from '../../modules/audit/infrastructure/audit-log.entity.js';
import { PasswordHasher } from '../../modules/auth/application/password-hasher.js';
import { AiModelVersionEntity } from '../../modules/computer-vision/infrastructure/ai-model-version.entity.js';
import { AiModelEntity } from '../../modules/computer-vision/infrastructure/ai-model.entity.js';
import { DeviceInstallationEntity } from '../../modules/devices/infrastructure/device-installation.entity.js';
import { DeviceEntity } from '../../modules/devices/infrastructure/device.entity.js';
import { DocumentEntity } from '../../modules/documents/infrastructure/document.entity.js';
import { EstablishmentLocationEntity } from '../../modules/establishments/infrastructure/establishment-location.entity.js';
import { EstablishmentEntity } from '../../modules/establishments/infrastructure/establishment.entity.js';
import { EvidenceSourceEntity } from '../../modules/evidence/infrastructure/evidence-source.entity.js';
import { EvidenceEntity } from '../../modules/evidence/infrastructure/evidence.entity.js';
import { ExternalDataSnapshotEntity } from '../../modules/external-data/infrastructure/external-data-snapshot.entity.js';
import { MockLivestockRegistryProvider } from '../../modules/external-data/infrastructure/mock-livestock-registry.provider.js';
import { MonitoringConfigurationEntity } from '../../modules/monitoring/infrastructure/monitoring-configuration.entity.js';
import { MonitoringEventEntity } from '../../modules/monitoring/infrastructure/monitoring-event.entity.js';
import { OrganizationEntity } from '../../modules/organizations/infrastructure/organization.entity.js';
import {
  MockSatelliteProvider,
  sceneConfidence,
} from '../../modules/satellite/infrastructure/mock-satellite.provider.js';
import { SatelliteImageEntity } from '../../modules/satellite/infrastructure/satellite-image.entity.js';
import { SatelliteObservationEntity } from '../../modules/satellite/infrastructure/satellite-observation.entity.js';
import { DEFAULT_SCORING_WEIGHTS } from '../../modules/scoring/domain/scoring.config.js';
import { ScoringEngine } from '../../modules/scoring/domain/scoring-engine.js';
import { matchRatio } from '../../modules/scoring/domain/scoring.math.js';
import type {
  HistoricalRunInput,
  RegistryStatus,
  ScoringInput,
} from '../../modules/scoring/domain/scoring.types.js';
import type { ObjectStorage } from '../../modules/storage/object-storage.js';
import { storageKeys } from '../../modules/storage/storage-keys.js';
import { PermissionEntity } from '../../modules/users/infrastructure/permission.entity.js';
import { RoleEntity } from '../../modules/users/infrastructure/role.entity.js';
import { UserEntity } from '../../modules/users/infrastructure/user.entity.js';
import {
  buildSummary,
  unitLabel,
} from '../../modules/verification/application/pipeline/summary.js';
import {
  PIPELINE_VERSION,
  type Anomaly,
} from '../../modules/verification/domain/verification.types.js';
import { VerificationEvidenceEntity } from '../../modules/verification/infrastructure/verification-evidence.entity.js';
import { VerificationMetricEntity } from '../../modules/verification/infrastructure/verification-metric.entity.js';
import { VerificationResultEntity } from '../../modules/verification/infrastructure/verification-result.entity.js';
import { VerificationRunEntity } from '../../modules/verification/infrastructure/verification-run.entity.js';
import { AI_MODELS, ALERT_RULES, ASSET_TYPES, EVIDENCE_SOURCES } from './catalog.js';
import { demoDocumentPdf } from './demo-documents.js';
import {
  ASSETS,
  ESTABLISHMENTS,
  LE_ANIMAL_CATEGORIES,
  ORGANIZATION,
  SECOND_ORG_USER,
  SECOND_ORGANIZATION,
  USERS,
  type DemoAsset,
  type DemoEstablishment,
} from './demo-data.js';
import { offsetPoint, parcel, toPoint } from './geo.js';

interface Quality {
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
  contrast: number;
  dhash: string;
  score: number;
  issues: string[];
}

interface Manifest {
  cameras: {
    serial: string;
    label: string;
    file: string;
    measured_count: number;
    confidence: number;
    quality: Quality;
  }[];
  satellite: { name: string; file: string }[];
  objects: { name: string; label: string; file: string; quality: Quality }[];
}

interface SeededEstablishment {
  entity: EstablishmentEntity;
  demo: DemoEstablishment;
  boundary: GeoMultiPolygon;
}

interface EvidenceLinkSeed {
  evidence: EvidenceEntity;
  detectedCount: number | null;
  confidence: number | null;
  analysis: Record<string, unknown>;
  modelVersionId: string | null;
}

export interface SeedResult {
  organizationId: string;
  latestRunIds: string[];
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const COUNTER_MODEL = { code: 'classical-livestock-counter', version: '1.0.0', simulated: false };
const QUALITY_MODEL = { code: 'image-quality-metrics', version: '1.0.0', simulated: false };
const NDVI_MODEL = { code: 'simulated-ndvi-analyzer', version: '1.0.0', simulated: true };

/**
 * Carga el catálogo del sistema y una cartera demo completa. El historial de verificaciones se
 * calcula con el mismo motor de scoring que usa el pipeline, de modo que los números son
 * coherentes y reproducibles.
 */
export class DemoSeeder {
  private readonly scoring = new ScoringEngine();
  private readonly registry = new MockLivestockRegistryProvider();
  private manifest!: Manifest;
  private organizationId!: string;
  private users = new Map<string, string>();
  private types = new Map<string, AssetTypeEntity>();
  private sources = new Map<string, EvidenceSourceEntity>();
  private models = new Map<string, string>();
  private latestRunIds: string[] = [];

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ObjectStorage,
    private readonly options: { assetsDir: string; demoPassword: string; now?: Date },
  ) {}

  private get now(): Date {
    return this.options.now ?? new Date();
  }

  private at(daysAgo: number, hourUtc = 13): Date {
    const date = new Date(this.now.getTime() - daysAgo * DAY_MS);
    date.setUTCHours(hourUtc, 0, 0, 0);
    return date;
  }

  async run(): Promise<SeedResult> {
    this.manifest = JSON.parse(
      await readFile(join(this.options.assetsDir, 'manifest.json'), 'utf8'),
    ) as Manifest;
    await this.uploadSimulatedCameraFeeds();
    await this.dataSource.transaction(async (m) => {
      await this.seedCatalog(m);
      await this.seedOrganizations(m);
      const establishments = new Map<string, SeededEstablishment>();
      for (const demo of ESTABLISHMENTS)
        establishments.set(demo.key, await this.seedEstablishment(m, demo));
      const establishmentDocs = new Set<string>();
      for (const asset of ASSETS) {
        await this.seedAsset(m, asset, establishments.get(asset.establishment)!, establishmentDocs);
      }
      await this.seedSecondOrganization(m);
    });
    return { organizationId: this.organizationId, latestRunIds: this.latestRunIds };
  }

  // ------------------------------------------------------------------ catálogo
  private async seedCatalog(m: EntityManager) {
    const permissions = new Map<string, PermissionEntity>();
    for (const [code, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
      permissions.set(code, await m.save(m.create(PermissionEntity, { code, description })));
    }
    for (const [code, def] of Object.entries(ROLE_DEFINITIONS)) {
      await m.save(
        m.create(RoleEntity, {
          code,
          name: def.name,
          description: def.description,
          permissions: def.permissions.map((p) => permissions.get(p)!),
        }),
      );
    }
    for (const [index, type] of ASSET_TYPES.entries()) {
      this.types.set(
        type.code,
        await m.save(m.create(AssetTypeEntity, { ...type, sortOrder: index, isActive: true })),
      );
    }
    for (const source of EVIDENCE_SOURCES) {
      this.sources.set(source.code, await m.save(m.create(EvidenceSourceEntity, source)));
    }
    for (const model of AI_MODELS) {
      const entity = await m.save(
        m.create(AiModelEntity, {
          code: model.code,
          name: model.name,
          task: model.task,
          provider: model.provider,
          description: model.description,
        }),
      );
      const version = await m.save(
        m.create(AiModelVersionEntity, {
          modelId: entity.id,
          version: model.version,
          isSimulated: model.isSimulated,
          status: 'ACTIVE',
          metrics: model.metrics,
          releasedAt: this.at(120),
        }),
      );
      this.models.set(`${model.code}@${model.version}`, version.id);
    }
    for (const rule of ALERT_RULES) {
      await m.save(m.create(AlertRuleEntity, { ...rule, organizationId: null, enabled: true }));
    }
  }

  private async seedOrganizations(m: EntityManager) {
    const org = await m.save(m.create(OrganizationEntity, { ...ORGANIZATION, settings: {} }));
    this.organizationId = org.id;
    const hash = await new PasswordHasher().hash(this.options.demoPassword);
    for (const user of USERS) {
      const role = await m.findOneByOrFail(RoleEntity, { code: user.role });
      const saved = await m.save(
        m.create(UserEntity, {
          organizationId: org.id,
          roleId: role.id,
          email: user.email,
          fullName: user.fullName,
          passwordHash: hash,
          status: 'ACTIVE',
        }),
      );
      this.users.set(user.email, saved.id);
    }
  }

  private get maria(): string {
    return this.users.get(USERS[0]!.email)!;
  }

  // ------------------------------------------------------------------ establecimientos
  private async seedEstablishment(
    m: EntityManager,
    demo: DemoEstablishment,
  ): Promise<SeededEstablishment> {
    const created = this.at(60, 12);
    const entity = await m.save(
      m.create(EstablishmentEntity, {
        organizationId: this.organizationId,
        name: demo.name,
        holderName: demo.holderName,
        holderTaxId: demo.holderTaxId,
        renspa: demo.renspa,
        establishmentType: demo.type,
        tenure: demo.tenure,
        province: demo.province,
        locality: demo.locality,
        totalAreaHa: demo.areaHa,
        createdBy: this.maria,
        createdAt: created,
        updatedAt: created,
      }),
    );
    const boundary = parcel(demo.center, demo.areaHa);
    await m.save(
      m.create(EstablishmentLocationEntity, {
        organizationId: this.organizationId,
        establishmentId: entity.id,
        kind: 'MAIN',
        name: 'Casco principal',
        point: toPoint(demo.center),
        boundary,
      }),
    );
    await this.audit(m, 'ESTABLISHMENT_CREATED', 'establishment', entity.id, created, {
      name: demo.name,
    });
    return { entity, demo, boundary };
  }

  // ------------------------------------------------------------------ activos
  private async seedAsset(
    m: EntityManager,
    demo: DemoAsset,
    establishment: SeededEstablishment,
    establishmentDocs: Set<string>,
  ) {
    const type = this.types.get(demo.typeCode)!;
    const createdAt = this.at(Math.max(...demo.history.map((h) => h.daysAgo), 10) + 5, 12);
    const center = establishment.demo.center;
    const assetCenter = demo.areaHa ? offsetPoint(center, 150, 120) : center;
    const asset = await m.save(
      m.create(AssetEntity, {
        organizationId: this.organizationId,
        establishmentId: establishment.entity.id,
        assetTypeId: type.id,
        name: demo.name,
        status: demo.status === 'DRAFT' ? 'DRAFT' : 'PENDING_VERIFICATION',
        declaredQuantity: demo.declaredQuantity,
        unit: type.defaultUnit,
        declaredValue: demo.declaredValueUsd,
        currency: 'USD',
        location: toPoint(assetCenter),
        area: demo.areaHa ? parcel(assetCenter, demo.areaHa, 1.25, 0.04) : null,
        createdBy: this.maria,
        createdAt,
        updatedAt: createdAt,
      }),
    );
    await m.save(
      m.create(AssetMetadataEntity, {
        organizationId: this.organizationId,
        assetId: asset.id,
        version: 1,
        data: demo.metadata,
        createdBy: this.maria,
        createdAt,
      }),
    );
    await this.audit(m, 'ASSET_CREATED', 'asset', asset.id, createdAt, {
      type: type.code,
      declaredQuantity: demo.declaredQuantity,
    });

    const documents = await this.seedDocuments(
      m,
      demo,
      asset,
      establishment,
      establishmentDocs,
      createdAt,
    );
    const installations = await this.seedDevices(m, demo, asset, establishment, createdAt);
    if (demo.satelliteScene) {
      await this.storage.putObject({
        key: storageKeys.simulatedSatelliteFeed(asset.id),
        body: await this.asset('satellite', demo.satelliteScene),
        contentType: 'image/jpeg',
      });
    }

    const history: {
      input: HistoricalRunInput;
      runId: string;
      detected: number | null;
      at: Date;
    }[] = [];
    for (const [index, spec] of demo.history.entries()) {
      const run = await this.seedVerification(
        m,
        demo,
        asset,
        type,
        establishment,
        documents,
        installations,
        spec,
        index,
        history,
      );
      history.push(run);
    }
    const last = history.at(-1);
    if (last) {
      const result = await m.findOneByOrFail(VerificationResultEntity, {
        verificationRunId: last.runId,
      });
      await m.update(
        AssetEntity,
        { id: asset.id },
        {
          status: statusAfterVerification(result.outcome),
          lastVerificationRunId: last.runId,
          lastVerifiedAt: last.at,
          lastScore: result.finalScore,
          lastDetectedQuantity: result.detectedQuantity,
        },
      );
      this.latestRunIds.push(last.runId);
    }
    const lastRunAt = last?.at ?? null;
    await m.save(
      m.create(MonitoringConfigurationEntity, {
        organizationId: this.organizationId,
        assetId: asset.id,
        enabled: true,
        intervalHours: demo.monitoringIntervalHours,
        maxEvidenceAgeHours:
          demo.maxEvidenceAgeHours ?? defaultMaxEvidenceAgeHours(type.verificationStrategy),
        lastRunAt,
        nextRunAt: lastRunAt
          ? new Date(
              Math.max(
                lastRunAt.getTime() + demo.monitoringIntervalHours * HOUR_MS,
                this.now.getTime() + 20 * HOUR_MS,
              ),
            )
          : null,
      }),
    );

    if (demo.guarantee && history[0]) {
      const first = history[0];
      const firstResult = await m.findOneByOrFail(VerificationResultEntity, {
        verificationRunId: first.runId,
      });
      const covered = Math.min(
        firstResult.detectedQuantity ?? demo.declaredQuantity,
        demo.declaredQuantity,
      );
      const guarantee = await m.save(
        m.create(GuaranteeEntity, {
          organizationId: this.organizationId,
          assetId: asset.id,
          verificationRunId: first.runId,
          status: 'ACTIVE',
          coveredQuantity: covered,
          valuation: Math.round((demo.declaredValueUsd * covered) / demo.declaredQuantity),
          currency: 'USD',
          confirmedBy: this.maria,
          confirmedAt: new Date(first.at.getTime() + 20 * HOUR_MS),
        }),
      );
      await this.audit(m, 'GUARANTEE_CONFIRMED', 'guarantee', guarantee.id, guarantee.confirmedAt, {
        assetId: asset.id,
      });
      await this.event(
        m,
        asset.id,
        null,
        'GUARANTEE_CONFIRMED',
        'Activo confirmado como garantía por María López',
        guarantee.confirmedAt,
      );
    }

    await this.seedAlerts(m, demo, asset, type, establishment, history.at(-1)?.at ?? null);
    if (demo.key === 'LE-BOV') await this.seedAnimals(m, asset, establishment, installations);
  }

  private async seedDocuments(
    m: EntityManager,
    demo: DemoAsset,
    asset: AssetEntity,
    establishment: SeededEstablishment,
    establishmentDocs: Set<string>,
    createdAt: Date,
  ): Promise<DocumentEntity[]> {
    const saved: DocumentEntity[] = [];
    for (const doc of demo.documents) {
      const dedupeKey = `${establishment.entity.id}:${doc.type}`;
      if (doc.scope === 'ESTABLISHMENT') {
        if (establishmentDocs.has(dedupeKey)) continue;
        establishmentDocs.add(dedupeKey);
      }
      const body = await demoDocumentPdf({
        title: doc.title,
        issuer:
          doc.type === 'RENSPA'
            ? 'SENASA — Registro Nacional Sanitario de Productores Agropecuarios'
            : establishment.demo.holderName,
        fields: [
          ...doc.fields,
          ['Emisión', doc.issuedAt],
          ['Vencimiento', doc.expiresAt ?? 'Sin vencimiento'],
        ],
      });
      const key = storageKeys.document(this.organizationId, 'pdf');
      const sha256 = sha256Hex(body);
      await this.storage.putObject({
        key,
        body,
        contentType: 'application/pdf',
        metadata: { sha256 },
      });
      const uploadedAt = new Date(createdAt.getTime() + 2 * HOUR_MS);
      const entity = await m.save(
        m.create(DocumentEntity, {
          organizationId: this.organizationId,
          establishmentId: establishment.entity.id,
          assetId: doc.scope === 'ASSET' ? asset.id : null,
          type: doc.type,
          status: doc.status,
          title: doc.title,
          originalFileName: `${doc.title.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}.pdf`,
          storageKey: key,
          mimeType: 'application/pdf',
          sizeBytes: body.length,
          sha256,
          issuedAt: doc.issuedAt,
          expiresAt: doc.expiresAt,
          uploadedBy: this.maria,
          reviewedBy: doc.status === 'VALID' ? this.users.get(USERS[1]!.email)! : null,
          reviewedAt: doc.status === 'VALID' ? new Date(uploadedAt.getTime() + DAY_MS) : null,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        }),
      );
      await this.audit(m, 'USER_UPLOADED_DOCUMENT', 'document', entity.id, uploadedAt, {
        type: doc.type,
        sha256,
      });
      saved.push(entity);
    }
    // Documentos del establecimiento cargados por otro activo del mismo establecimiento.
    const shared = await m.find(DocumentEntity, {
      where: { establishmentId: establishment.entity.id },
    });
    const ids = new Set(saved.map((d) => d.id));
    return [
      ...saved,
      ...shared.filter((d) => !ids.has(d.id) && (d.assetId === null || d.assetId === asset.id)),
    ];
  }

  private async seedDevices(
    m: EntityManager,
    demo: DemoAsset,
    asset: AssetEntity,
    establishment: SeededEstablishment,
    createdAt: Date,
  ): Promise<DeviceInstallationEntity[]> {
    const installations: DeviceInstallationEntity[] = [];
    if (demo.key === 'SC-BOV') {
      installations.push(
        await m.save(
          m.create(DeviceInstallationEntity, {
            organizationId: this.organizationId,
            establishmentId: establishment.entity.id,
            assetId: asset.id,
            requestType: 'KIT_REQUEST',
            status: 'REQUESTED',
            label: 'Kit de monitoreo (4 cámaras)',
            kitSpec: { cameras: 4, connectivity: 'LTE_4G', solarPower: true, rfidReader: true },
            shippingAddress: 'Ruta Nacional 7 km 412, Laboulaye, Córdoba',
            contactName: 'Diego Fernández',
            contactPhone: '+54 9 3385 41-2290',
            requestedBy: this.maria,
          }),
        ),
      );
      return installations;
    }
    for (const [index, camera] of (demo.cameras ?? []).entries()) {
      const groundTruth = this.manifest.cameras.find(
        (c) => c.serial === camera.serial,
      )?.measured_count;
      const device = await m.save(
        m.create(DeviceEntity, {
          organizationId: this.organizationId,
          type: index % 2 === 0 ? 'SOLAR_CAMERA' : 'FIXED_CAMERA',
          serialNumber: camera.serial,
          model: 'AG-Cam S2',
          manufacturer: 'Kit AgroGarantías',
          connectivity: 'LTE_4G',
          powerSource: index % 2 === 0 ? 'SOLAR' : 'GRID',
          status: 'ONLINE',
          gateway: 'simulated',
          capabilities: ['IMAGE_CAPTURE', 'ANIMAL_COUNTING'],
          lastSeenAt: this.at(1),
          metadata:
            groundTruth !== undefined ? { simulation: { groundTruthAnimals: groundTruth } } : {},
        }),
      );
      installations.push(
        await m.save(
          m.create(DeviceInstallationEntity, {
            organizationId: this.organizationId,
            deviceId: device.id,
            establishmentId: establishment.entity.id,
            assetId: asset.id,
            requestType: demo.key === 'LE-BOV' ? 'KIT_REQUEST' : 'SELF_INSTALLED',
            status: 'ACTIVE',
            label: camera.label,
            location: toPoint(
              offsetPoint(establishment.demo.center, camera.offset[0], camera.offset[1]),
            ),
            kitSpec:
              demo.key === 'LE-BOV'
                ? { cameras: 6, connectivity: 'LTE_4G', solarPower: true, rfidReader: true }
                : null,
            installedAt: new Date(createdAt.getTime() + 3 * DAY_MS),
            requestedBy: this.maria,
          }),
        ),
      );
      installations.at(-1)!.device = device;
    }
    return installations;
  }

  // ------------------------------------------------------------------ verificaciones históricas
  private async seedVerification(
    m: EntityManager,
    demo: DemoAsset,
    asset: AssetEntity,
    type: AssetTypeEntity,
    establishment: SeededEstablishment,
    documents: DocumentEntity[],
    installations: DeviceInstallationEntity[],
    spec: DemoAsset['history'][number],
    index: number,
    previous: { input: HistoricalRunInput; runId: string; detected: number | null; at: Date }[],
  ) {
    const completedAt = this.at(spec.daysAgo);
    const queuedAt = new Date(completedAt.getTime() - 4 * 60_000);
    const capturedAt = new Date(completedAt.getTime() - 3 * 60_000);
    const runId = randomUUID();
    const isLast = index === demo.history.length - 1;

    await m.save(
      m.create(VerificationRunEntity, {
        id: runId,
        organizationId: this.organizationId,
        assetId: asset.id,
        status: 'COMPLETED',
        trigger: index === 0 ? 'MANUAL' : 'SCHEDULED',
        requestedBy: index === 0 ? this.maria : null,
        requestedByProcess: index === 0 ? null : 'monitoring-scheduler',
        attempts: 1,
        pipelineVersion: PIPELINE_VERSION,
        inputSnapshot: {
          declaredQuantity: demo.declaredQuantity,
          unit: asset.unit,
          assetTypeCode: type.code,
          verificationStrategy: type.verificationStrategy,
          metadataVersion: 1,
          establishment: {
            id: establishment.entity.id,
            name: establishment.entity.name,
            renspa: establishment.entity.renspa,
            tenure: establishment.entity.tenure,
          },
          requestedEvidenceIds: [],
          maxEvidenceAgeHours: defaultMaxEvidenceAgeHours(type.verificationStrategy),
        },
        queuedAt,
        startedAt: queuedAt,
        completedAt,
        createdAt: queuedAt,
        updatedAt: completedAt,
      }),
    );
    const links: EvidenceLinkSeed[] = [];
    let detected: number | null = null;
    let confidence: number | null = null;
    let averageQuality: number | null = null;
    let locationVerified: boolean | null = null;
    const anomalies: Anomaly[] = [];
    let vegetationChange: number | null = null;

    if (type.verificationStrategy === 'LIVESTOCK_COUNTING') {
      for (const installation of installations) {
        const scene = this.manifest.cameras.find(
          (c) => c.serial === installation.device!.serialNumber,
        )!;
        const evidence = await this.evidence(
          m,
          asset,
          establishment,
          'CAMERA_SIMULATED',
          'IMAGE',
          capturedAt,
          installation,
          await this.asset('cameras', scene.serial),
          {
            gateway: 'simulated',
            synthetic: true,
            deviceSerial: scene.serial,
            installationLabel: installation.label,
            syntheticGroundTruth: scene.measured_count,
          },
        );
        links.push({
          evidence,
          detectedCount: scene.measured_count,
          confidence: scene.confidence,
          modelVersionId: this.models.get('classical-livestock-counter@1.0.0')!,
          analysis: {
            analyzedAt: completedAt.toISOString(),
            count: scene.measured_count,
            confidence: scene.confidence,
            clusteredComponents: 0,
            quality: { ...scene.quality, exifCapturedAt: null },
            model: COUNTER_MODEL,
            provider: 'ai-service',
          },
        });
      }
      detected = links.reduce((acc, l) => acc + (l.detectedCount ?? 0), 0);
      confidence = links.length
        ? links.reduce((acc, l) => acc + (l.confidence ?? 0) * (l.detectedCount ?? 0), 0) / detected
        : null;
      confidence = confidence === null ? null : Math.round(confidence * 1000) / 1000;
      averageQuality =
        Math.round(
          (links.reduce((a, l) => a + ((l.analysis.quality as Quality).score ?? 0), 0) /
            links.length) *
            1000,
        ) / 1000;
      locationVerified = true;
    } else if (type.verificationStrategy === 'VEGETATION_AREA') {
      const provider = new MockSatelliteProvider(this.storage);
      const [scene] = await provider.searchImages({
        aoi: asset.area!,
        from: new Date(completedAt.getTime() - 25 * DAY_MS),
        to: completedAt,
        maxCloudCoverPct: 30,
        limit: 1,
      });
      const sceneName =
        isLast || demo.key !== 'DJ-VIN' ? demo.satelliteScene! : 'don-jose-vinedo-anterior';
      const preview = await this.asset('satellite', sceneName);
      const previewKey = storageKeys.satellitePreview(
        this.organizationId,
        `${scene!.sceneId}_${asset.id}`,
      );
      await this.storage.putObject({ key: previewKey, body: preview, contentType: 'image/jpeg' });
      const image = await m.save(
        m.create(SatelliteImageEntity, {
          organizationId: this.organizationId,
          provider: scene!.provider,
          collection: scene!.collection,
          sceneId: scene!.sceneId,
          acquiredAt: scene!.acquiredAt,
          cloudCoverPct: scene!.cloudCoverPct,
          resolutionM: scene!.resolutionM,
          footprint: scene!.footprint,
          bands: scene!.bands,
          previewStorageKey: previewKey,
          isSimulated: true,
          metadata: {},
        }),
      );
      detected = spec.detected!;
      confidence = sceneConfidence(scene!.cloudCoverPct ?? 0);
      locationVerified = true;
      const prevDetected = previous.at(-1)?.detected ?? null;
      vegetationChange = prevDetected
        ? Math.round(((detected - prevDetected) / prevDetected) * 10_000) / 100
        : null;
      const evidence = await m.save(
        m.create(EvidenceEntity, {
          organizationId: this.organizationId,
          assetId: asset.id,
          establishmentId: establishment.entity.id,
          sourceId: this.sources.get('SATELLITE_SENTINEL2_SIMULATED')!.id,
          satelliteImageId: image.id,
          type: 'SATELLITE_SCENE',
          storageKey: previewKey,
          capturedAt: scene!.acquiredAt,
          receivedAt: completedAt,
          location: null,
          metadata: {
            sceneId: scene!.sceneId,
            cloudCoverPct: scene!.cloudCoverPct,
            ndviMean: spec.ndvi,
            vegetatedAreaHa: detected,
            simulatedSource: true,
          },
          createdAt: completedAt,
        }),
      );
      const observation = await m.save(
        m.create(SatelliteObservationEntity, {
          organizationId: this.organizationId,
          assetId: asset.id,
          satelliteImageId: image.id,
          evidenceId: evidence.id,
          observedAt: scene!.acquiredAt,
          ndviMean: spec.ndvi ?? 0.72,
          ndviStd: 0.06,
          vegetatedAreaHa: detected,
          declaredAreaHa: demo.declaredQuantity,
          coverageRatio: Math.round((detected / demo.declaredQuantity) * 10_000) / 10_000,
          changeVsPreviousPct: vegetationChange,
          metrics: { confidence, model: NDVI_MODEL },
        }),
      );
      links.push({
        evidence,
        detectedCount: null,
        confidence,
        modelVersionId: this.models.get('simulated-ndvi-analyzer@1.0.0')!,
        analysis: {
          analyzedAt: completedAt.toISOString(),
          sceneId: scene!.sceneId,
          provider: 'mock-sentinel2',
          simulated: true,
          acquiredAt: scene!.acquiredAt.toISOString(),
          cloudCoverPct: scene!.cloudCoverPct,
          ndviMean: spec.ndvi,
          ndviStd: 0.06,
          vegetatedAreaHa: detected,
          analyzedAreaHa: demo.declaredQuantity,
          changeVsPreviousPct: vegetationChange,
          observationId: observation.id,
          model: NDVI_MODEL,
        },
      });
      if (detected / demo.declaredQuantity < 0.92) {
        anomalies.push({
          code: 'VEGETATION_AREA_DROP',
          severity: 'WARNING',
          message: `La superficie con vegetación activa (${detected.toLocaleString('es-AR')} ha) es inferior a la declarada.`,
          details: { detectedHa: detected, declaredHa: demo.declaredQuantity },
        });
      }
    } else {
      const scene = this.manifest.objects.find((o) => o.name === demo.objectScene)!;
      for (const installation of installations) {
        const evidence = await this.evidence(
          m,
          asset,
          establishment,
          'CAMERA_SIMULATED',
          'IMAGE',
          capturedAt,
          installation,
          await this.asset('objects', scene.name),
          {
            gateway: 'simulated',
            synthetic: true,
            deviceSerial: installation.device!.serialNumber,
            installationLabel: installation.label,
          },
        );
        links.push({
          evidence,
          detectedCount: null,
          confidence: scene.quality.score,
          modelVersionId: this.models.get('image-quality-metrics@1.0.0')!,
          analysis: {
            analyzedAt: completedAt.toISOString(),
            quality: { ...scene.quality, exifCapturedAt: null },
            model: QUALITY_MODEL,
            provider: 'ai-service',
          },
        });
      }
      averageQuality = scene.quality.score;
      locationVerified = true;
    }

    let registryStatus: RegistryStatus = 'NOT_APPLICABLE';
    let registered: number | null = null;
    if (type.category === 'LIVESTOCK' && establishment.entity.renspa) {
      const lookup = await this.registry.lookupByRenspa(establishment.entity.renspa);
      registryStatus = lookup.status;
      registered = lookup.status === 'OK' ? lookup.record.registeredHeads : null;
      await m.save(
        m.create(ExternalDataSnapshotEntity, {
          organizationId: this.organizationId,
          source: this.registry.source,
          provider: this.registry.name,
          subjectType: 'RENSPA',
          subjectRef: establishment.entity.renspa,
          assetId: asset.id,
          establishmentId: establishment.entity.id,
          verificationRunId: runId,
          status: lookup.status,
          isSimulated: true,
          payload: lookup.status === 'OK' ? { ...lookup.record } : {},
          fetchedAt: completedAt,
        }),
      );
    }

    const today = completedAt.toISOString().slice(0, 10);
    const input: ScoringInput = {
      now: completedAt,
      asset: {
        declaredQuantity: demo.declaredQuantity,
        unit: asset.unit,
        mobility: type.mobility,
        tenure: establishment.entity.tenure,
      },
      detection: {
        detectedQuantity: detected,
        confidence,
        evidenceCount: links.length,
        averageQuality,
      },
      freshness: {
        newestEvidenceAt: links.length
          ? links.map((l) => l.evidence.capturedAt).sort((a, b) => +b - +a)[0]!
          : null,
        maxEvidenceAgeHours: defaultMaxEvidenceAgeHours(type.verificationStrategy),
      },
      documents: {
        requirements: type.requiredDocuments,
        documents: documents.map((d) => ({
          type: d.type,
          status: d.status,
          expiresAt: d.expiresAt,
        })),
      },
      history: { previous: previous.map((p) => p.input) },
      location: { verified: locationVerified, distanceM: null },
      registry: { status: registryStatus, registeredQuantity: registered },
      risk: {
        openAlerts: [],
        activeDevices: installations.filter((i) => i.device).length,
        expectedDevices: installations.filter((i) => i.device).length,
        monitoringEnabled: true,
        insured: documents.some(
          (d) => d.type === 'INSURANCE_POLICY' && (!d.expiresAt || d.expiresAt >= today),
        ),
      },
      anomalies,
    };
    const scoring = this.scoring.score(input, DEFAULT_SCORING_WEIGHTS);

    for (const link of links) {
      await m.save(
        m.create(VerificationEvidenceEntity, {
          verificationRunId: runId,
          evidenceId: link.evidence.id,
          organizationId: this.organizationId,
          role: 'PRIMARY',
          detectedCount: link.detectedCount,
          confidence: link.confidence,
          analysis: link.analysis,
          aiModelVersionId: link.modelVersionId,
          createdAt: completedAt,
        }),
      );
    }
    const evidenceLabel =
      type.verificationStrategy === 'VEGETATION_AREA'
        ? 'escenas satelitales'
        : 'imágenes de cámaras';
    await m.save(
      m.create(VerificationResultEntity, {
        organizationId: this.organizationId,
        verificationRunId: runId,
        assetId: asset.id,
        outcome: scoring.outcome,
        declaredQuantity: demo.declaredQuantity,
        detectedQuantity: detected,
        unit: asset.unit,
        matchPercentage:
          scoring.matchRatio === null ? null : Math.round(scoring.matchRatio * 10_000) / 100,
        difference:
          detected === null ? null : Math.round((detected - demo.declaredQuantity) * 100) / 100,
        finalScore: scoring.finalScore,
        confidence: scoring.confidence,
        riskLevel: scoring.riskLevel,
        locationVerified,
        locationDistanceM: null,
        scoringModelVersion: scoring.modelVersion,
        scoreComponents: scoring.components,
        scoreWeights: scoring.weights,
        riskPenalty: scoring.riskPenalty,
        anomalies,
        summary: buildSummary({
          declared: demo.declaredQuantity,
          detected,
          unit: asset.unit,
          evidenceCount: links.length,
          evidenceLabel,
          scoring,
        }),
        aiModelVersionId: links[0]?.modelVersionId ?? null,
        createdAt: completedAt,
      }),
    );
    const metrics: [string, number, string | null, string][] = [
      ['declared_quantity', demo.declaredQuantity, asset.unit, 'asset'],
      ['final_score', scoring.finalScore, null, 'scoring'],
      ['evidence_primary_count', links.length, null, 'pipeline'],
      ...scoring.components.map(
        (c) => [`${c.key}_score`, c.score, null, 'scoring'] as [string, number, null, string],
      ),
      ...(detected !== null
        ? [
            [
              'detected_quantity',
              detected,
              asset.unit,
              type.verificationStrategy === 'VEGETATION_AREA' ? 'satellite' : 'computer_vision',
            ] as [string, number, string, string],
          ]
        : []),
      ...(confidence !== null
        ? [
            ['detection_confidence', confidence, null, 'computer_vision'] as [
              string,
              number,
              null,
              string,
            ],
          ]
        : []),
      ...(registered !== null
        ? [
            ['registry_quantity', registered, 'HEAD', 'registry'] as [
              string,
              number,
              string,
              string,
            ],
          ]
        : []),
    ];
    for (const [key, value, unit, source] of metrics) {
      await m.save(
        m.create(VerificationMetricEntity, {
          organizationId: this.organizationId,
          verificationRunId: runId,
          key,
          value,
          unit,
          source,
          details: {},
          createdAt: completedAt,
        }),
      );
    }

    await this.audit(
      m,
      'VERIFICATION_STARTED',
      'verification_run',
      runId,
      queuedAt,
      { assetId: asset.id },
      index === 0 ? this.maria : null,
    );
    await this.audit(
      m,
      'VERIFICATION_COMPLETED',
      'verification_run',
      runId,
      completedAt,
      { assetId: asset.id, finalScore: scoring.finalScore, outcome: scoring.outcome },
      null,
    );
    await this.event(
      m,
      asset.id,
      runId,
      'VERIFICATION_COMPLETED',
      `Verificación completada: score ${scoring.finalScore}/100`,
      completedAt,
      scoring.outcome === 'VERIFIED' ? 'INFO' : 'WARNING',
    );

    return {
      runId,
      at: completedAt,
      detected,
      input: {
        completedAt,
        matchRatio: matchRatio(demo.declaredQuantity, detected),
        finalScore: scoring.finalScore,
      },
    };
  }

  private async evidence(
    m: EntityManager,
    asset: AssetEntity,
    establishment: SeededEstablishment,
    sourceCode: string,
    type: 'IMAGE',
    capturedAt: Date,
    installation: DeviceInstallationEntity,
    body: Buffer,
    metadata: Record<string, unknown>,
  ): Promise<EvidenceEntity> {
    const key = storageKeys.evidence(this.organizationId, asset.id, 'jpg');
    const sha256 = sha256Hex(body);
    await this.storage.putObject({
      key,
      body,
      contentType: 'image/jpeg',
      metadata: { sha256, source: sourceCode },
    });
    return m.save(
      m.create(EvidenceEntity, {
        organizationId: this.organizationId,
        assetId: asset.id,
        establishmentId: establishment.entity.id,
        sourceId: this.sources.get(sourceCode)!.id,
        deviceId: installation.deviceId,
        type,
        storageKey: key,
        mimeType: 'image/jpeg',
        sizeBytes: body.length,
        sha256,
        capturedAt,
        receivedAt: new Date(capturedAt.getTime() + 20_000),
        location: installation.location,
        metadata: { ...metadata, simulatedSource: true },
        createdAt: new Date(capturedAt.getTime() + 20_000),
      }),
    );
  }

  // ------------------------------------------------------------------ alertas
  private async seedAlerts(
    m: EntityManager,
    demo: DemoAsset,
    asset: AssetEntity,
    type: AssetTypeEntity,
    establishment: SeededEstablishment,
    lastVerifiedAt: Date | null,
  ) {
    const lastResult = asset.id
      ? await m.findOne(VerificationResultEntity, {
          where: { assetId: asset.id },
          order: { createdAt: 'DESC' },
        })
      : null;
    const ctx: AlertEvaluationContext = {
      phase: 'VERIFICATION',
      now: lastVerifiedAt ?? this.now,
      asset: {
        id: asset.id,
        name: asset.name,
        assetTypeCode: type.code,
        declaredQuantity: demo.declaredQuantity,
        unitLabel: unitLabel(asset.unit, demo.declaredQuantity),
        establishmentName: establishment.entity.name,
      },
      verification: lastResult
        ? {
            runId: lastResult.verificationRunId,
            detectedQuantity: lastResult.detectedQuantity,
            finalScore: lastResult.finalScore,
            previousDetectedQuantity: null,
            locationVerified: lastResult.locationVerified,
            locationDistanceM: null,
            anomalies: lastResult.anomalies,
            vegetationChangePct: null,
          }
        : undefined,
      newestEvidenceAt: lastVerifiedAt,
      lastVerifiedAt,
      documents: [],
    };
    const raise = async (
      ruleCode: string,
      phase: 'VERIFICATION' | 'MONITORING',
      createdAt: Date,
      resolution?: { at: Date; note: string },
    ) => {
      const rule = await m.findOneByOrFail(AlertRuleEntity, { code: ruleCode });
      const evaluator = EVALUATORS.find((e) => e.type === rule.conditionType)!;
      const candidate = evaluator.evaluate({ ...ctx, phase, now: createdAt }, rule.parameters) ?? {
        title: rule.name,
        description: rule.description,
        context: {},
      };
      const alert = await m.save(
        m.create(AlertEntity, {
          organizationId: this.organizationId,
          assetId: asset.id,
          verificationRunId:
            phase === 'VERIFICATION' ? (lastResult?.verificationRunId ?? null) : null,
          ruleId: rule.id,
          type: rule.code,
          severity: rule.severity,
          status: resolution ? 'RESOLVED' : 'OPEN',
          title: candidate.title,
          description: candidate.description,
          context: {
            ...candidate.context,
            rule: { code: rule.code, parameters: rule.parameters },
            phase,
          },
          acknowledgedBy: resolution ? this.maria : null,
          acknowledgedAt: resolution?.at ?? null,
          resolvedBy: resolution ? this.maria : null,
          resolvedAt: resolution?.at ?? null,
          resolutionNote: resolution?.note ?? null,
          createdAt,
          updatedAt: resolution?.at ?? createdAt,
        }),
      );
      await this.audit(
        m,
        'ALERT_CREATED',
        'alert',
        alert.id,
        createdAt,
        { type: alert.type, severity: alert.severity },
        null,
      );
      await this.event(
        m,
        asset.id,
        alert.verificationRunId,
        'ALERT_RAISED',
        alert.title,
        createdAt,
        alert.severity,
      );
      if (resolution)
        await this.audit(m, 'ALERT_RESOLVED', 'alert', alert.id, resolution.at, {
          note: resolution.note,
        });
    };

    switch (demo.key) {
      case 'DJ-VIN':
        await raise('VEGETATION_AREA_CHANGE', 'VERIFICATION', lastVerifiedAt!);
        break;
      case 'LM-FOR':
        await raise('NO_RECENT_VERIFICATION', 'MONITORING', this.at(5, 9));
        break;
      case 'SC-BOV':
        await raise('NO_RECENT_VERIFICATION', 'MONITORING', this.at(1, 9));
        break;
      case 'LE-BOV':
        await raise('EVIDENCE_STALE', 'MONITORING', this.at(40, 9), {
          at: this.at(36, 15),
          note: 'Kit de cámaras instalado y en línea; captura diaria operativa.',
        });
        break;
      case 'ET-BOV':
        await raise('LOCATION_MISMATCH', 'VERIFICATION', this.at(41, 14), {
          at: this.at(40, 11),
          note: 'La cámara CAM-ET-02 fue reubicada dentro del potrero; se actualizó su georreferencia.',
        });
        break;
      case 'DA-MAQ':
        await raise('DOCUMENT_EXPIRING', 'MONITORING', this.at(58, 9), {
          at: this.at(50, 16),
          note: 'Póliza de seguro renovada hasta el 30/06/2027.',
        });
        break;
    }
  }

  // ------------------------------------------------------------------ identificación individual
  private async seedAnimals(
    m: EntityManager,
    asset: AssetEntity,
    establishment: SeededEstablishment,
    installations: DeviceInstallationEntity[],
  ) {
    const manga = installations.find((i) => i.label === 'Manga y corrales');
    for (let i = 0; i < 24; i++) {
      const category = LE_ANIMAL_CATEGORIES[i % LE_ANIMAL_CATEGORIES.length] as AnimalCategory;
      const tag = String(1_245_678 + i * 37);
      const animal = await m.save(
        m.create(AnimalEntity, {
          organizationId: this.organizationId,
          establishmentId: establishment.entity.id,
          assetId: asset.id,
          officialTag: tag,
          species: 'BOVINE',
          category,
          breed: 'Aberdeen Angus',
          sex: ['TORO', 'NOVILLO', 'TERNERO'].includes(category) ? 'M' : 'H',
          birthDate: `${2019 + (i % 6)}-0${1 + (i % 9)}-1${i % 9}`,
          status: 'ACTIVE',
        }),
      );
      const rfid = `032 0000 ${String(1245 + i).padStart(4, '0')} ${String(5678 + i * 3).padStart(4, '0')}`;
      await m.save(
        m.create(AnimalIdentificationEntity, {
          organizationId: this.organizationId,
          animalId: animal.id,
          method: 'RFID',
          identifier: rfid,
          confidence: 1,
          isPrimary: true,
        }),
      );
      await m.save(
        m.create(AnimalIdentificationEntity, {
          organizationId: this.organizationId,
          animalId: animal.id,
          method: 'TAG_OCR',
          identifier: tag,
          confidence: 0.97,
          isPrimary: false,
        }),
      );
      if (i % 3 === 0) {
        await m.save(
          m.create(AnimalIdentificationEntity, {
            organizationId: this.organizationId,
            animalId: animal.id,
            method: 'VISUAL',
            identifier: `vis-le-${sha256Hex(tag).slice(0, 12)}`,
            confidence: 0.88 + (i % 5) / 100,
            isPrimary: false,
          }),
        );
      }
      for (const daysAgo of [14, 7]) {
        await m.save(
          m.create(AnimalObservationEntity, {
            organizationId: this.organizationId,
            animalId: animal.id,
            deviceId: manga?.deviceId ?? null,
            method: 'RFID',
            observedAt: this.at(daysAgo, 12 + (i % 5)),
            location: manga?.location ?? null,
            confidence: 1,
            attributes: {
              reader: 'Lector RFID manga (simulado)',
              pesoEstimadoKg: 380 + ((i * 13) % 160),
            },
          }),
        );
      }
    }
  }

  // ------------------------------------------------------------------ segunda organización
  private async seedSecondOrganization(m: EntityManager) {
    const org = await m.save(
      m.create(OrganizationEntity, { ...SECOND_ORGANIZATION, settings: {} }),
    );
    const role = await m.findOneByOrFail(RoleEntity, { code: SECOND_ORG_USER.role });
    const hash = await new PasswordHasher().hash(this.options.demoPassword);
    await m.save(
      m.create(UserEntity, {
        organizationId: org.id,
        roleId: role.id,
        email: SECOND_ORG_USER.email,
        fullName: SECOND_ORG_USER.fullName,
        passwordHash: hash,
        status: 'ACTIVE',
      }),
    );
    const center: Position = [-59.134, -37.318];
    const establishment = await m.save(
      m.create(EstablishmentEntity, {
        organizationId: org.id,
        name: 'La Candelaria',
        holderName: 'Estancia La Candelaria S.A.',
        holderTaxId: '30-71456789-2',
        renspa: null,
        establishmentType: 'CRIA',
        tenure: 'OWNED',
        province: 'Buenos Aires',
        locality: 'Tandil',
        totalAreaHa: 800,
      }),
    );
    await m.save(
      m.create(EstablishmentLocationEntity, {
        organizationId: org.id,
        establishmentId: establishment.id,
        kind: 'MAIN',
        name: 'Casco principal',
        point: toPoint(center),
        boundary: parcel(center, 800),
      }),
    );
    const asset = await m.save(
      m.create(AssetEntity, {
        organizationId: org.id,
        establishmentId: establishment.id,
        assetTypeId: this.types.get('BOVINOS')!.id,
        name: 'Rodeo asegurado La Candelaria',
        status: 'DRAFT',
        declaredQuantity: 300,
        unit: 'HEAD',
        declaredValue: 270_000,
        currency: 'USD',
        location: toPoint(center),
      }),
    );
    await m.save(
      m.create(AssetMetadataEntity, {
        organizationId: org.id,
        assetId: asset.id,
        version: 1,
        data: { sistema_productivo: 'Cría', raza_predominante: 'Hereford' },
      }),
    );
    await m.save(
      m.create(MonitoringConfigurationEntity, {
        organizationId: org.id,
        assetId: asset.id,
        enabled: true,
        intervalHours: 168,
        maxEvidenceAgeHours: 72,
      }),
    );
  }

  // ------------------------------------------------------------------ utilidades
  private async uploadSimulatedCameraFeeds() {
    for (const camera of this.manifest.cameras) {
      await this.storage.putObject({
        key: storageKeys.simulatedCameraFeed(camera.serial),
        body: await this.asset('cameras', camera.serial),
        contentType: 'image/jpeg',
      });
    }
    for (const asset of ASSETS) {
      if (!asset.objectScene) continue;
      for (const camera of asset.cameras ?? []) {
        await this.storage.putObject({
          key: storageKeys.simulatedCameraFeed(camera.serial),
          body: await this.asset('objects', asset.objectScene),
          contentType: 'image/jpeg',
        });
      }
    }
  }

  private readonly cache = new Map<string, Buffer>();

  private async asset(folder: 'cameras' | 'satellite' | 'objects', name: string): Promise<Buffer> {
    const key = `${folder}/${name}`;
    if (!this.cache.has(key))
      this.cache.set(key, await readFile(join(this.options.assetsDir, folder, `${name}.jpg`)));
    return this.cache.get(key)!;
  }

  private async audit(
    m: EntityManager,
    action: string,
    resourceType: string,
    resourceId: string,
    createdAt: Date,
    metadata: Record<string, unknown> = {},
    userId: string | null = this.maria,
  ) {
    await m.save(
      m.create(AuditLogEntity, {
        organizationId: this.organizationId,
        userId,
        actorType: userId ? 'USER' : 'SYSTEM',
        action,
        resourceType,
        resourceId,
        metadata: userId ? metadata : { ...metadata, process: 'seed:historical' },
        ip: userId ? '10.20.4.17' : null,
        userAgent: userId ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' : null,
        createdAt,
      }),
    );
  }

  private async event(
    m: EntityManager,
    assetId: string,
    runId: string | null,
    type: MonitoringEventEntity['type'],
    message: string,
    occurredAt: Date,
    severity: MonitoringEventEntity['severity'] = 'INFO',
  ) {
    await m.save(
      m.create(MonitoringEventEntity, {
        organizationId: this.organizationId,
        assetId,
        verificationRunId: runId,
        type,
        severity,
        message,
        payload: {},
        occurredAt,
        createdAt: occurredAt,
      }),
    );
  }
}
