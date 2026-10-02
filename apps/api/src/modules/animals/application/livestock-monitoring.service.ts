import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundError } from '../../../common/domain/errors.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import {
  detectLivestockChanges,
  type LivestockHistoryRow,
} from '../../verification/domain/livestock-history.js';
import type { VerificationOutcome } from '../../verification/domain/verification.types.js';
import { formatEid } from '../domain/rfid.js';
import { reconcileVisualRfid, type RfidRead, type VisualCrossing } from '../domain/visual-rfid.js';

const RFID_WINDOW_DAYS = 30;
/** Margen alrededor del escaneo fijo para buscar lecturas del mismo paso por la manga. */
const PASSAGE_MARGIN_MS = 60_000;
const HISTORY_LIMIT = 24;

/**
 * Producto ganadero para la entidad: conciliación visual + RFID del rodeo y su historial
 * verificación tras verificación (monitoreo recurrente). Solo lectura, siempre filtrado por la
 * organización del usuario.
 */
@Injectable()
export class LivestockMonitoringService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly assets: AssetsRepository,
  ) {}

  private async asset(organizationId: string, assetId: string) {
    const asset = await this.assets.findById(organizationId, assetId);
    if (!asset) throw new NotFoundError('Activo', assetId);
    return asset;
  }

  async reconciliation(organizationId: string, assetId: string) {
    await this.asset(organizationId, assetId);
    const q = <T>(sql: string, params: unknown[]) =>
      this.dataSource.query(sql, params) as Promise<T[]>;
    const [[latest], reads, [scan]] = await Promise.all([
      q<{ observed: number; completedAt: Date; basis: string | null }>(
        `SELECT res.detected_quantity::float AS observed, r.completed_at AS "completedAt",
                m.details->>'basis' AS basis
           FROM verification_runs r
           JOIN verification_results res ON res.verification_run_id = r.id
           LEFT JOIN verification_metrics m
             ON m.verification_run_id = r.id AND m.key = 'count_lower_bound'
          WHERE r.organization_id = $1 AND r.asset_id = $2 AND r.status = 'COMPLETED'
            AND res.detected_quantity IS NOT NULL
          ORDER BY r.completed_at DESC LIMIT 1`,
        [organizationId, assetId],
      ),
      q<{ eid: string; at: Date; status: RfidRead['status']; source: string }>(
        `SELECT electronic_id AS eid, observed_at AS at, status, source
           FROM rfid_observations
          WHERE organization_id = $1 AND asset_id = $2
            AND observed_at > now() - make_interval(days => $3)`,
        [organizationId, assetId, RFID_WINDOW_DAYS],
      ),
      q<{
        id: string;
        startedAt: Date;
        endedAt: Date | null;
        officialCount: number;
        crossings: { trackId: number; frame: number; direction: number }[] | null;
      }>(
        `SELECT id, started_at AS "startedAt", ended_at AS "endedAt",
                official_count AS "officialCount", server_result->'crossings' AS crossings
           FROM scan_sessions
          WHERE organization_id = $1 AND asset_id = $2 AND mode = 'FIXED' AND status = 'COMPLETED'
          ORDER BY started_at DESC LIMIT 1`,
        [organizationId, assetId],
      ),
    ]);

    let passage = null;
    if (scan?.crossings?.length) {
      const frames = await q<{ index: number; ms: number }>(
        `SELECT frame_index AS index, captured_ms AS ms FROM scan_frames
          WHERE scan_session_id = $1 AND kind = 'SAMPLE'`,
        [scan.id],
      );
      const msByFrame = new Map(frames.map((f) => [f.index, f.ms]));
      passage = {
        scanId: scan.id,
        observed: scan.officialCount,
        crossings: passageCrossings(scan.crossings, scan.startedAt, msByFrame),
        from: new Date(scan.startedAt.getTime() - PASSAGE_MARGIN_MS),
        to: new Date((scan.endedAt ?? scan.startedAt).getTime() + PASSAGE_MARGIN_MS),
      };
    }
    const result = reconcileVisualRfid({
      observed: latest?.observed ?? null,
      observedBasis:
        latest?.basis === 'CENSUS' || latest?.basis === 'LOWER_BOUND' ? latest.basis : null,
      observedAt: latest?.completedAt ?? null,
      reads: reads.map((r) => ({
        eid: r.eid,
        at: r.at,
        status: r.status,
        simulated: r.source === 'SIMULATED',
      })),
      passage,
    });
    return {
      ...result,
      windowDays: RFID_WINDOW_DAYS,
      unknownTags: [...new Set(reads.filter((r) => r.status !== 'IDENTIFIED').map((r) => r.eid))]
        .slice(0, 20)
        .map(formatEid),
    };
  }

  async history(organizationId: string, assetId: string) {
    await this.asset(organizationId, assetId);
    const rows = (await this.dataSource.query(
      `SELECT r.id AS "runId", r.completed_at AS date,
              res.declared_quantity::float AS declared, res.detected_quantity::float AS observed,
              res.outcome AS status,
              (SELECT details->>'basis' FROM verification_metrics
                WHERE verification_run_id = r.id AND key = 'count_lower_bound') AS basis,
              (SELECT value::float FROM verification_metrics
                WHERE verification_run_id = r.id AND key = 'coverage_ratio') AS coverage,
              (SELECT count(DISTINCT o.electronic_id)::int FROM rfid_observations o
                WHERE o.organization_id = r.organization_id AND o.asset_id = r.asset_id
                  AND o.source <> 'SIMULATED' AND o.status = 'IDENTIFIED'
                  AND o.observed_at <= r.completed_at
                  AND o.observed_at > r.completed_at - make_interval(days => $3)) AS "rfidReal",
              (SELECT count(*)::int FROM rfid_observations o
                WHERE o.organization_id = r.organization_id AND o.asset_id = r.asset_id
                  AND o.source <> 'SIMULATED'
                  AND o.observed_at <= r.completed_at
                  AND o.observed_at > r.completed_at - make_interval(days => $3)) AS "rfidReadings",
              (SELECT count(DISTINCT o.electronic_id)::int FROM rfid_observations o
                WHERE o.organization_id = r.organization_id AND o.asset_id = r.asset_id
                  AND o.source = 'SIMULATED'
                  AND o.observed_at <= r.completed_at
                  AND o.observed_at > r.completed_at - make_interval(days => $3)) AS "rfidSimulated"
         FROM verification_runs r
         JOIN verification_results res ON res.verification_run_id = r.id
        WHERE r.organization_id = $1 AND r.asset_id = $2 AND r.status = 'COMPLETED'
        ORDER BY r.completed_at DESC LIMIT $4`,
      [organizationId, assetId, RFID_WINDOW_DAYS, HISTORY_LIMIT],
    )) as {
      runId: string;
      date: Date;
      declared: number | null;
      observed: number | null;
      status: VerificationOutcome | null;
      basis: string | null;
      coverage: number | null;
      rfidReal: number;
      rfidReadings: number;
      rfidSimulated: number;
    }[];
    const history: LivestockHistoryRow[] = rows
      .map((r) => ({
        runId: r.runId,
        date: r.date,
        declared: r.declared,
        observed: r.observed,
        basis: (r.basis === 'CENSUS' || r.basis === 'LOWER_BOUND'
          ? r.basis
          : null) as LivestockHistoryRow['basis'],
        rfidIdentified: r.rfidReadings > 0 ? r.rfidReal : null,
        rfidSimulated: r.rfidSimulated,
        coverage: r.coverage,
        status: r.status,
      }))
      .reverse();
    const changes = detectLivestockChanges(history);
    return {
      rows: [...history].reverse(),
      changes: [...changes].reverse(),
      rfidWindowDays: RFID_WINDOW_DAYS,
    };
  }
}

/**
 * Cruces del escaneo fijo en el sentido principal del paso, con la hora del cuadro en que cada
 * animal cruzó por última vez en ese sentido.
 */
export function passageCrossings(
  crossings: readonly { trackId: number; frame: number; direction: number }[],
  startedAt: Date,
  msByFrame: ReadonlyMap<number, number>,
): VisualCrossing[] {
  const total = crossings.reduce((a, c) => a + c.direction, 0);
  const main = total >= 0 ? 1 : -1;
  const net = new Map<number, number>();
  const lastFrame = new Map<number, number>();
  for (const c of crossings) {
    net.set(c.trackId, (net.get(c.trackId) ?? 0) + c.direction);
    if (c.direction === main) lastFrame.set(c.trackId, c.frame);
  }
  return [...net.entries()]
    .filter(([, n]) => Math.sign(n) === main)
    .map(([trackId]) => ({
      trackId,
      at: new Date(startedAt.getTime() + (msByFrame.get(lastFrame.get(trackId)!) ?? 0)),
    }));
}
