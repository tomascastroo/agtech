import { Injectable } from '@nestjs/common';
import type { Anomaly } from '../../../domain/verification.types.js';
import type { VerificationEvidenceEntity } from '../../../infrastructure/verification-evidence.entity.js';
import {
  livestockProfile,
  type LivestockProfile,
} from '../../../../assets/domain/livestock-profile.js';
import { inferLocationSource } from '../../../../evidence/domain/capture-location.js';
import { type CountedImage, estimateUniqueAnimals } from '../../../domain/unique-count.js';
import { CameraCaptureService } from '../camera-capture.service.js';
import { ImageAnalysisService } from '../image-analysis.service.js';
import type {
  AcquiredEvidence,
  PipelineContext,
  StrategyOutcome,
  VerificationStrategy,
} from '../pipeline-context.js';
import {
  averageQuality,
  duplicateEvidenceAnomaly,
  lowQualityAnomaly,
  newestCapture,
  primary,
  quality,
} from './evidence-stats.js';

/** Código numérico del tipo de producción en la métrica `production_system` (detalle en details). */
const LIVESTOCK_SYSTEM_CODE = { FEEDLOT: 1, CRIA: 2, PASTOREO: 3 } as const;

/** Solo GPS del teléfono o EXIF sirven para afirmar que dos fotos son de lugares distintos. */
const DISTINGUISHING_SOURCES = new Set(['DEVICE_GPS', 'EXIF']);

function countedImage(link: VerificationEvidenceEntity, profile: LivestockProfile): CountedImage {
  const ev = link.evidence;
  // Feedlot: dos escaneos de corral con GPS a más de N m son corrales distintos y se suman.
  const penScan = ev?.type === 'SCAN' && ev.metadata?.mode === 'PEN';
  const source = ev ? inferLocationSource(ev) : 'NONE';
  const coords = ev?.location?.coordinates;
  const accuracy = ev?.metadata?.['locationAccuracyM'];
  return {
    evidenceId: link.evidenceId,
    count: link.detectedCount ?? 0,
    deviceId: ev?.deviceId ?? null,
    capturedAt: ev?.capturedAt ?? new Date(0),
    location:
      coords && source && DISTINGUISHING_SOURCES.has(source)
        ? { longitude: coords[0], latitude: coords[1] }
        : null,
    accuracyM: typeof accuracy === 'number' ? accuracy : null,
    dhash: quality(link).dhash ?? null,
    ...(penScan && profile.distinctZoneMinDistanceM !== null
      ? { distinctMinDistanceM: profile.distinctZoneMinDistanceM }
      : {}),
  };
}

/**
 * Conteo de animales por visión computacional. Las detecciones por imagen NO se suman sin más:
 * se estiman animales únicos agrupando las imágenes que podrían mostrar los mismos animales
 * (ver domain/unique-count.ts). Cámaras fijas distintas cubren zonas distintas y se suman; fotos
 * sin ubicación de captura que las distinga se agrupan y se toma el máximo del grupo.
 * Las cargas manuales son respaldo cuando hay cámaras, o fuente principal cuando no las hay.
 */
@Injectable()
export class LivestockCountingStrategy implements VerificationStrategy {
  readonly code = 'LIVESTOCK_COUNTING';

  constructor(
    private readonly capture: CameraCaptureService,
    private readonly analysis: ImageAnalysisService,
  ) {}

  async acquire(ctx: PipelineContext): Promise<AcquiredEvidence[]> {
    const frames = await this.capture.captureAll(ctx);
    const manual = await this.capture.manualEvidence(ctx);
    const scans = await this.capture.scanEvidence(ctx);
    const manualRole = frames.length > 0 ? 'SUPPORTING' : 'PRIMARY';
    return [
      ...frames.map((evidence) => ({ evidence, role: 'PRIMARY' as const })),
      ...scans.map((evidence) => ({ evidence, role: 'PRIMARY' as const })),
      ...manual.map((evidence) => ({ evidence, role: manualRole as 'PRIMARY' | 'SUPPORTING' })),
    ];
  }

  async analyze(
    ctx: PipelineContext,
    links: VerificationEvidenceEntity[],
  ): Promise<StrategyOutcome> {
    await this.analysis.analyzePending(ctx, links, 'count');
    const used = primary(links);
    const cameraLinks = used.filter((l) => l.evidence?.deviceId);
    const expectedDevices = this.capture.cameraInstallations(ctx).length;

    const profile = livestockProfile(ctx.metadata);
    const unique = used.length
      ? estimateUniqueAnimals(used.map((l) => countedImage(l, profile)))
      : null;
    const detected = unique ? unique.uniqueEstimate : null;
    const detectionsSum = unique ? unique.detectionsSum : 0;
    const confidence =
      detectionsSum > 0
        ? used.reduce((acc, l) => acc + (l.confidence ?? 0) * (l.detectedCount ?? 0), 0) /
          detectionsSum
        : used.length
          ? Math.min(...used.map((l) => l.confidence ?? 0))
          : null;

    // Base del conteo: solo los modos de censo del tipo de producción (el paso controlado por la
    // manga) son comparables con lo declarado; fotos, cámaras, barridos y corrales muestran una
    // parte del rodeo (cota inferior).
    const fixedScans = new Set(
      used
        .filter(
          (l) =>
            l.evidence?.type === 'SCAN' &&
            profile.censusModes.includes(l.evidence.metadata?.mode as 'FIXED') &&
            // Manga con lecturas simuladas: nunca es censo.
            l.evidence.metadata?.lowerBound !== true,
        )
        .map((l) => l.evidenceId),
    );
    const countBasis: 'CENSUS' | 'LOWER_BOUND' =
      unique &&
      unique.groups.length > 0 &&
      unique.groups.every((g) => fixedScans.has(g.evidenceIds[g.counts.indexOf(g.estimate)]!))
        ? 'CENSUS'
        : 'LOWER_BOUND';
    const scansUsed = used.filter((l) => l.evidence?.type === 'SCAN').length;

    const anomalies: Anomaly[] = [];
    const duplicate = duplicateEvidenceAnomaly(used);
    if (duplicate) anomalies.push(duplicate);
    if (unique?.possibleOverlap) {
      const overlapping = unique.groups.filter((g) => g.evidenceIds.length > 1);
      anomalies.push({
        code: 'POSSIBLE_EVIDENCE_DUPLICATION',
        severity: 'WARNING',
        message:
          `Posible duplicación entre evidencias: ${unique.detectionsSum} detecciones en ` +
          `${used.length} imágenes, ${unique.uniqueEstimate} animales únicos estimados. ` +
          `${overlapping.length} grupo(s) de imágenes podrían mostrar los mismos animales; ` +
          'se tomó el máximo de cada grupo en lugar de la suma.',
        details: { groups: overlapping, method: unique.method },
      });
    }
    const lowQuality = lowQualityAnomaly(links);
    if (lowQuality) anomalies.push(lowQuality);
    const scanStatuses = links
      .filter((l) => l.evidence?.type === 'SCAN')
      .map((l) => {
        const status = l.evidence!.metadata?.evidenceStatus;
        return typeof status === 'string' ? status : '';
      });
    const insufficientScans = scanStatuses.filter((s) => s === 'INSUFFICIENT').length;
    if (insufficientScans > 0) {
      anomalies.push({
        code: 'INSUFFICIENT_SCAN_EVIDENCE',
        severity: 'INFO',
        message:
          `${insufficientScans} escaneo(s) con evidencia insuficiente no se usaron en el conteo ` +
          '(no implica faltante: el productor puede repetirlos siguiendo las instrucciones).',
        details: { insufficientScans },
      });
    }
    if (profile.system === 'PASTOREO' && countBasis === 'LOWER_BOUND' && detected !== null) {
      anomalies.push({
        code: 'LIMITED_COVERAGE_GRAZING',
        severity: 'INFO',
        message: profile.coverageNote,
        details: { system: profile.system },
      });
    }
    if (expectedDevices > cameraLinks.length) {
      anomalies.push({
        code: 'DEVICE_NO_SIGNAL',
        severity: 'WARNING',
        message: `${expectedDevices - cameraLinks.length} de ${expectedDevices} cámaras no enviaron capturas.`,
        details: { expectedDevices, reporting: cameraLinks.length },
      });
    }

    const roundedConfidence = confidence === null ? null : Math.round(confidence * 1000) / 1000;
    const quality = averageQuality(used);
    const declared = ctx.asset.declaredQuantity;
    const modelIds = [...new Set(used.map((l) => l.aiModelVersionId).filter(Boolean))];
    return {
      detectedQuantity: detected,
      countBasis,
      confidence: roundedConfidence,
      averageQuality: quality,
      primaryEvidenceCount: used.length,
      newestEvidenceAt: newestCapture(used),
      aiModelVersionId: modelIds.length === 1 ? modelIds[0]! : null,
      expectedDevices,
      activeDevices: cameraLinks.length,
      vegetationChangePct: null,
      anomalies,
      metrics: [
        { key: 'declared_quantity', value: declared, unit: 'HEAD', source: 'asset' },
        ...(detected !== null
          ? [
              {
                key: 'detected_quantity',
                value: detected,
                unit: 'HEAD',
                source: 'computer_vision',
              },
              {
                key: 'absolute_difference',
                value: Math.abs(detected - declared),
                unit: 'HEAD',
                source: 'computer_vision',
              },
              {
                key: 'relative_error',
                value: Math.round(((detected - declared) / declared) * 10_000) / 10_000,
                source: 'computer_vision',
              },
              {
                key: 'match_percentage',
                value:
                  Math.round(
                    (Math.min(detected, declared) / Math.max(detected, declared)) * 10_000,
                  ) / 100,
                unit: '%',
                source: 'computer_vision',
              },
            ]
          : []),
        ...(unique
          ? [
              {
                key: 'detections_sum',
                value: unique.detectionsSum,
                unit: 'HEAD',
                source: 'computer_vision',
              },
              {
                key: 'unique_estimated',
                value: unique.uniqueEstimate,
                unit: 'HEAD',
                source: 'computer_vision',
              },
              {
                key: 'overlap_groups',
                value: unique.groups.filter((g) => g.evidenceIds.length > 1).length,
                source: 'computer_vision',
              },
            ]
          : []),
        ...(roundedConfidence !== null
          ? [{ key: 'detection_confidence', value: roundedConfidence, source: 'computer_vision' }]
          : []),
        ...(quality !== null
          ? [{ key: 'image_quality_avg', value: quality, source: 'computer_vision' }]
          : []),
        { key: 'evidence_primary_count', value: used.length, source: 'pipeline' },
        {
          key: 'count_lower_bound',
          value: countBasis === 'LOWER_BOUND' ? 1 : 0,
          source: 'pipeline',
          details: {
            basis: countBasis,
            explanation:
              countBasis === 'CENSUS'
                ? 'Conteo en paso controlado: comparable con lo declarado'
                : 'Fotos, cámaras, barridos o corrales: cuentan la parte observada del rodeo (cota inferior)',
          },
        },
        {
          key: 'production_system',
          value: LIVESTOCK_SYSTEM_CODE[profile.system],
          source: 'asset',
          details: {
            system: profile.system,
            label: profile.label,
            declaredSystem: profile.declaredSystem,
            inferred: profile.inferred,
            coverageNote: profile.coverageNote,
          },
        },
        ...(scanStatuses.length
          ? [
              {
                key: 'scan_evidence_status',
                value: scanStatuses.filter((s) => s === 'VALIDATED').length,
                source: 'bovine_scanner',
                details: {
                  validated: scanStatuses.filter((s) => s === 'VALIDATED').length,
                  inconclusive: scanStatuses.filter((s) => s === 'INCONCLUSIVE').length,
                  insufficient: insufficientScans,
                },
              },
            ]
          : []),
        ...(detected !== null && declared > 0
          ? [
              {
                key: 'coverage_ratio',
                value: Math.round((Math.min(detected, declared) / declared) * 10_000) / 10_000,
                source: 'computer_vision',
              },
            ]
          : []),
        ...(scansUsed ? [{ key: 'scans_used', value: scansUsed, source: 'bovine_scanner' }] : []),
        { key: 'cameras_expected', value: expectedDevices, source: 'devices' },
        { key: 'cameras_reporting', value: cameraLinks.length, source: 'devices' },
      ],
    };
  }
}
