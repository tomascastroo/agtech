import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type PortfolioState = 'OK' | 'ALERTA' | 'EN_REVISION' | 'OBSERVADO';

export interface PortfolioRow {
  assetId: string;
  assetName: string;
  assetTypeCode: string;
  assetTypeName: string;
  establishmentId: string;
  establishmentName: string;
  holderName: string;
  province: string;
  quantity: number;
  declaredQuantity: number;
  unit: string;
  status: string;
  state: PortfolioState;
  lastVerifiedAt: Date | null;
  lastScore: number | null;
  riskLevel: string | null;
  openAlerts: number;
  highestSeverity: string | null;
  guaranteeActive: boolean;
  declaredValue: number | null;
  currency: string;
  location: unknown;
  /** DEMO = creado con "Simular solicitud" (datos ficticios). */
  dataSource: 'REAL' | 'DEMO';
}

function state(status: string, highestSeverity: string | null): PortfolioState {
  if (highestSeverity === 'CRITICAL' || highestSeverity === 'WARNING') return 'ALERTA';
  if (status === 'PENDING_VERIFICATION' || status === 'DRAFT') return 'EN_REVISION';
  if (status === 'VERIFIED') return 'OK';
  return 'OBSERVADO';
}

/** Modelo de lectura de la cartera: consultas agregadas para dashboard y monitoreo. */
@Injectable()
export class PortfolioService {
  constructor(private readonly dataSource: DataSource) {}

  async rows(organizationId: string): Promise<PortfolioRow[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT a.id AS asset_id, a.name AS asset_name, t.code AS type_code, t.name AS type_name,
              e.id AS establishment_id, e.name AS establishment_name, e.holder_name, e.province,
              a.declared_quantity, a.last_detected_quantity, a.unit, a.status, a.last_verified_at, a.last_score,
              a.declared_value, a.currency, ST_AsGeoJSON(a.location)::json AS location, a.data_source,
              r.risk_level,
              (SELECT count(*) FROM alerts al WHERE al.asset_id = a.id AND al.status <> 'RESOLVED')::int AS open_alerts,
              (SELECT al.severity FROM alerts al WHERE al.asset_id = a.id AND al.status <> 'RESOLVED'
                ORDER BY CASE al.severity WHEN 'CRITICAL' THEN 3 WHEN 'WARNING' THEN 2 ELSE 1 END DESC LIMIT 1) AS highest,
              EXISTS (SELECT 1 FROM guarantees g WHERE g.asset_id = a.id AND g.status = 'ACTIVE') AS guarantee_active
         FROM assets a
         JOIN asset_types t ON t.id = a.asset_type_id
         JOIN establishments e ON e.id = a.establishment_id
         LEFT JOIN verification_results r ON r.verification_run_id = a.last_verification_run_id
        WHERE a.organization_id = $1 AND a.deleted_at IS NULL
        ORDER BY e.name, a.name`,
      [organizationId],
    );
    return rows.map((r) => ({
      assetId: r.asset_id as string,
      assetName: r.asset_name as string,
      assetTypeCode: r.type_code as string,
      assetTypeName: r.type_name as string,
      establishmentId: r.establishment_id as string,
      establishmentName: r.establishment_name as string,
      holderName: r.holder_name as string,
      province: r.province as string,
      quantity: Number(r.last_detected_quantity ?? r.declared_quantity),
      declaredQuantity: Number(r.declared_quantity),
      unit: r.unit as string,
      status: r.status as string,
      state: state(r.status as string, (r.highest as string | null) ?? null),
      lastVerifiedAt: (r.last_verified_at as Date | null) ?? null,
      lastScore: (r.last_score as number | null) ?? null,
      riskLevel: (r.risk_level as string | null) ?? null,
      openAlerts: r.open_alerts as number,
      highestSeverity: (r.highest as string | null) ?? null,
      guaranteeActive: r.guarantee_active as boolean,
      declaredValue: r.declared_value === null ? null : Number(r.declared_value),
      currency: r.currency as string,
      location: r.location,
      dataSource: r.data_source as 'REAL' | 'DEMO',
    }));
  }

  /**
   * Indicadores de la cartera. Solo cuentan datos REALES: las solicitudes de demostración se
   * informan aparte (`operations.demoRequests`) para que nunca se mezclen con la cartera real.
   */
  async dashboard(organizationId: string) {
    const rows = (await this.rows(organizationId)).filter((r) => r.dataSource === 'REAL');
    const [alertCounts, latestVerifications, recentAlerts] = await Promise.all([
      this.dataSource.query(
        `SELECT al.severity, count(*)::int AS count FROM alerts al
           JOIN assets a ON a.id = al.asset_id
          WHERE al.organization_id = $1 AND al.status <> 'RESOLVED' AND a.data_source = 'REAL'
          GROUP BY al.severity`,
        [organizationId],
      ) as Promise<{ severity: string; count: number }[]>,
      this.dataSource.query(
        `SELECT vr.id, vr.status, vr.trigger, vr.completed_at, vr.queued_at, a.id AS asset_id, a.name AS asset_name,
                t.name AS type_name, e.name AS establishment_name, r.final_score, r.outcome,
                r.detected_quantity, r.declared_quantity, r.unit, r.match_percentage
           FROM verification_runs vr
           JOIN assets a ON a.id = vr.asset_id
           JOIN asset_types t ON t.id = a.asset_type_id
           JOIN establishments e ON e.id = a.establishment_id
           LEFT JOIN verification_results r ON r.verification_run_id = vr.id
          WHERE vr.organization_id = $1 AND a.data_source = 'REAL'
          ORDER BY vr.created_at DESC LIMIT 6`,
        [organizationId],
      ) as Promise<Record<string, unknown>[]>,
      this.dataSource.query(
        `SELECT al.id, al.title, al.severity, al.status, al.created_at, a.id AS asset_id, a.name AS asset_name,
                e.name AS establishment_name
           FROM alerts al
           JOIN assets a ON a.id = al.asset_id
           JOIN establishments e ON e.id = a.establishment_id
          WHERE al.organization_id = $1 AND al.status <> 'RESOLVED' AND a.data_source = 'REAL'
          ORDER BY CASE al.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, al.created_at DESC
          LIMIT 6`,
        [organizationId],
      ) as Promise<Record<string, unknown>[]>,
    ]);

    // Indicadores operativos: qué está pendiente y de quién.
    const [ops] = (await this.dataSource.query(
      `SELECT
         (SELECT count(*)::int FROM guarantee_requests
           WHERE organization_id = $1 AND data_source = 'REAL'
             AND status IN ('INVITED','IN_PROGRESS')) AS "waitingProducer",
         (SELECT count(*)::int FROM guarantee_requests
           WHERE organization_id = $1 AND data_source = 'DEMO') AS "demoRequests",
         (SELECT count(*)::int FROM information_requests ir
           JOIN guarantee_requests gr ON gr.id = ir.guarantee_request_id
           WHERE ir.organization_id = $1 AND ir.status = 'OPEN' AND gr.data_source = 'REAL') AS "openInformationRequests",
         (SELECT count(*)::int FROM documents d JOIN document_analyses da ON da.document_id = d.id
           WHERE d.organization_id = $1 AND d.deleted_at IS NULL AND d.status = 'PENDING_REVIEW'
             AND d.data_source = 'REAL'
             AND da.status IN ('REVIEW_REQUIRED','FAILED')) AS "documentsToReview",
         (SELECT count(*)::int FROM verification_runs vr JOIN assets a ON a.id = vr.asset_id
           WHERE vr.organization_id = $1 AND a.data_source = 'REAL'
             AND vr.status IN ('PENDING','PROCESSING')) AS "verificationsInProgress",
         (SELECT count(*)::int FROM verification_runs vr JOIN assets a ON a.id = vr.asset_id
           WHERE vr.organization_id = $1 AND a.data_source = 'REAL' AND vr.status = 'COMPLETED'
             AND vr.completed_at > now() - interval '30 days') AS "verificationsCompleted30d",
         (SELECT count(DISTINCT producer_tax_id)::int FROM guarantee_requests
           WHERE organization_id = $1 AND data_source = 'REAL') AS producers`,
      [organizationId],
    )) as Record<string, number>[];

    const scored = rows.filter(
      (r) => r.lastScore !== null && r.declaredValue !== null && r.currency === 'USD',
    );
    const totalValue = scored.reduce((acc, r) => acc + (r.declaredValue ?? 0), 0);
    const weightedScore = totalValue
      ? Math.round(
          scored.reduce((acc, r) => acc + (r.lastScore ?? 0) * (r.declaredValue ?? 0), 0) /
            totalValue,
        )
      : null;

    const byType = new Map<
      string,
      { code: string; name: string; count: number; declaredValueUsd: number; scores: number[] }
    >();
    for (const row of rows) {
      const entry = byType.get(row.assetTypeCode) ?? {
        code: row.assetTypeCode,
        name: row.assetTypeName,
        count: 0,
        declaredValueUsd: 0,
        scores: [],
      };
      entry.count += 1;
      if (row.currency === 'USD') entry.declaredValueUsd += row.declaredValue ?? 0;
      if (row.lastScore !== null) entry.scores.push(row.lastScore);
      byType.set(row.assetTypeCode, entry);
    }

    const riskDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 } as Record<string, number>;
    for (const row of rows)
      if (row.riskLevel)
        riskDistribution[row.riskLevel] = (riskDistribution[row.riskLevel] ?? 0) + 1;

    return {
      kpis: {
        portfolioAssets: rows.length,
        verified: rows.filter((r) => r.status === 'VERIFIED').length,
        inReview: rows.filter((r) => r.state === 'EN_REVISION').length,
        withAlerts: rows.filter((r) => r.state === 'ALERTA').length,
        activeGuarantees: rows.filter((r) => r.guaranteeActive).length,
        guaranteedValueUsd: rows
          .filter((r) => r.guaranteeActive && r.currency === 'USD')
          .reduce((acc, r) => acc + (r.declaredValue ?? 0), 0),
        monitoredAssets: rows.length,
        openAlerts: alertCounts.reduce((acc, a) => acc + a.count, 0),
      },
      operations: ops ?? {},
      alertsBySeverity: Object.fromEntries(alertCounts.map((a) => [a.severity, a.count])),
      risk: {
        weightedScore,
        portfolioValueUsd: totalValue,
        distribution: riskDistribution,
      },
      byAssetType: [...byType.values()]
        .map(({ scores, ...rest }) => ({
          ...rest,
          averageScore: scores.length
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null,
        }))
        .sort((a, b) => b.declaredValueUsd - a.declaredValueUsd),
      latestVerifications: latestVerifications.map((v) => ({
        id: v.id,
        status: v.status,
        trigger: v.trigger,
        completedAt: v.completed_at,
        queuedAt: v.queued_at,
        assetId: v.asset_id,
        assetName: v.asset_name,
        typeName: v.type_name,
        establishmentName: v.establishment_name,
        finalScore: v.final_score,
        outcome: v.outcome,
        detectedQuantity: v.detected_quantity === null ? null : Number(v.detected_quantity),
        declaredQuantity: v.declared_quantity === null ? null : Number(v.declared_quantity),
        unit: v.unit,
        matchPercentage: v.match_percentage === null ? null : Number(v.match_percentage),
      })),
      recentAlerts: recentAlerts.map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.severity,
        status: a.status,
        createdAt: a.created_at,
        assetId: a.asset_id,
        assetName: a.asset_name,
        establishmentName: a.establishment_name,
      })),
    };
  }
}
