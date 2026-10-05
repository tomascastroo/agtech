import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { InvalidStateError, NotFoundError } from '../../../common/domain/errors.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { AlertEntity } from '../../alerts/infrastructure/alert.entity.js';
import {
  REQUIREMENT_CATALOG,
  evaluateRequirements,
  type RequirementCode,
} from '../../documents/domain/document-requirements.js';
import { DocumentAnalysisService } from '../../documents/application/document-analysis.service.js';
import { DocumentsRepository } from '../../documents/infrastructure/documents.repository.js';
import { assess, type Assessment } from '../domain/assessment.js';
import {
  STATE_LABELS,
  type CollateralRiskLevel,
  type CollateralState,
  type ProductionType,
} from '../domain/collateral.types.js';
import {
  DEFAULT_ENGINE_SETTINGS,
  INITIAL_POLICIES,
  type MonitoringPolicy,
} from '../domain/policy.js';
import type { DocumentSignal } from '../domain/score.js';
import {
  BovineGuaranteeEntity,
  CollateralDeclarationEntity,
  CollateralEventEntity,
  CollateralScoreSnapshotEntity,
  CollateralVerificationEntity,
  MonitoringScheduleEntity,
  type EventSource,
} from '../infrastructure/collateral.entities.js';
import {
  observationFromInspection,
  observationFromRun,
  pickObservation,
  type CandidateObservation,
  type RunRow,
} from './collateral-inputs.js';

export type AssessmentTrigger =
  | 'VERIFICACION'
  | 'INSPECCION'
  | 'MOVIMIENTO'
  | 'DECLARACION'
  | 'DOCUMENTO'
  | 'DATOS_GARANTIA'
  | 'RECALCULO'
  | 'PROGRAMADO';

/** Quién origina una acción (para historial y auditoría). */
export type CollateralActor =
  | { kind: 'user'; user: AuthenticatedUser; source?: EventSource }
  | { kind: 'system'; organizationId: string; process: string };

const SISTEMA = 'AgroGarantías (sistema)';

/** Producción declarada (`sistema_productivo` del rodeo) → tipo de producción de la garantía. */
export function productionFromMetadata(metadata: Record<string, unknown> | null): ProductionType {
  switch (metadata?.sistema_productivo) {
    case 'Feedlot':
      return 'FEEDLOT';
    case 'Tambo':
      return 'TAMBO';
    case 'Invernada':
    case 'Recría':
      return 'INVERNADA';
    default:
      return 'CRIA';
  }
}

/**
 * Núcleo de la garantía bovina: crea la garantía, congela la declaración, junta la evidencia que
 * ya registra la plataforma y ejecuta el motor determinista (domain/assessment.ts). Cada
 * evaluación queda como snapshot inmutable; el estado, la agenda y las alertas se derivan de ella.
 * Lo usan la API (comandos), el worker de verificación (al completar una verificación) y el
 * barrido programado de monitoreo.
 */
@Injectable()
export class CollateralService {
  private readonly logger = new Logger(CollateralService.name);

  constructor(
    @InjectRepository(BovineGuaranteeEntity)
    private readonly guarantees: Repository<BovineGuaranteeEntity>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly documents: DocumentsRepository,
    private readonly analyses: DocumentAnalysisService,
  ) {}

  // ------------------------------------------------------------------ ciclo de vida

  /** Garantía de una solicitud BOVINOS recién creada (estado PENDIENTE_DECLARACION). */
  async createForRequest(
    manager: EntityManager,
    request: {
      id: string;
      organizationId: string;
      producerName: string;
      producerTaxId: string;
      requestedAmount: number | null;
      currency: string;
      dataSource: 'REAL' | 'DEMO';
      createdBy: string;
      establishmentId: string | null;
    },
  ): Promise<BovineGuaranteeEntity> {
    const repo = manager.getRepository(BovineGuaranteeEntity);
    const created = await repo.save(
      repo.create({
        organizationId: request.organizationId,
        guaranteeRequestId: request.id,
        establishmentId: request.establishmentId,
        producerName: request.producerName,
        producerTaxId: request.producerTaxId,
        productionType: 'CRIA',
        state: 'PENDIENTE_DECLARACION',
        stateReason: 'El productor todavía no envió su declaración.',
        legalInstrument: 'NO_INFORMADO',
        legalStatus: 'NO_INFORMADO',
        immobilizationStatus: 'NO_INFORMADA',
        amount: request.requestedAmount,
        currency: request.currency === 'ARS' ? 'ARS' : 'USD',
        dataSource: request.dataSource,
        createdBy: request.createdBy,
      }),
    );
    const withCode = await repo.findOneByOrFail({ id: created.id });
    await this.event(manager, withCode, {
      type: 'GARANTIA_CREADA',
      source: 'ENTIDAD',
      actorId: request.createdBy,
      actorLabel: 'Entidad financiera',
      summary: `Garantía ${withCode.code} creada para ${request.producerName}. Pendiente de la declaración del productor.`,
      newState: 'PENDIENTE_DECLARACION',
    });
    return withCode;
  }

  /**
   * El productor envió la declaración: se congela como versión 1 (inmutable) y la garantía queda
   * PENDIENTE_VERIFICACION hasta la verificación inicial.
   */
  async freezeDeclaration(requestId: string, producer: AuthenticatedUser): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const g = await manager.findOne(BovineGuaranteeEntity, {
        where: { guaranteeRequestId: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!g || g.currentDeclarationVersion !== null) return;
      const [row] = (await manager.query(
        `SELECT r.asset_id AS "assetId", a.declared_quantity::int AS heads, a.establishment_id AS "establishmentId",
                e.name, e.renspa, e.province, e.locality,
                (SELECT data FROM asset_metadata m WHERE m.asset_id = a.id ORDER BY version DESC LIMIT 1) AS metadata
           FROM guarantee_requests r
           JOIN assets a ON a.id = r.asset_id
           JOIN establishments e ON e.id = a.establishment_id
          WHERE r.id = $1`,
        [requestId],
      )) as {
        assetId: string;
        heads: number;
        establishmentId: string;
        name: string;
        renspa: string | null;
        province: string;
        locality: string | null;
        metadata: Record<string, unknown> | null;
      }[];
      if (!row) return;
      const production = productionFromMetadata(row.metadata);
      const categories = categoriesFromMetadata(row.metadata);
      const declaration = await manager.save(
        manager.create(CollateralDeclarationEntity, {
          organizationId: g.organizationId,
          guaranteeId: g.id,
          version: 1,
          heads: row.heads,
          categories,
          productionType: production,
          establishment: {
            id: row.establishmentId,
            name: row.name,
            renspa: row.renspa,
            province: row.province,
            locality: row.locality,
          },
          source: 'PRODUCTOR',
          declaredBy: producer.userId,
          declaredByLabel: producer.fullName,
          declaredAt: new Date(),
          reason: null,
          supersedesId: null,
        }),
      );
      await manager.update(
        BovineGuaranteeEntity,
        { id: g.id },
        {
          assetId: row.assetId,
          establishmentId: row.establishmentId,
          productionType: production,
          currentDeclarationVersion: 1,
          expectedHeads: row.heads,
          state: 'PENDIENTE_VERIFICACION',
          stateReason: 'Declaración recibida; falta la verificación inicial.',
        },
      );
      await this.event(manager, g, {
        type: 'DECLARACION_CONGELADA',
        source: 'PRODUCTOR',
        actorId: producer.userId,
        actorLabel: producer.fullName,
        method: 'DECLARACION',
        result: `${row.heads} cabezas`,
        previousState: g.state,
        newState: 'PENDIENTE_VERIFICACION',
        summary: `El productor declaró ${row.heads.toLocaleString('es-AR')} bovinos (${production}). La declaración queda congelada (versión 1).`,
        payload: { declarationId: declaration.id, version: 1 },
      });
      await this.audit.record(
        {
          actor: { kind: 'user', user: producer },
          action: AUDIT_ACTIONS.BOVINE_DECLARATION_FROZEN,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: { version: 1, heads: row.heads, productionType: production },
        },
        manager,
      );
    });
  }

  /** Una verificación del pipeline terminó: se evalúan las garantías activas de ese activo. */
  async onVerificationCompleted(runId: string): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT g.id FROM verification_runs r
         JOIN bovine_guarantees g ON g.asset_id = r.asset_id
        WHERE r.id = $1 AND g.finalized_at IS NULL AND g.current_declaration_version IS NOT NULL`,
      [runId],
    )) as { id: string }[];
    for (const { id } of rows) {
      const g = await this.guarantees.findOneByOrFail({ id });
      await this.reassess(g, 'VERIFICACION', {
        kind: 'system',
        organizationId: g.organizationId,
        process: 'verification-pipeline',
      });
    }
  }

  /** Barrido programado: evalúa las garantías vencidas en agenda o sin evaluación del día. */
  async sweep(now = new Date()): Promise<number> {
    const due = (await this.dataSource.query(
      `SELECT g.id FROM bovine_guarantees g
         LEFT JOIN collateral_score_snapshots s ON s.id = g.last_snapshot_id
        WHERE g.finalized_at IS NULL AND g.current_declaration_version IS NOT NULL
          AND (g.last_snapshot_id IS NULL OR g.next_verification_at <= $1
               OR s.evaluated_at < $1::timestamptz - interval '1 day')
        ORDER BY g.next_verification_at NULLS FIRST
        LIMIT 500`,
      [now],
    )) as { id: string }[];
    for (const { id } of due) {
      const g = await this.guarantees.findOneByOrFail({ id });
      try {
        await this.reassess(g, 'PROGRAMADO', {
          kind: 'system',
          organizationId: g.organizationId,
          process: 'collateral-sweep',
        });
      } catch (error) {
        this.logger.error({ err: error, guaranteeId: id }, 'No se pudo evaluar la garantía');
      }
    }
    return due.length;
  }

  // ------------------------------------------------------------------ evaluación

  /**
   * Junta la evidencia vigente, ejecuta el motor y persiste: snapshot inmutable, verificaciones
   * nuevas, estado y agenda de la garantía, alertas (abre las nuevas y cierra las que dejaron de
   * cumplirse) e historial. Serializado por garantía (advisory lock).
   */
  async reassess(
    guarantee: BovineGuaranteeEntity,
    trigger: AssessmentTrigger,
    actor: CollateralActor,
  ): Promise<{ assessment: Assessment; snapshotId: string }> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [guarantee.id]);
      const g = await manager.findOneByOrFail(BovineGuaranteeEntity, { id: guarantee.id });
      const now = new Date();
      const inputs = await this.loadInputs(manager, g, now);
      const assessment = assess(inputs.engine);
      const snapshot = await manager.save(
        manager.create(CollateralScoreSnapshotEntity, {
          organizationId: g.organizationId,
          guaranteeId: g.id,
          trigger,
          state: assessment.state,
          stateReason: assessment.stateReason.slice(0, 400),
          score: assessment.score.finalScore,
          weightedScore: assessment.score.weightedScore,
          riskLevel: assessment.risk.level,
          riskPoints: assessment.risk.points,
          coverageStatus: assessment.coverage.status,
          coverageRatio: assessment.coverage.ratio,
          expectedHeads: assessment.reconciliation.expected,
          observedHeads: assessment.reconciliation.observed,
          verifiableHeads: assessment.reconciliation.verifiable,
          components: assessment.score.components,
          gates: assessment.score.gates,
          riskFactors: assessment.risk.factors,
          coverage: assessment.coverage,
          reconciliation: assessment.reconciliation,
          schedule: assessment.schedule,
          inputs: inputs.trace,
          engineVersion: assessment.engineVersion,
          evaluatedAt: now,
        }),
      );

      // Verificaciones nuevas (cada verificación del pipeline o inspección realizada, una vez).
      for (const candidate of inputs.unrecorded) {
        await manager.save(
          manager.create(CollateralVerificationEntity, {
            organizationId: g.organizationId,
            guaranteeId: g.id,
            verifiedAt: candidate.observedAt,
            method: candidate.method,
            verificationRunId: candidate.kind === 'VERIFICACION' ? candidate.refId : null,
            inspectionId: candidate.kind === 'INSPECCION' ? candidate.refId : null,
            declaredHeads: assessment.reconciliation.declared,
            expectedHeads: assessment.reconciliation.expected,
            observedHeads: candidate.count,
            verifiedHeads:
              inputs.chosen?.refId === candidate.refId
                ? assessment.reconciliation.verifiable
                : null,
            countBasis: candidate.basis,
            quality: candidate.quality.level,
            qualityReasons: candidate.quality.reasons,
            captureOrigin: candidate.captureOrigin,
            resultState: assessment.state,
            score: assessment.score.finalScore,
            riskLevel: assessment.risk.level,
            evidenceIds: candidate.evidenceIds,
            actorId: actor.kind === 'user' ? actor.user.userId : null,
            actorLabel: candidate.kind === 'INSPECCION' ? 'Inspector' : SISTEMA,
            explanation:
              (inputs.chosen?.refId === candidate.refId
                ? assessment.reconciliation.narrative.join(' ')
                : `Observación ${candidate.basis === 'CENSO' ? 'completa' : 'parcial'} de ${candidate.count} animales; no es la observación vigente (${inputs.why})`) +
              ` Resultado: ${STATE_LABELS[assessment.state]}.`,
            snapshotId: snapshot.id,
          }),
        );
      }

      const s = assessment.schedule;
      const lastEvidence = inputs.chosen?.observedAt ?? null;
      await manager.update(
        BovineGuaranteeEntity,
        { id: g.id },
        {
          state: assessment.state,
          stateReason: assessment.stateReason.slice(0, 400),
          score: assessment.score.finalScore,
          riskLevel: assessment.risk.level,
          coverageStatus: assessment.coverage.status,
          coverageRatio: assessment.coverage.ratio,
          verifiableValue: assessment.coverage.verifiableValue,
          verifiableHeads: assessment.reconciliation.verifiable,
          expectedHeads: assessment.reconciliation.expected,
          lastEvidenceAt: lastEvidence,
          lastVerificationAt: inputs.engine.lastVerificationAt,
          nextVerificationAt: s.nextVerificationAt,
          lastSnapshotId: snapshot.id,
        },
      );
      await manager.query(
        `INSERT INTO monitoring_schedules (organization_id, guarantee_id, risk_level, frequency_days,
             max_evidence_age_days, recommended_method, requires_inspection, last_verification_at,
             next_verification_at, explanation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (guarantee_id) DO UPDATE SET risk_level = EXCLUDED.risk_level,
           frequency_days = EXCLUDED.frequency_days, max_evidence_age_days = EXCLUDED.max_evidence_age_days,
           recommended_method = EXCLUDED.recommended_method, requires_inspection = EXCLUDED.requires_inspection,
           last_verification_at = EXCLUDED.last_verification_at,
           next_verification_at = EXCLUDED.next_verification_at, explanation = EXCLUDED.explanation`,
        [
          g.organizationId,
          g.id,
          s.riskLevel,
          s.frequencyDays,
          s.maxEvidenceAgeDays,
          s.recommendedMethod,
          s.requiresInspection,
          s.lastVerificationAt,
          s.nextVerificationAt,
          s.explanation.slice(0, 400),
        ],
      );

      await this.syncAlerts(manager, g, assessment, snapshot.id, inputs.evidenceIds);

      const actorLabel = actor.kind === 'user' ? actor.user.fullName : SISTEMA;
      const source: EventSource = actor.kind === 'user' ? (actor.source ?? 'ENTIDAD') : 'SISTEMA';
      const changed = g.state !== assessment.state;
      await this.event(manager, g, {
        type: changed ? 'ESTADO_CAMBIADO' : 'EVALUACION',
        source,
        actorId: actor.kind === 'user' ? actor.user.userId : null,
        actorLabel,
        method: inputs.chosen?.method ?? null,
        evidence: inputs.evidenceIds.map((id) => ({ kind: 'evidence', id })),
        result: `Score ${assessment.score.finalScore ?? '—'} · riesgo ${assessment.risk.level}`,
        previousState: g.state,
        newState: assessment.state,
        summary: (changed
          ? `${STATE_LABELS[g.state]} → ${STATE_LABELS[assessment.state]}: ${assessment.stateReason}`
          : `Evaluación (${trigger.toLowerCase()}): ${STATE_LABELS[assessment.state]}. ${assessment.stateReason}`
        ).slice(0, 600),
        payload: { snapshotId: snapshot.id, trigger },
      });
      await this.audit.record(
        {
          actor:
            actor.kind === 'user'
              ? { kind: 'user', user: actor.user }
              : { kind: 'system', organizationId: actor.organizationId, process: actor.process },
          action: AUDIT_ACTIONS.BOVINE_GUARANTEE_ASSESSED,
          resourceType: 'bovine_guarantee',
          resourceId: g.id,
          metadata: {
            trigger,
            snapshotId: snapshot.id,
            previousState: g.state,
            newState: assessment.state,
            score: assessment.score.finalScore,
            riskLevel: assessment.risk.level,
          },
        },
        manager,
      );
      return { assessment, snapshotId: snapshot.id };
    });
  }

  /** Política efectiva: la de la organización si existe, si no la global. */
  async policyFor(
    organizationId: string,
    production: ProductionType,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<MonitoringPolicy> {
    const rows = (await manager.query(
      `SELECT DISTINCT ON (risk_level) risk_level AS "riskLevel", frequency_days AS "frequencyDays",
              max_evidence_age_days AS "maxEvidenceAgeDays", recommended_method AS "recommendedMethod",
              requires_inspection AS "requiresInspection"
         FROM collateral_monitoring_policies
        WHERE production_type = $2 AND (organization_id = $1 OR organization_id IS NULL)
        ORDER BY risk_level, organization_id NULLS LAST`,
      [organizationId, production],
    )) as {
      riskLevel: CollateralRiskLevel;
      frequencyDays: number;
      maxEvidenceAgeDays: number;
      recommendedMethod: MonitoringPolicy['BAJO']['recommendedMethod'];
      requiresInspection: boolean;
    }[];
    const policy: MonitoringPolicy = { ...INITIAL_POLICIES[production] };
    for (const r of rows)
      policy[r.riskLevel] = {
        frequencyDays: r.frequencyDays,
        maxEvidenceAgeDays: r.maxEvidenceAgeDays,
        recommendedMethod: r.recommendedMethod,
        requiresInspection: r.requiresInspection,
      };
    return policy;
  }

  // ------------------------------------------------------------------ insumos del motor

  private async loadInputs(manager: EntityManager, g: BovineGuaranteeEntity, now: Date) {
    const q = <T>(sql: string, params: unknown[]) => manager.query(sql, params) as Promise<T[]>;
    const [declaration] = await q<{ heads: number; declaredAt: Date }>(
      `SELECT heads, declared_at AS "declaredAt" FROM collateral_declarations
        WHERE guarantee_id = $1 ORDER BY version DESC LIMIT 1`,
      [g.id],
    );
    const movements = await q<{
      direction: 'EGRESO' | 'INGRESO';
      heads: number;
      sourceLevel: 'OFICIAL' | 'DOCUMENTADO' | 'DECLARADO';
      verificationState: 'PENDIENTE' | 'VERIFICADO' | 'RECHAZADO';
    }>(
      `SELECT direction, heads, source_level AS "sourceLevel", verification_state AS "verificationState"
         FROM collateral_movements WHERE guarantee_id = $1 AND occurred_at >= $2`,
      [g.id, declaration?.declaredAt ?? new Date(0)],
    );
    const undocumentedExits = movements
      .filter(
        (m) =>
          m.direction === 'EGRESO' &&
          m.sourceLevel === 'DECLARADO' &&
          m.verificationState !== 'RECHAZADO',
      )
      .reduce((a, m) => a + m.heads, 0);

    // Observaciones: verificaciones del pipeline e inspecciones realizadas.
    const candidates: CandidateObservation[] = [];
    let hasRun = false;
    if (g.assetId) {
      const runs = await q<{
        runId: string;
        completedAt: Date;
        detected: number | null;
        confidence: number | null;
        locationVerified: boolean | null;
        basis: string | null;
      }>(
        `SELECT r.id AS "runId", r.completed_at AS "completedAt",
                res.detected_quantity::float AS detected, res.confidence::float AS confidence,
                res.location_verified AS "locationVerified",
                (SELECT m.details->>'basis' FROM verification_metrics m
                  WHERE m.verification_run_id = r.id AND m.key = 'count_lower_bound') AS basis
           FROM verification_runs r JOIN verification_results res ON res.verification_run_id = r.id
          WHERE r.asset_id = $1 AND r.status = 'COMPLETED'
          ORDER BY r.completed_at DESC LIMIT 20`,
        [g.assetId],
      );
      hasRun = runs.length > 0;
      const evidence = runs.length
        ? await q<{
            runId: string;
            id: string;
            type: string;
            deviceId: string | null;
            capturedAt: Date;
            hasLocation: boolean;
            metadata: Record<string, unknown>;
            sourceSimulated: boolean;
          }>(
            `SELECT ve.verification_run_id AS "runId", e.id, e.type, e.device_id AS "deviceId",
                    e.captured_at AS "capturedAt", e.location IS NOT NULL AS "hasLocation", e.metadata,
                    s.is_simulated AS "sourceSimulated"
               FROM verification_evidence ve
               JOIN evidence e ON e.id = ve.evidence_id
               JOIN evidence_sources s ON s.id = e.source_id
              WHERE ve.verification_run_id = ANY($1) AND ve.role = 'PRIMARY'`,
            [runs.map((r) => r.runId)],
          )
        : [];
      for (const run of runs) {
        const row: RunRow = { ...run, evidence: evidence.filter((e) => e.runId === run.runId) };
        const obs = observationFromRun(row);
        if (obs) candidates.push(obs);
      }
    }
    const inspections = await q<{
      id: string;
      performedAt: Date;
      observedHeads: number;
      fullCount: boolean;
      hasLocation: boolean;
      evidenceIds: string[];
      result: string;
      locationVerified: boolean | null;
    }>(
      `SELECT i.id, i.performed_at AS "performedAt", i.observed_heads AS "observedHeads",
              coalesce(i.full_count, false) AS "fullCount", i.location IS NOT NULL AS "hasLocation",
              i.evidence_ids AS "evidenceIds", i.result,
              CASE WHEN i.location IS NULL THEN NULL ELSE EXISTS (
                SELECT 1 FROM establishment_locations l
                 WHERE l.establishment_id = g.establishment_id AND (
                   (l.boundary IS NOT NULL AND ST_DWithin(l.boundary::geography, i.location::geography, 250))
                   OR (l.boundary IS NULL AND ST_DWithin(l.point::geography, i.location::geography, 5000)))
              ) END AS "locationVerified"
         FROM collateral_inspections i JOIN bovine_guarantees g ON g.id = i.guarantee_id
        WHERE i.guarantee_id = $1 AND i.status = 'REALIZADA'
        ORDER BY i.performed_at DESC`,
      [g.id],
    );
    for (const ins of inspections) candidates.push(observationFromInspection(ins));

    const policy = await this.policyFor(g.organizationId, g.productionType, manager);
    const [prevSnap] = await q<{
      state: CollateralState;
      score: number | null;
      riskLevel: CollateralRiskLevel;
      expected: number | null;
    }>(
      `SELECT state, score, risk_level AS "riskLevel", expected_heads AS expected
         FROM collateral_score_snapshots WHERE guarantee_id = $1 ORDER BY evaluated_at DESC LIMIT 1`,
      [g.id],
    );
    const states = await q<{ state: CollateralState }>(
      `SELECT state FROM collateral_score_snapshots WHERE guarantee_id = $1
        ORDER BY evaluated_at DESC LIMIT 6`,
      [g.id],
    );
    const maxAge = policy[prevSnap?.riskLevel ?? 'MEDIO'].maxEvidenceAgeDays;
    const { chosen, why } = pickObservation(candidates, now, maxAge);

    const recorded = await q<{ runId: string | null; inspectionId: string | null }>(
      `SELECT verification_run_id AS "runId", inspection_id AS "inspectionId"
         FROM collateral_verifications WHERE guarantee_id = $1`,
      [g.id],
    );
    const seen = new Set(recorded.flatMap((r) => [r.runId, r.inspectionId]).filter(Boolean));
    const unrecorded = candidates.filter((c) => !seen.has(c.refId));
    const [lastVer] = await q<{ at: Date | null }>(
      `SELECT max(verified_at) AS at FROM collateral_verifications WHERE guarantee_id = $1`,
      [g.id],
    );
    const lastVerificationAt = [lastVer?.at ?? null, ...unrecorded.map((c) => c.observedAt)]
      .filter((d): d is Date => d instanceof Date)
      .reduce<Date | null>((a, d) => (!a || d > a ? d : a), null);

    // RFID (Manga + RFID): caravanas confirmadas reales, pasos ambiguos y de otro establecimiento.
    let rfid: { identified: number; ambiguous: number; otherEstablishment: number } | null = null;
    if (g.assetId) {
      const [r] = await q<{ identified: number; ambiguous: number; other: number }>(
        `SELECT
           (SELECT count(DISTINCT c.electronic_id)::int FROM chute_captures c
             WHERE c.asset_id = $1 AND c.status = 'CONFIRMED' AND c.rfid_source <> 'SIMULATED') AS identified,
           (SELECT count(*)::int FROM chute_captures c
             WHERE c.asset_id = $1 AND c.status = 'AMBIGUOUS' AND c.rfid_source <> 'SIMULATED') AS ambiguous,
           (SELECT count(DISTINCT o.electronic_id)::int FROM rfid_observations o
             WHERE o.asset_id = $1 AND o.status = 'OTHER_ESTABLISHMENT' AND o.source <> 'SIMULATED') AS other`,
        [g.assetId],
      );
      if (r && (r.identified > 0 || r.ambiguous > 0 || r.other > 0))
        rfid = { identified: r.identified, ambiguous: r.ambiguous, otherEstablishment: r.other };
    }

    const { documents, required } = await this.documentSignals(manager, g);

    // Posible doble garantía (dentro de esta entidad): mismo rodeo o mismas caravanas en otra
    // garantía activa. Entre entidades haría falta TRAZA (sin conexión).
    const [double] = g.assetId
      ? await q<{ found: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM bovine_guarantees o
              WHERE o.organization_id = $2 AND o.id <> $3 AND o.finalized_at IS NULL
                AND o.state NOT IN ('FINALIZADA','VENCIDA')
                AND (o.asset_id = $1 OR EXISTS (
                  SELECT 1 FROM chute_captures a JOIN chute_captures b ON a.electronic_id = b.electronic_id
                   WHERE a.asset_id = $1 AND b.asset_id = o.asset_id AND a.status = 'CONFIRMED'
                     AND b.status = 'CONFIRMED' AND a.rfid_source <> 'SIMULATED' AND b.rfid_source <> 'SIMULATED'))
           ) AS found`,
          [g.assetId, g.organizationId, g.id],
        )
      : [{ found: false }];
    const [alertCount] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts WHERE bovine_guarantee_id = $1
          AND created_at > now() - interval '90 days'`,
      [g.id],
    );
    // Verificaciones seguidas que no permitieron determinar el rodeo (evidencia insuficiente o
    // conteo parcial por debajo de lo esperado). Cuenta verificaciones, no recálculos.
    const expectedNow = Math.max(
      0,
      (declaration?.heads ?? 0) +
        movements
          .filter((m) => m.verificationState !== 'RECHAZADO')
          .reduce((acc, m) => acc + (m.direction === 'EGRESO' ? -m.heads : m.heads), 0),
    );
    const previousVerifications = await q<{
      at: Date;
      quality: string | null;
      basis: string | null;
      observed: number | null;
      expected: number | null;
    }>(
      `SELECT verified_at AS at, quality, count_basis AS basis, observed_heads AS observed,
              expected_heads AS expected
         FROM collateral_verifications WHERE guarantee_id = $1 ORDER BY verified_at DESC LIMIT 10`,
      [g.id],
    );
    const timeline = [
      ...previousVerifications.map((v) => ({
        at: v.at,
        notDeterminable:
          v.quality === 'INSUFICIENTE' ||
          (v.basis === 'COTA_INFERIOR' && (v.observed ?? 0) < (v.expected ?? 0)),
      })),
      ...unrecorded.map((c) => ({
        at: c.observedAt,
        notDeterminable:
          c.quality.level === 'INSUFICIENTE' ||
          (c.basis === 'COTA_INFERIOR' && c.count < expectedNow),
      })),
    ].sort((x, y) => y.at.getTime() - x.at.getTime());
    let consecutiveNotDeterminable = 0;
    for (const v of timeline) {
      if (!v.notDeterminable) break;
      consecutiveNotDeterminable++;
    }
    const lastInspection = inspections[0]
      ? { result: inspections[0].result, isCurrentObservation: chosen?.refId === inspections[0].id }
      : null;
    const evidenceIds = chosen?.evidenceIds ?? [];

    const engine = {
      now,
      production: g.productionType,
      settings: DEFAULT_ENGINE_SETTINGS,
      policy,
      declared: declaration?.heads ?? null,
      movements,
      undocumentedExits,
      observation: chosen
        ? {
            count: chosen.count,
            basis: chosen.basis,
            method: chosen.method,
            observedAt: chosen.observedAt,
            quality: chosen.quality.level,
            locationVerified: chosen.locationVerified,
          }
        : null,
      rfid,
      documents,
      requiredDocuments: required,
      hasVerification: hasRun || inspections.length > 0,
      lastVerificationAt,
      lastInspection,
      consecutiveNotDeterminable,
      possibleDoubleGuarantee: Boolean(double?.found),
      previous: prevSnap ? { ...prevSnap, states: states.map((s) => s.state) } : null,
      recentAlerts: alertCount?.n ?? 0,
      amount: g.amount,
      debtAmount: g.debtAmount,
      currency: g.currency,
      highAmountThreshold: null,
      valuation: {
        averageWeightKg: g.averageWeightKg,
        weightSource: g.weightSource,
        pricePerKg: g.pricePerKg,
        priceCurrency: g.priceCurrency,
        priceSource: g.priceSource,
        priceDate: g.priceDate ? new Date(`${g.priceDate}T12:00:00Z`) : null,
        qualityFactor: g.qualityFactor,
      },
      finalized: g.finalizedAt !== null,
      expiresAt: g.expiresAt ? new Date(`${g.expiresAt}T23:59:59Z`) : null,
      evidenceRefs: chosen
        ? [
            `${chosen.kind === 'INSPECCION' ? 'Inspección' : 'Verificación'} ${chosen.refId.slice(0, 8)} · ${chosen.method} · ${chosen.observedAt.toISOString().slice(0, 10)}`,
            ...evidenceIds.slice(0, 5).map((id) => `Evidencia ${id.slice(0, 8)}`),
          ]
        : [],
    };
    return {
      engine,
      chosen,
      why,
      unrecorded,
      evidenceIds,
      trace: {
        declaredHeads: engine.declared,
        movements: movements.length,
        candidates: candidates.map((c) => ({
          kind: c.kind,
          refId: c.refId,
          count: c.count,
          basis: c.basis,
          method: c.method,
          observedAt: c.observedAt,
          quality: c.quality.level,
          qualityReasons: c.quality.reasons,
          captureOrigin: c.captureOrigin,
        })),
        chosen: chosen?.refId ?? null,
        chosenWhy: why,
        rfid,
        documents,
        requiredDocuments: required,
        policy,
        settings: DEFAULT_ENGINE_SETTINGS,
        valuation: engine.valuation,
      },
    };
  }

  /** Requisitos obligatorios del checklist de la solicitud y su estado (OCR vs declarado). */
  private async documentSignals(
    manager: EntityManager,
    g: BovineGuaranteeEntity,
  ): Promise<{ documents: DocumentSignal[]; required: string[] }> {
    if (!g.guaranteeRequestId || !g.establishmentId) return { documents: [], required: [] };
    const rows = (await manager.query(
      `SELECT requirement_code AS code, obligation, not_applicable AS "notApplicable", sort_order AS "sortOrder"
         FROM guarantee_request_requirements WHERE guarantee_request_id = $1`,
      [g.guaranteeRequestId],
    )) as { code: string; obligation: string; notApplicable: boolean; sortOrder: number }[];
    const known = rows.filter((r) => r.code in REQUIREMENT_CATALOG);
    if (!known.length) return { documents: [], required: [] };
    const docs = await this.documents.forRequest(g.organizationId, g.assetId, g.establishmentId);
    const analyses = await this.analyses.forDocuments(docs.map((d) => d.id));
    const evaluations = evaluateRequirements(
      known.map((r) => ({
        code: r.code,
        definition: REQUIREMENT_CATALOG[r.code as RequirementCode],
        notApplicable: r.notApplicable,
        sortOrder: r.sortOrder,
      })),
      docs.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        createdAt: d.createdAt,
        analysis: analyses.get(d.id) ?? null,
      })),
    );
    const documents: DocumentSignal[] = [];
    for (const r of known) {
      const e = evaluations.get(r.code);
      if (!e || e.status === 'PENDING' || e.status === 'NOT_APPLICABLE') continue;
      const doc = docs.find((d) => d.id === e.documentId);
      documents.push({
        type: r.code,
        label: REQUIREMENT_CATALOG[r.code as RequirementCode].name,
        analysis:
          e.status === 'CONSISTENT'
            ? 'CONSISTENTE'
            : e.status === 'INCONSISTENT'
              ? 'INCONSISTENTE'
              : e.status === 'REVIEW_REQUIRED'
                ? 'REVISION'
                : 'PENDIENTE',
        expired: Boolean(doc?.expiresAt && new Date(doc.expiresAt) < new Date()),
      });
    }
    const required = known
      .filter((r) => r.obligation === 'MANDATORY' && !r.notApplicable)
      .map((r) => r.code);
    return { documents, required };
  }

  // ------------------------------------------------------------------ alertas e historial

  private async syncAlerts(
    manager: EntityManager,
    g: BovineGuaranteeEntity,
    assessment: Assessment,
    snapshotId: string,
    evidenceIds: string[],
  ): Promise<void> {
    if (!g.assetId) return;
    const repo = manager.getRepository(AlertEntity);
    const open = await repo
      .createQueryBuilder('a')
      .where('a.bovineGuaranteeId = :id', { id: g.id })
      .andWhere("a.status NOT IN ('RESOLVED','DISMISSED')")
      .getMany();
    const wanted = new Set(assessment.alerts.map((a) => a.type));
    for (const draft of assessment.alerts) {
      const context = {
        guaranteeCode: g.code,
        what: draft.what,
        why: draft.why,
        evidence: draft.evidence,
        evidenceIds,
        action: draft.action,
        snapshotId,
        state: assessment.state,
      };
      const existing = open.find((a) => a.type === draft.type);
      if (existing) {
        await repo.update(
          { id: existing.id },
          {
            severity: draft.severity,
            description: `${draft.what}\n${draft.why}`,
            context,
            recommendedAction: draft.action.slice(0, 400),
          },
        );
        continue;
      }
      // Una alerta del mismo tipo abierta para el activo (por otra regla) no se duplica.
      await repo
        .createQueryBuilder()
        .insert()
        .into(AlertEntity)
        .values({
          organizationId: g.organizationId,
          assetId: g.assetId,
          bovineGuaranteeId: g.id,
          type: draft.type,
          severity: draft.severity,
          status: 'OPEN',
          title: `${g.code} · ${draft.title}`.slice(0, 200),
          description: `${draft.what}\n${draft.why}`,
          context,
          recommendedAction: draft.action.slice(0, 400),
        })
        .orIgnore()
        .execute();
      await this.event(manager, g, {
        type: 'ALERTA_GENERADA',
        source: 'SISTEMA',
        actorLabel: SISTEMA,
        result: draft.severity,
        evidence: evidenceIds.map((id) => ({ kind: 'evidence', id })),
        summary: `${draft.title}: ${draft.what}`.slice(0, 600),
        payload: { type: draft.type, snapshotId, action: draft.action },
      });
    }
    for (const alert of open.filter(
      (a) => !wanted.has(a.type as never) && a.type.startsWith('BG_'),
    )) {
      await repo.update(
        { id: alert.id },
        {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionNote: `Resuelta por el sistema: la condición dejó de cumplirse en la evaluación ${snapshotId.slice(0, 8)}.`,
        },
      );
      await this.event(manager, g, {
        type: 'ALERTA_RESUELTA',
        source: 'SISTEMA',
        actorLabel: SISTEMA,
        summary: `Se cerró la alerta «${alert.title}»: la condición dejó de cumplirse.`,
        payload: { alertId: alert.id, snapshotId },
      });
    }
  }

  async event(
    manager: EntityManager,
    g: Pick<BovineGuaranteeEntity, 'id' | 'organizationId'>,
    e: {
      type: string;
      source: EventSource;
      actorId?: string | null;
      actorLabel: string;
      method?: string | null;
      evidence?: unknown[];
      result?: string | null;
      previousState?: string | null;
      newState?: string | null;
      summary: string;
      payload?: Record<string, unknown>;
      occurredAt?: Date;
    },
  ): Promise<void> {
    await manager.save(
      manager.create(CollateralEventEntity, {
        organizationId: g.organizationId,
        guaranteeId: g.id,
        type: e.type,
        occurredAt: e.occurredAt ?? new Date(),
        source: e.source,
        actorId: e.actorId ?? null,
        actorLabel: e.actorLabel.slice(0, 160),
        method: e.method ?? null,
        evidence: e.evidence ?? [],
        result: e.result?.slice(0, 80) ?? null,
        previousState: e.previousState ?? null,
        newState: e.newState ?? null,
        summary: e.summary.slice(0, 600),
        payload: e.payload ?? {},
      }),
    );
  }

  async findForOrganization(organizationId: string, id: string): Promise<BovineGuaranteeEntity> {
    const g = await this.guarantees.findOneBy({ id, organizationId });
    if (!g) throw new NotFoundError('Garantía bovina', id);
    return g;
  }

  assertActive(g: BovineGuaranteeEntity): void {
    if (g.finalizedAt) throw new InvalidStateError('La garantía está finalizada');
  }

  /** Horario de la agenda de cada garantía (para la vista y los tests). */
  schedule(guaranteeId: string) {
    return this.dataSource.getRepository(MonitoringScheduleEntity).findOneBy({ guaranteeId });
  }
}

/** Categorías declaradas (si el rodeo las informó en sus metadatos); nunca se inventan. */
function categoriesFromMetadata(
  metadata: Record<string, unknown> | null,
): { category: string; heads: number }[] {
  const out: { category: string; heads: number }[] = [];
  const map: Record<string, string> = {
    vacas: 'Vacas',
    vaquillonas: 'Vaquillonas',
    novillos: 'Novillos',
    novillitos: 'Novillitos',
    terneros: 'Terneros',
    terneras: 'Terneras',
    toros: 'Toros',
  };
  for (const [key, label] of Object.entries(map)) {
    const v = metadata?.[`cantidad_${key}`] ?? metadata?.[key];
    if (typeof v === 'number' && v > 0) out.push({ category: label, heads: v });
  }
  return out;
}
