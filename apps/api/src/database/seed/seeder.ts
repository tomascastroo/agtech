import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataSource, EntityManager } from 'typeorm';
import { PERMISSION_DESCRIPTIONS, ROLE_DEFINITIONS } from '../../common/auth/permissions.js';
import { canonicalJson, sha256Hex } from '../../common/crypto/hashing.js';
import type { GeoMultiPolygon, GeoPolygon, Position } from '../../common/geo/geojson.js';
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
import { vegetationThresholdFor } from '../../modules/satellite/domain/phenology.js';
import { assessVegetation } from '../../modules/satellite/domain/vegetation-assessment.js';
import {
  describeObservation,
  ISSUE_LABELS,
} from '../../modules/verification/application/pipeline/strategies/vegetation-area.strategy.js';
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
  type EvidenceRole,
} from '../../modules/verification/domain/verification.types.js';
import { VerificationEvidenceEntity } from '../../modules/verification/infrastructure/verification-evidence.entity.js';
import { VerificationMetricEntity } from '../../modules/verification/infrastructure/verification-metric.entity.js';
import { VerificationResultEntity } from '../../modules/verification/infrastructure/verification-result.entity.js';
import { VerificationRunEntity } from '../../modules/verification/infrastructure/verification-run.entity.js';
import { EVIDENCE_GUIDANCE } from '../../modules/assets/domain/evidence-guidance.js';
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
    /** Verdad de campo de la composición sintética (animales pegados). */
    ground_truth_animals: number;
    /** Conteo del detector real (YOLOX) sobre la imagen, calculado al generar la escena. */
    measured_count: number;
    confidence: number;
    model?: string;
    score_threshold?: number | null;
    synthetic_composite?: boolean;
    detections?: [number, number, number, number, number][];
    quality: Quality;
  }[];
  satellite: { name: string; file: string }[];
  objects: { name: string; label: string; file: string; quality: Quality }[];
}

interface SeededEstablishment {
  entity: EstablishmentEntity;
  demo: DemoEstablishment;
  boundary: GeoMultiPolygon;
  center: Position;
}

/** Observación Sentinel-2 real procesada por scripts/build_satellite_fixtures.py. */
interface FixtureObservation {
  scene_id: string;
  acquired_at: string;
  polygon_pixels: number;
  valid_pixels: number;
  cloud_pixels: number;
  polygon_area_ha: number;
  cloud_cover_pct: number;
  valid_fraction: number;
  ndvi_mean: number | null;
  ndvi_median: number | null;
  ndvi_min: number | null;
  ndvi_max: number | null;
  ndvi_p10: number | null;
  ndvi_p90: number | null;
  ndvi_std: number | null;
  vegetation_pct: number | null;
  vegetated_area_observed_ha: number;
  vegetated_area_estimated_ha: number | null;
  usable: boolean;
  quality: 'GOOD' | 'ACCEPTABLE' | 'LOW_CONFIDENCE';
  confidence: number;
  issues: string[];
  scene: {
    scene_id: string;
    platform: string;
    tile: string;
    scene_cloud_cover: number;
    processing_baseline: string | null;
    catalog: string;
  };
  previews: string[];
}

interface SatelliteFixture {
  key: string;
  source: string;
  processing_version: string;
  ndvi_threshold: number;
  generated_at: string;
  polygon: GeoPolygon;
  observations: FixtureObservation[];
}

interface FixtureRun {
  at: Date;
  primary: string;
  excluded: string[];
}

interface SeededObservation {
  fixture: FixtureObservation;
  acquiredAt: Date;
  evidence: EvidenceEntity;
  observation: SatelliteObservationEntity;
}

type HistorySpec = DemoAsset['history'][number] & Partial<FixtureRun>;

function ringCentroid(polygon: GeoPolygon): Position {
  const ring = polygon.coordinates[0]!.slice(0, -1);
  const lon = ring.reduce((a, p) => a + p[0]!, 0) / ring.length;
  const lat = ring.reduce((a, p) => a + p[1]!, 0) / ring.length;
  return [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
}

interface EvidenceLinkSeed {
  evidence: EvidenceEntity;
  role?: EvidenceRole;
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
const COUNTER_MODEL = { code: 'yolox-s-coco', version: '0.1.1rc0-onnx', simulated: false };
const NDVI_REAL_MODEL = { code: 'sentinel2-ndvi', version: 'agro-ndvi/1.0.0', simulated: false };
const SATELLITE_WINDOW_DAYS = 30;
const SATELLITE_SERIES_DAYS = 120;
const FIXTURE_RUNS = 4;
const FIXTURE_RUN_SPACING_DAYS = 10;
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
  private fixtures = new Map<string, SatelliteFixture>();
  private fixturePlans = new Map<string, FixtureRun[]>();
  private seededObservations = new Map<string, SeededObservation>();
  private raisedAlerts = new Set<string>();

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
    await this.loadSatelliteFixtures();
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

  /** Series Sentinel-2 reales de los activos con vegetación (ver satellite/real/README). */
  private async loadSatelliteFixtures() {
    for (const demo of ASSETS) {
      if (!demo.satelliteFixture) continue;
      const fixture = JSON.parse(
        await readFile(
          join(this.options.assetsDir, 'satellite', 'real', demo.satelliteFixture, 'manifest.json'),
          'utf8',
        ),
      ) as SatelliteFixture;
      this.fixtures.set(demo.key, fixture);
      this.fixturePlans.set(demo.key, this.planFixtureRuns(fixture, demo.fixtureRunDates));
    }
  }

  /**
   * Verificaciones históricas sobre la serie real: una por observación utilizable (las más
   * recientes, separadas al menos 10 días). Si después de la última hay escenas con nubes, la
   * última verificación ocurre luego de ellas y las registra como evidencia excluida, igual que
   * el pipeline.
   */
  private planFixtureRuns(fixture: SatelliteFixture, runDates?: string[]): FixtureRun[] {
    const observations = [...fixture.observations].sort(
      (a, b) => Date.parse(a.acquired_at) - Date.parse(b.acquired_at),
    );
    const selected: FixtureObservation[] = runDates
      ? runDates.map((d) => observations.find((o) => o.usable && o.acquired_at.startsWith(d))!)
      : [];
    if (selected.some((o) => !o))
      throw new Error(`Fecha de verificación sin observación: ${fixture.key}`);
    if (runDates) selected.reverse();
    for (const o of runDates ? [] : observations.filter((x) => x.usable).reverse()) {
      if (selected.length >= FIXTURE_RUNS) break;
      const last = selected.at(-1);
      if (
        !last ||
        Date.parse(last.acquired_at) - Date.parse(o.acquired_at) >=
          FIXTURE_RUN_SPACING_DAYS * DAY_MS
      )
        selected.push(o);
    }
    selected.reverse();
    const runAt = (iso: string) => {
      const date = new Date(Date.parse(iso) + DAY_MS);
      date.setUTCHours(13, 0, 0, 0);
      return new Date(Math.min(date.getTime(), this.now.getTime() - HOUR_MS));
    };
    const runs = selected.map((o) => ({
      at: runAt(o.acquired_at),
      primary: o.scene_id,
      excluded: [] as string[],
    }));
    const lastUsable = selected.at(-1);
    if (lastUsable) {
      const later = observations.filter(
        (o) => Date.parse(o.acquired_at) > Date.parse(lastUsable.acquired_at),
      );
      if (later.length) {
        runs.at(-1)!.at = runAt(later.at(-1)!.acquired_at);
        runs.at(-1)!.excluded = later.map((o) => o.scene_id);
      }
    }
    return runs;
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
        await m.save(
          m.create(AssetTypeEntity, {
            ...type,
            evidenceGuidance: EVIDENCE_GUIDANCE[type.code] ?? null,
            sortOrder: index,
            isActive: true,
          }),
        ),
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
    // Con serie satelital real el establecimiento se ubica donde está el lote observado.
    const fixtureAsset = ASSETS.find((a) => a.establishment === demo.key && a.satelliteFixture);
    const fixture = fixtureAsset ? this.fixtures.get(fixtureAsset.key) : undefined;
    const center = fixture ? ringCentroid(fixture.polygon) : demo.center;
    const firstRun = fixtureAsset ? this.fixturePlans.get(fixtureAsset.key)?.[0]?.at : undefined;
    const created = new Date(
      Math.min(this.at(60, 12).getTime(), (firstRun?.getTime() ?? Infinity) - 12 * DAY_MS),
    );
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
    const boundary = parcel(center, demo.areaHa);
    await m.save(
      m.create(EstablishmentLocationEntity, {
        organizationId: this.organizationId,
        establishmentId: entity.id,
        kind: 'MAIN',
        name: 'Casco principal',
        point: toPoint(center),
        boundary,
      }),
    );
    await this.audit(m, 'ESTABLISHMENT_CREATED', 'establishment', entity.id, created, {
      name: demo.name,
    });
    return { entity, demo, boundary, center };
  }

  // ------------------------------------------------------------------ activos
  private async seedAsset(
    m: EntityManager,
    demo: DemoAsset,
    establishment: SeededEstablishment,
    establishmentDocs: Set<string>,
  ) {
    const type = this.types.get(demo.typeCode)!;
    const fixture = this.fixtures.get(demo.key);
    const plan = this.fixturePlans.get(demo.key) ?? [];
    const specs: HistorySpec[] = fixture
      ? plan.map((run) => ({ daysAgo: (this.now.getTime() - run.at.getTime()) / DAY_MS, ...run }))
      : demo.history;
    const createdAt = fixture
      ? new Date(plan[0]!.at.getTime() - 5 * DAY_MS)
      : this.at(Math.max(...demo.history.map((h) => h.daysAgo), 10) + 5, 12);
    const center = establishment.center;
    const assetCenter = fixture
      ? ringCentroid(fixture.polygon)
      : demo.areaHa
        ? offsetPoint(center, 150, 120)
        : center;
    const area: GeoMultiPolygon | null = fixture
      ? { type: 'MultiPolygon', coordinates: [fixture.polygon.coordinates] }
      : demo.areaHa
        ? parcel(assetCenter, demo.areaHa, 1.25, 0.04)
        : null;
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
        area,
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
    if (fixture) await this.seedFixtureObservations(m, demo, asset, establishment, fixture, plan);
    for (const [index, spec] of specs.entries()) {
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
        specs.length,
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
      )?.ground_truth_animals;
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
              offsetPoint(establishment.center, camera.offset[0], camera.offset[1]),
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
    spec: HistorySpec,
    index: number,
    previous: { input: HistoricalRunInput; runId: string; detected: number | null; at: Date }[],
    total: number,
  ) {
    const completedAt = spec.at ?? this.at(spec.daysAgo);
    const queuedAt = new Date(completedAt.getTime() - 4 * 60_000);
    const capturedAt = new Date(completedAt.getTime() - 3 * 60_000);
    const runId = randomUUID();
    const isLast = index === total - 1;

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
    let evidenceCount: number | null = null;
    let newestEvidenceAt: Date | null | undefined;
    const extraMetrics: { key: string; value: number; unit: string | null; source: string }[] = [];

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
            syntheticComposite: scene.synthetic_composite ?? false,
            syntheticGroundTruth: scene.ground_truth_animals,
          },
        );
        const detections = (scene.detections ?? []).map(([x1, y1, x2, y2, score]) => ({
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1,
          estimatedAnimals: 1,
          label: 'livestock',
          score,
        }));
        links.push({
          evidence,
          detectedCount: scene.measured_count,
          confidence: scene.confidence,
          modelVersionId: this.models.get(`${COUNTER_MODEL.code}@${COUNTER_MODEL.version}`)!,
          analysis: {
            analyzedAt: completedAt.toISOString(),
            count: scene.measured_count,
            confidence: scene.confidence,
            clusteredComponents: 0,
            detectionsTotal: detections.length,
            detectionsSample: detections.slice(0, 500),
            imageSize: { width: scene.quality.width, height: scene.quality.height },
            scoreThreshold: scene.score_threshold ?? null,
            quality: { ...scene.quality, exifCapturedAt: null },
            model: COUNTER_MODEL,
            provider: 'ai-service',
            // Conteo del detector real sobre esta misma imagen, calculado al generar el seed.
            computedAt: 'seed-generation',
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
    } else if (type.verificationStrategy === 'VEGETATION_AREA' && this.fixtures.has(demo.key)) {
      const primary = spec.primary
        ? this.seededObservations.get(`${asset.id}:${spec.primary}`)
        : null;
      const excluded = (spec.excluded ?? []).map(
        (id) => this.seededObservations.get(`${asset.id}:${id}`)!,
      );
      const seriesStart = completedAt.getTime() - SATELLITE_SERIES_DAYS * DAY_MS;
      const usable = [...this.seededObservations.values()].filter(
        (o) =>
          o.observation.assetId === asset.id &&
          o.fixture.usable &&
          o.fixture.ndvi_mean !== null &&
          o.acquiredAt.getTime() >= seriesStart &&
          o.acquiredAt.getTime() <= completedAt.getTime(),
      );
      const o = primary?.fixture;
      const assessment = assessVegetation({
        verificationId: runId,
        now: completedAt,
        assetTypeCode: type.code,
        metadata: demo.metadata,
        declaredHa: demo.declaredQuantity,
        current:
          primary && o && o.ndvi_mean !== null
            ? {
                evidenceId: primary.evidence.id,
                observationId: primary.observation.id,
                sceneId: o.scene_id,
                acquiredAt: primary.acquiredAt,
                ndviMean: o.ndvi_mean,
                ndviMedian: o.ndvi_median,
                ndviMin: o.ndvi_min,
                ndviMax: o.ndvi_max,
                ndviStd: o.ndvi_std,
                vegetationPct: o.vegetation_pct,
                vegetatedAreaHa: o.vegetated_area_estimated_ha,
                analyzedAreaHa: o.polygon_area_ha,
                cloudCoverPct: o.cloud_cover_pct,
                validFraction: o.valid_fraction,
                quality: o.quality,
              }
            : null,
        excluded: excluded.map((e) => ({
          evidenceId: e.evidence.id,
          sceneId: e.fixture.scene_id,
          cloudCoverPct: e.fixture.cloud_cover_pct,
          reason: e.fixture.issues.map((i) => ISSUE_LABELS[i] ?? i).join('; '),
        })),
        history: usable
          .filter((u) => primary && u.acquiredAt.getTime() < primary.acquiredAt.getTime())
          .map((u) => ({
            observedAt: u.acquiredAt,
            ndviMean: u.fixture.ndvi_mean!,
            observationId: u.observation.id,
            evidenceId: u.evidence.id,
            quality: u.fixture.quality,
          })),
        newestUsableAt: usable.at(-1)?.acquiredAt ?? null,
        windowDays: SATELLITE_WINDOW_DAYS,
      });
      detected = assessment.detectedQuantity;
      confidence = primary ? primary.fixture.confidence : null;
      locationVerified = true;
      vegetationChange = assessment.vegetationChangePct;
      evidenceCount = assessment.primaryEvidenceCount;
      newestEvidenceAt = assessment.newestEvidenceAt;
      anomalies.push(...assessment.anomalies);
      extraMetrics.push(...assessment.metrics.map((x) => ({ ...x, source: 'satellite' })));
      const modelVersionId = this.models.get(`${NDVI_REAL_MODEL.code}@${NDVI_REAL_MODEL.version}`)!;
      const describe = (seeded: SeededObservation) =>
        describeObservation(
          seeded.observation,
          {
            sceneId: seeded.fixture.scene_id,
            provider: 'sentinel2-l2a',
            simulated: false,
            acquiredAt: seeded.acquiredAt,
          },
          completedAt,
        );
      for (const e of excluded) {
        links.push({
          evidence: e.evidence,
          role: 'EXCLUDED',
          detectedCount: null,
          confidence: e.fixture.confidence,
          modelVersionId,
          analysis: {
            ...describe(e),
            excludedReason: e.fixture.issues.map((i) => ISSUE_LABELS[i] ?? i).join('; '),
          },
        });
      }
      if (primary) {
        links.push({
          evidence: primary.evidence,
          role: 'PRIMARY',
          detectedCount: null,
          confidence,
          modelVersionId,
          analysis: describe(primary),
        });
      }
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
        evidenceCount: evidenceCount ?? links.length,
        averageQuality,
      },
      freshness: {
        newestEvidenceAt:
          newestEvidenceAt !== undefined
            ? newestEvidenceAt
            : links.length
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
      // Cada establecimiento demo tiene un único rodeo: la base es la cantidad del activo.
      registry: {
        status: registryStatus,
        registeredQuantity: registered,
        declaredOnEstablishment: null,
      },
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
          role: link.role ?? 'PRIMARY',
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
          evidenceCount: evidenceCount ?? links.length,
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
      ['evidence_primary_count', evidenceCount ?? links.length, null, 'pipeline'],
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
    if (detected !== null && type.verificationStrategy === 'LIVESTOCK_COUNTING') {
      metrics.push(
        [
          'absolute_difference',
          Math.abs(detected - demo.declaredQuantity),
          'HEAD',
          'computer_vision',
        ],
        [
          'relative_error',
          Math.round(((detected - demo.declaredQuantity) / demo.declaredQuantity) * 10_000) /
            10_000,
          null,
          'computer_vision',
        ],
        [
          'match_percentage',
          Math.round(
            (Math.min(detected, demo.declaredQuantity) /
              Math.max(detected, demo.declaredQuantity)) *
              10_000,
          ) / 100,
          '%',
          'computer_vision',
        ],
      );
    }
    for (const x of extraMetrics) {
      if (!metrics.some(([key]) => key === x.key)) metrics.push([x.key, x.value, x.unit, x.source]);
    }
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
    if (this.fixtures.has(demo.key)) {
      await this.raiseVerificationAlerts(m, demo, asset, type, establishment, {
        runId,
        at: completedAt,
        detected,
        finalScore: scoring.finalScore,
        anomalies,
        vegetationChange,
        evidenceIds: links.filter((l) => l.role === 'PRIMARY').map((l) => l.evidence.id),
      });
    }

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

  /** Registra la serie real como escenas, observaciones y evidencias (vista NDVI con hash). */
  private async seedFixtureObservations(
    m: EntityManager,
    demo: DemoAsset,
    asset: AssetEntity,
    establishment: SeededEstablishment,
    fixture: SatelliteFixture,
    plan: FixtureRun[],
  ) {
    const dir = join(this.options.assetsDir, 'satellite', 'real', fixture.key);
    const threshold = vegetationThresholdFor(demo.typeCode);
    const firstRunAt = plan[0]!.at.getTime();
    const location = toPoint(ringCentroid(fixture.polygon));
    const source = this.sources.get('SATELLITE_SENTINEL2_STAC')!;
    let previous: SatelliteObservationEntity | null = null;
    const ordered = [...fixture.observations].sort(
      (a, b) => Date.parse(a.acquired_at) - Date.parse(b.acquired_at),
    );
    for (const o of ordered) {
      const acquiredAt = new Date(o.acquired_at);
      // Recibida cuando la procesó la primera verificación que la usó (o al día siguiente).
      const receivedAt = new Date(
        Math.min(
          Math.max(acquiredAt.getTime() + DAY_MS, firstRunAt - HOUR_MS),
          this.now.getTime() - HOUR_MS,
        ),
      );
      const image = await m.save(
        m.create(SatelliteImageEntity, {
          organizationId: this.organizationId,
          provider: 'sentinel2-l2a',
          collection: 'sentinel-2-l2a',
          sceneId: o.scene_id,
          acquiredAt,
          cloudCoverPct: o.scene.scene_cloud_cover,
          resolutionM: 10,
          footprint: null,
          bands: ['B04', 'B08', 'SCL', 'TCI'],
          previewStorageKey: null,
          isSimulated: false,
          metadata: {
            platform: o.scene.platform,
            tile: o.scene.tile,
            catalog: o.scene.catalog,
            processingBaseline: o.scene.processing_baseline,
          },
          createdAt: receivedAt,
        }),
      );
      const ndviPng = await readFile(join(dir, `${o.scene_id}_ndvi.png`));
      const ndviKey = storageKeys.evidence(this.organizationId, asset.id, 'png');
      const sha256 = sha256Hex(ndviPng);
      await this.storage.putObject({
        key: ndviKey,
        body: ndviPng,
        contentType: 'image/png',
        metadata: { sha256, source: source.code },
      });
      const visualKey = storageKeys.satellitePreview(
        this.organizationId,
        `${o.scene_id}_${asset.id}_visual`,
        'png',
      );
      await this.storage.putObject({
        key: visualKey,
        body: await readFile(join(dir, `${o.scene_id}_visual.png`)),
        contentType: 'image/png',
      });
      const stats = {
        ndviMean: o.ndvi_mean,
        ndviMedian: o.ndvi_median,
        ndviMin: o.ndvi_min,
        ndviMax: o.ndvi_max,
        ndviP10: o.ndvi_p10,
        ndviP90: o.ndvi_p90,
        ndviStd: o.ndvi_std,
        vegetationPct: o.vegetation_pct,
        vegetatedAreaHa: o.vegetated_area_estimated_ha,
        vegetatedAreaObservedHa: o.vegetated_area_observed_ha,
        analyzedAreaHa: o.polygon_area_ha,
        cloudCoverPct: o.cloud_cover_pct,
        sceneCloudCoverPct: o.scene.scene_cloud_cover,
        validFraction: o.valid_fraction,
        usable: o.usable,
        quality: o.quality,
        issues: o.issues,
        vegetationThreshold: threshold,
        confidence: o.confidence,
      };
      const evidence = await m.save(
        m.create(EvidenceEntity, {
          organizationId: this.organizationId,
          assetId: asset.id,
          establishmentId: establishment.entity.id,
          sourceId: source.id,
          satelliteImageId: image.id,
          type: 'SATELLITE_SCENE',
          storageKey: ndviKey,
          mimeType: 'image/png',
          sizeBytes: ndviPng.length,
          sha256,
          capturedAt: acquiredAt,
          receivedAt,
          location,
          metadata: {
            provider: 'sentinel2-l2a',
            satellite: o.scene.platform,
            sceneId: o.scene_id,
            tile: o.scene.tile,
            catalog: o.scene.catalog,
            collection: 'sentinel-2-l2a',
            acquisitionDate: acquiredAt.toISOString(),
            resolutionM: 10,
            bands: ['B04', 'B08', 'SCL'],
            processingVersion: fixture.processing_version,
            model: NDVI_REAL_MODEL.code,
            modelVersion: NDVI_REAL_MODEL.version,
            visualPreviewKey: visualKey,
            resultSha256: sha256Hex(canonicalJson({ sceneId: o.scene_id, ...stats })),
            processedAt: fixture.generated_at,
            dataSource: fixture.source,
            ...stats,
            simulatedSource: false,
          },
          createdAt: receivedAt,
        }),
      );
      const vegetated = o.vegetated_area_estimated_ha;
      const change =
        vegetated !== null && previous?.vegetatedAreaHa
          ? ((vegetated - previous.vegetatedAreaHa) / previous.vegetatedAreaHa) * 100
          : null;
      const ndviChange =
        o.ndvi_mean !== null && previous?.ndviMean
          ? ((o.ndvi_mean - previous.ndviMean) / Math.abs(previous.ndviMean)) * 100
          : null;
      const observation: SatelliteObservationEntity = await m.save(
        m.create(SatelliteObservationEntity, {
          organizationId: this.organizationId,
          assetId: asset.id,
          satelliteImageId: image.id,
          evidenceId: evidence.id,
          observedAt: acquiredAt,
          ndviMean: o.ndvi_mean,
          ndviStd: o.ndvi_std,
          vegetatedAreaHa: vegetated,
          declaredAreaHa: demo.declaredQuantity,
          coverageRatio:
            vegetated === null
              ? null
              : Math.round(Math.min(vegetated / demo.declaredQuantity, 99) * 10_000) / 10_000,
          changeVsPreviousPct: change === null ? null : Math.round(change * 100) / 100,
          metrics: {
            ...stats,
            ndviChangePct: ndviChange === null ? null : Math.round(ndviChange * 100) / 100,
            previousObservationId: previous?.id ?? null,
            sceneId: o.scene_id,
            provider: 'sentinel2-l2a',
            simulated: false,
            processingVersion: fixture.processing_version,
            ndviPreviewKey: ndviKey,
            visualPreviewKey: visualKey,
            model: NDVI_REAL_MODEL,
          },
          createdAt: receivedAt,
        }),
      );
      if (o.usable && o.ndvi_mean !== null) previous = observation;
      this.seededObservations.set(`${asset.id}:${o.scene_id}`, {
        fixture: o,
        acquiredAt,
        evidence,
        observation,
      });
    }
  }

  /** Reglas de alerta evaluadas sobre el resultado de una verificación histórica real. */
  private async raiseVerificationAlerts(
    m: EntityManager,
    demo: DemoAsset,
    asset: AssetEntity,
    type: AssetTypeEntity,
    establishment: SeededEstablishment,
    run: {
      runId: string;
      at: Date;
      detected: number | null;
      finalScore: number;
      anomalies: Anomaly[];
      vegetationChange: number | null;
      evidenceIds: string[];
    },
  ) {
    const rules = await m.find(AlertRuleEntity, { where: { enabled: true } });
    const ctx: AlertEvaluationContext = {
      phase: 'VERIFICATION',
      now: run.at,
      asset: {
        id: asset.id,
        name: asset.name,
        assetTypeCode: type.code,
        declaredQuantity: demo.declaredQuantity,
        unitLabel: unitLabel(asset.unit, demo.declaredQuantity),
        establishmentName: establishment.entity.name,
      },
      verification: {
        runId: run.runId,
        detectedQuantity: run.detected,
        finalScore: run.finalScore,
        previousDetectedQuantity: null,
        locationVerified: true,
        locationDistanceM: null,
        anomalies: run.anomalies,
        vegetationChangePct: run.vegetationChange,
        evidenceIds: run.evidenceIds,
      },
      newestEvidenceAt: null,
      lastVerifiedAt: run.at,
      documents: [],
    };
    for (const rule of rules) {
      if (rule.assetTypeCodes.length > 0 && !rule.assetTypeCodes.includes(type.code)) continue;
      const evaluator = EVALUATORS.find((e) => e.type === rule.conditionType);
      if (!evaluator || !evaluator.phases.includes('VERIFICATION')) continue;
      if (['EVIDENCE_STALE', 'DOCUMENT_EXPIRING'].includes(rule.conditionType)) continue;
      const candidate = evaluator.evaluate(ctx, rule.parameters);
      const dedupe = `${asset.id}:${rule.code}`;
      if (!candidate || this.raisedAlerts.has(dedupe)) continue;
      this.raisedAlerts.add(dedupe);
      const alert = await m.save(
        m.create(AlertEntity, {
          organizationId: this.organizationId,
          assetId: asset.id,
          verificationRunId: run.runId,
          ruleId: rule.id,
          type: rule.code,
          severity: rule.severity,
          status: 'OPEN',
          title: candidate.title,
          description: candidate.description,
          context: {
            ...candidate.context,
            verificationId: run.runId,
            evidenceIds:
              (candidate.context.evidenceIds as string[] | undefined) ??
              (typeof candidate.context.evidenceId === 'string'
                ? [candidate.context.evidenceId]
                : run.evidenceIds),
            rule: {
              code: rule.code,
              conditionType: rule.conditionType,
              severity: rule.severity,
              parameters: rule.parameters,
            },
            phase: 'VERIFICATION',
          },
          createdAt: new Date(run.at.getTime() + 60_000),
          updatedAt: new Date(run.at.getTime() + 60_000),
        }),
      );
      await this.audit(
        m,
        'ALERT_CREATED',
        'alert',
        alert.id,
        alert.createdAt,
        { type: alert.type, severity: alert.severity },
        null,
      );
      await this.event(
        m,
        asset.id,
        run.runId,
        'ALERT_RAISED',
        alert.title,
        alert.createdAt,
        alert.severity,
      );
    }
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

    // Los activos con serie satelital real generan sus alertas a partir de cada verificación.
    if (this.fixtures.has(demo.key)) return;
    switch (demo.key) {
      case 'DJ-VIN':
        await raise('VEGETATION_AREA_CHANGE', 'VERIFICATION', lastVerifiedAt!);
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
