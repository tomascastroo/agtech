import { Injectable } from '@nestjs/common';
import type { GeoPoint } from '../../../../common/geo/geojson.js';
import { EstablishmentsRepository } from '../../../establishments/infrastructure/establishments.repository.js';
import { ExternalDataService } from '../../../external-data/application/external-data.service.js';
import type { RegistryStatus } from '../../../scoring/domain/scoring.types.js';
import type { Anomaly } from '../../domain/verification.types.js';
import type { VerificationEvidenceEntity } from '../../infrastructure/verification-evidence.entity.js';
import type { MetricInput, PipelineContext } from './pipeline-context.js';

/** Tolerancia sobre el límite del establecimiento (error GPS, cámaras sobre alambrados). */
const BOUNDARY_TOLERANCE_M = 250;
/** Radio aceptado alrededor del casco cuando el establecimiento no tiene límite cargado. */
const FALLBACK_RADIUS_M = 5_000;
const REGISTRY_DISCREPANCY_THRESHOLD = 0.1;

export interface CrossCheckResult {
  location: { verified: boolean | null; distanceM: number | null; checkedPoints: number };
  registry: {
    status: RegistryStatus;
    registeredQuantity: number | null;
    snapshotId: string | null;
  };
  anomalies: Anomaly[];
  metrics: MetricInput[];
}

/** Cruces de información: geofencing de la evidencia y registro oficial de existencias. */
@Injectable()
export class CrossChecksService {
  constructor(
    private readonly establishments: EstablishmentsRepository,
    private readonly externalData: ExternalDataService,
  ) {}

  async run(ctx: PipelineContext, links: VerificationEvidenceEntity[]): Promise<CrossCheckResult> {
    const anomalies: Anomaly[] = [];
    const metrics: MetricInput[] = [];

    const points = links
      .filter((l) => l.role !== 'EXCLUDED' && l.evidence?.location)
      .map((l) => l.evidence!.location as GeoPoint);
    let verified: boolean | null = null;
    let maxOutsideDistance: number | null = null;
    for (const point of points) {
      const check = await this.establishments.checkPoint(
        ctx.establishment.id,
        point,
        BOUNDARY_TOLERANCE_M,
        FALLBACK_RADIUS_M,
      );
      if (!check) continue;
      verified = (verified ?? true) && check.inside;
      if (!check.inside) maxOutsideDistance = Math.max(maxOutsideDistance ?? 0, check.distanceM);
    }
    if (points.length === 0 && ctx.asset.area) {
      const check = await this.establishments.checkArea(
        ctx.establishment.id,
        ctx.asset.area,
        BOUNDARY_TOLERANCE_M,
      );
      if (check) {
        verified = check.inside;
        if (!check.inside) maxOutsideDistance = check.distanceM;
      }
    }
    if (verified === false) {
      anomalies.push({
        code: 'LOCATION_MISMATCH',
        severity: 'CRITICAL',
        message:
          points.length > 0
            ? `Evidencia georreferenciada a ${Math.round(maxOutsideDistance ?? 0)} m del establecimiento declarado.`
            : 'La superficie declarada del activo excede el límite del establecimiento.',
        details: { distanceM: maxOutsideDistance },
      });
    }
    if (verified !== null) {
      metrics.push({
        key: 'location_verified',
        value: verified ? 1 : 0,
        source: 'geofence',
        details: {
          points: points.length,
          method: points.length ? 'evidence_points' : 'asset_area',
        },
      });
    }

    let registry: CrossCheckResult['registry'] = {
      status: 'NOT_APPLICABLE',
      registeredQuantity: null,
      snapshotId: null,
    };
    if (ctx.assetType.category === 'LIVESTOCK') {
      if (!ctx.establishment.renspa) {
        registry = { status: 'NOT_FOUND', registeredQuantity: null, snapshotId: null };
      } else {
        const { lookup, snapshot } = await this.externalData.livestockRegistry({
          organizationId: ctx.asset.organizationId,
          renspa: ctx.establishment.renspa,
          assetId: ctx.asset.id,
          establishmentId: ctx.establishment.id,
          verificationRunId: ctx.run.id,
        });
        registry = {
          status: lookup.status,
          registeredQuantity: lookup.status === 'OK' ? lookup.record.registeredHeads : null,
          snapshotId: snapshot.id,
        };
        if (lookup.status === 'OK') {
          const declared = ctx.asset.declaredQuantity;
          const diff = Math.abs(lookup.record.registeredHeads - declared) / declared;
          metrics.push({
            key: 'registry_quantity',
            value: lookup.record.registeredHeads,
            unit: 'HEAD',
            source: 'registry',
            details: { snapshotId: snapshot.id, campaign: lookup.record.lastCampaign },
          });
          if (diff > REGISTRY_DISCREPANCY_THRESHOLD) {
            anomalies.push({
              code: 'REGISTRY_DISCREPANCY',
              severity: 'WARNING',
              message: `El registro oficial informa ${lookup.record.registeredHeads.toLocaleString('es-AR')} cabezas, ${Math.round(diff * 100)} % de diferencia con lo declarado.`,
              details: { registered: lookup.record.registeredHeads, declared },
            });
          }
        }
      }
    }
    return {
      location: { verified, distanceM: maxOutsideDistance, checkedPoints: points.length },
      registry,
      anomalies,
      metrics,
    };
  }
}
