import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../common/domain/errors.js';
import { DocumentsRepository } from '../../documents/infrastructure/documents.repository.js';
import { ExternalDataService } from '../../external-data/application/external-data.service.js';
import { OrganizationsService } from '../../organizations/application/organizations.service.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { UsersRepository } from '../../users/infrastructure/users.repository.js';
import { unitLabel } from '../../verification/application/pipeline/summary.js';
import { VerificationRepository } from '../../verification/infrastructure/verification.repository.js';
import {
  REPORT_SCHEMA_VERSION,
  type GuaranteeReportData,
  type ReportEvidenceItem,
} from '../domain/report-data.js';
import type { ReportEntity } from '../infrastructure/report.entity.js';

const MAX_IMAGES_IN_PDF = 6;

const METHODOLOGY: Record<string, string[]> = {
  LIVESTOCK_COUNTING: [
    'Captura de imágenes cenitales desde las cámaras instaladas en aguadas, corrales y potreros del establecimiento, más las imágenes cargadas por el usuario dentro de la ventana de vigencia.',
    'Conteo automático por visión computacional: segmentación de la pastura por índice de exceso de verde, limpieza morfológica y conteo de componentes compatibles con un bovino; los grupos en contacto se estiman por área.',
    'Las imágenes con problemas de nitidez o exposición se excluyen del conteo. La cantidad detectada es la suma de las zonas cubiertas por cámaras distintas.',
    'Cruce con el registro oficial de existencias por RENSPA y verificación de la georreferencia de cada captura contra el límite del establecimiento.',
  ],
  VEGETATION_AREA: [
    'Búsqueda de la escena Sentinel-2 L2A más reciente con nubosidad menor al 30 % sobre el polígono declarado.',
    'Cálculo del índice NDVI y de la superficie con vegetación activa; comparación con la superficie declarada y con la observación anterior.',
  ],
  EVIDENCE_REVIEW: [
    'Revisión de evidencia visual (cámaras y cargas manuales): actualidad, calidad de imagen, integridad (hash SHA-256) y georreferencia.',
  ],
};

const COMMON_METHODOLOGY = [
  'Score explicable: suma ponderada de documentación, existencia verificada, historial, riesgo y consistencia, menos penalizaciones por anomalías. Pesos y versión del modelo se registran con cada verificación.',
  'Cada verificación es inmutable: resultados, métricas y evidencia utilizada no pueden modificarse una vez cerrada.',
];

@Injectable()
export class ReportDataBuilder {
  constructor(
    private readonly verification: VerificationRepository,
    private readonly documents: DocumentsRepository,
    private readonly externalData: ExternalDataService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async build(
    report: ReportEntity,
    version: number,
    withImages: boolean,
  ): Promise<GuaranteeReportData> {
    const run = await this.verification.findForOrganization(
      report.organizationId,
      report.verificationRunId,
    );
    const result = run?.result;
    const asset = run?.asset;
    const establishment = asset?.establishment;
    if (!run || !result || !asset || !establishment || !asset.assetType) {
      throw new NotFoundError('Verificación completada', report.verificationRunId);
    }
    const [organization, links, documents, snapshots, history, requester] = await Promise.all([
      this.organizations.get(report.organizationId),
      this.verification.evidenceLinks(run.id),
      this.documents.forAsset(report.organizationId, asset.id, asset.establishmentId),
      this.externalData.forRun(report.organizationId, run.id),
      this.verification.previousResults(asset.id, run.completedAt ?? new Date(), 365),
      run.requestedBy ? this.users.findWithRole(run.requestedBy) : Promise.resolve(null),
    ]);

    let imagesAttached = 0;
    const evidence: ReportEvidenceItem[] = [];
    for (const link of links) {
      const e = link.evidence;
      if (!e) continue;
      const analysis = link.analysis as {
        quality?: { score?: number };
        model?: { code: string; version: string };
      };
      const item: ReportEvidenceItem = {
        id: e.id,
        role: link.role,
        sourceName: e.source?.name ?? 'Fuente',
        sourceKind: e.source?.kind ?? 'MANUAL_UPLOAD',
        simulated: e.source?.isSimulated ?? false,
        capturedAt: e.capturedAt.toISOString(),
        label:
          (e.metadata.installationLabel as string | undefined) ??
          (e.metadata.sceneId as string | undefined) ??
          null,
        coordinates: e.location ? e.location.coordinates : null,
        detectedCount: link.detectedCount,
        confidence: link.confidence,
        qualityScore: analysis.quality?.score ?? null,
        model: analysis.model ? `${analysis.model.code} ${analysis.model.version}` : null,
        sha256: e.sha256,
        exclusionReason: link.exclusionReason,
      };
      if (
        withImages &&
        e.storageKey &&
        imagesAttached < MAX_IMAGES_IN_PDF &&
        e.mimeType !== 'image/webp'
      ) {
        item.image = {
          bytes: await this.storage.getObject(e.storageKey),
          mimeType: e.mimeType ?? 'image/jpeg',
        };
        imagesAttached += 1;
      }
      evidence.push(item);
    }

    const models = new Map<string, { code: string; version: string; simulated: boolean }>();
    for (const link of links) {
      const model = (
        link.analysis as { model?: { code: string; version: string; simulated: boolean } }
      ).model;
      if (model) models.set(`${model.code}@${model.version}`, model);
    }
    const simulatedSources = [
      ...new Set([
        ...evidence.filter((e) => e.simulated).map((e) => e.sourceName),
        ...snapshots.filter((s) => s.isSimulated).map((s) => `${s.source} (${s.provider})`),
        ...[...models.values()]
          .filter((m) => m.simulated)
          .map((m) => `Modelo ${m.code} ${m.version}`),
      ]),
    ];
    const main = establishment.locations?.find((l) => l.kind === 'MAIN');

    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      reportId: report.id,
      reportVersion: version,
      verificationId: run.id,
      generatedAt: new Date().toISOString(),
      organization: { name: organization.name },
      establishment: {
        name: establishment.name,
        holderName: establishment.holderName,
        holderTaxId: establishment.holderTaxId,
        renspa: establishment.renspa,
        establishmentType: establishment.establishmentType,
        tenure: establishment.tenure,
        province: establishment.province,
        locality: establishment.locality,
        totalAreaHa: establishment.totalAreaHa,
        coordinates: main ? main.point.coordinates : null,
      },
      asset: {
        id: asset.id,
        name: asset.name,
        typeName: asset.assetType.name,
        unit: asset.unit,
        unitLabel: unitLabel(asset.unit, result.declaredQuantity),
        declaredQuantity: result.declaredQuantity,
        declaredValue: asset.declaredValue,
        currency: asset.currency,
      },
      verification: {
        trigger: run.trigger,
        requestedBy: requester?.fullName ?? run.requestedByProcess ?? 'Sistema',
        queuedAt: run.queuedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        pipelineVersion: run.pipelineVersion,
      },
      result: {
        outcome: result.outcome,
        declaredQuantity: result.declaredQuantity,
        detectedQuantity: result.detectedQuantity,
        matchPercentage: result.matchPercentage,
        difference: result.difference,
        finalScore: result.finalScore,
        confidence: result.confidence,
        riskLevel: result.riskLevel,
        locationVerified: result.locationVerified,
        locationDistanceM: result.locationDistanceM,
        scoringModelVersion: result.scoringModelVersion,
        components: result.scoreComponents,
        weights: result.scoreWeights,
        riskPenalty: result.riskPenalty,
        anomalies: result.anomalies,
        summary: result.summary,
      },
      evidence,
      history: [
        ...history.map((h) => ({
          completedAt: h.completedAt.toISOString(),
          declaredQuantity: h.declaredQuantity,
          detectedQuantity: h.detectedQuantity,
          finalScore: h.finalScore,
          outcome: h.outcome,
        })),
        {
          completedAt: run.completedAt?.toISOString() ?? new Date().toISOString(),
          declaredQuantity: result.declaredQuantity,
          detectedQuantity: result.detectedQuantity,
          finalScore: result.finalScore,
          outcome: result.outcome,
        },
      ],
      documents: documents.map((d) => ({
        title: d.title,
        type: d.type,
        status: d.status,
        expiresAt: d.expiresAt,
        sha256: d.sha256,
      })),
      externalData: snapshots.map((s) => ({
        source: s.source,
        provider: s.provider,
        simulated: s.isSimulated,
        status: s.status,
        detail:
          s.status === 'OK' && typeof s.payload.registeredHeads === 'number'
            ? `${(s.payload.registeredHeads as number).toLocaleString('es-AR')} cabezas registradas (${(s.payload.lastCampaign as { name?: string } | undefined)?.name ?? 'sin campaña'})`
            : s.status === 'NOT_FOUND'
              ? 'Sin coincidencia en el registro'
              : 'Registro no disponible',
      })),
      models: [...models.values()],
      simulatedSources,
      methodology: [
        ...(METHODOLOGY[asset.assetType.verificationStrategy] ?? []),
        ...COMMON_METHODOLOGY,
      ],
    };
  }
}
