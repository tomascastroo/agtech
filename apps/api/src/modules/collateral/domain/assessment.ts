import { deriveAlerts, type AlertDraft } from './alert-rules.js';
import {
  COLLATERAL_ENGINE_VERSION,
  type CollateralRiskLevel,
  type CollateralState,
  type EvidenceQualityLevel,
  type ProductionType,
} from './collateral.types.js';
import { computeCoverage, type CoverageResult, type ValuationParams } from './coverage.js';
import type { EngineSettings, MonitoringPolicy } from './policy.js';
import {
  reconcile,
  type Observation,
  type ReconciliationMovement,
  type ReconciliationResult,
  type RfidSummary,
} from './reconciliation.js';
import { assessRisk, type RiskResult } from './risk.js';
import { computeSchedule, type ScheduleResult } from './schedule.js';
import {
  computeScore,
  resolveState,
  type DocumentSignal,
  type Gate,
  type ScoreResult,
} from './score.js';

/**
 * Evaluación completa de una garantía bovina (función pura). La usa el servicio en cada
 * evidencia nueva, inspección, movimiento, recálculo manual o barrido programado; el resultado
 * se guarda como snapshot inmutable.
 */
export interface AssessmentInput {
  now: Date;
  production: ProductionType;
  settings: EngineSettings;
  policy: MonitoringPolicy;
  declared: number | null;
  movements: ReconciliationMovement[];
  undocumentedExits: number;
  observation:
    (Observation & { quality: EvidenceQualityLevel; locationVerified: boolean | null }) | null;
  rfid: RfidSummary | null;
  documents: DocumentSignal[];
  requiredDocuments: string[];
  hasVerification: boolean;
  lastVerificationAt: Date | null;
  lastInspection: { result: string; isCurrentObservation: boolean } | null;
  possibleDoubleGuarantee: boolean;
  previous: {
    state: CollateralState;
    score: number | null;
    riskLevel: CollateralRiskLevel;
    expected: number | null;
    states: CollateralState[];
  } | null;
  recentAlerts: number;
  amount: number | null;
  debtAmount: number | null;
  currency: string;
  highAmountThreshold: number | null;
  valuation: ValuationParams;
  finalized: boolean;
  expiresAt: Date | null;
  evidenceRefs: string[];
}

export interface Assessment {
  engineVersion: string;
  evaluatedAt: Date;
  state: CollateralState;
  stateReason: string;
  reconciliation: ReconciliationResult;
  score: ScoreResult;
  coverage: CoverageResult;
  risk: RiskResult;
  schedule: ScheduleResult;
  alerts: AlertDraft[];
  evidenceAgeDays: number | null;
  quality: EvidenceQualityLevel | null;
}

const DAY_MS = 86_400_000;

export function assess(input: AssessmentInput): Assessment {
  const declared = input.declared ?? 0;
  const reconciliation = reconcile({
    declared,
    movements: input.movements,
    observation: input.observation,
    rfid: input.rfid,
    tolerance: input.settings.tolerance,
  });
  const evidenceAgeDays = input.observation
    ? Math.max(0, (input.now.getTime() - input.observation.observedAt.getTime()) / DAY_MS)
    : null;
  // La frecuencia vigente es la del riesgo anterior (el riesgo nuevo depende del estado).
  const currentRule = input.policy[input.previous?.riskLevel ?? 'MEDIO'];
  const quality = input.observation?.quality ?? null;
  const score = computeScore(
    {
      production: input.production,
      reconciliation,
      quality,
      evidenceAgeDays,
      maxEvidenceAgeDays: currentRule.maxEvidenceAgeDays,
      locationVerified: input.observation?.locationVerified ?? null,
      documents: input.documents,
      requiredDocuments: input.requiredDocuments,
      previousStates: input.previous?.states ?? [],
      previousScore: input.previous?.score ?? null,
      recentAlerts: input.recentAlerts,
      possibleDoubleGuarantee: input.possibleDoubleGuarantee,
      lastInspection: input.lastInspection,
    },
    input.settings,
  );
  const expired = input.expiresAt !== null && input.expiresAt.getTime() < input.now.getTime();
  let { state, reason } = resolveState(
    {
      gates: score.gates,
      finalScore: score.finalScore,
      finalized: input.finalized,
      expired,
      declared: input.declared !== null,
      hasVerification: input.hasVerification,
      evidenceAgeDays,
      frequencyDays: currentRule.frequencyDays,
    },
    input.settings,
  );
  const coverage = computeCoverage({
    verifiableHeads: reconciliation.verifiable,
    valuation: input.valuation,
    debtAmount: input.debtAmount,
    guaranteeAmount: input.amount,
    currency: input.currency,
    now: input.now,
    maxPriceAgeDays: input.settings.maxPriceAgeDays,
  });
  const risk = assessRisk(
    {
      production: input.production,
      state,
      reconciliation,
      amount: input.amount,
      highAmountThreshold: input.highAmountThreshold,
      evidenceAgeDays,
      frequencyDays: currentRule.frequencyDays,
      quality,
      documentationScore: score.components.find((c) => c.code === 'documentacion')?.value ?? null,
      coverageRatio: coverage.ratio,
      previousScore: input.previous?.score ?? null,
      currentScore: score.finalScore,
      recentAlerts: input.recentAlerts,
    },
    input.settings,
  );
  const gates: Gate[] = [...score.gates];
  const schedule = computeSchedule({
    policy: input.policy,
    riskLevel: risk.level,
    lastVerificationAt: input.lastVerificationAt,
    now: input.now,
  });
  // Riesgo crítico: la política escala a inspección presencial (si el estado no es terminal).
  const active = ![
    'FINALIZADA',
    'VENCIDA',
    'PENDIENTE_DECLARACION',
    'PENDIENTE_VERIFICACION',
  ].includes(state);
  if (active && schedule.requiresInspection && state !== 'REQUIERE_INSPECCION') {
    state = 'REQUIERE_INSPECCION';
    reason = `Riesgo ${risk.level}: la política de monitoreo exige inspección presencial.`;
  }
  const alerts = active
    ? deriveAlerts({
        state,
        gates,
        reconciliation,
        previousReconciliation:
          typeof input.previous?.expected === 'number'
            ? { expected: input.previous.expected }
            : null,
        coverage,
        score: score.finalScore,
        previousScore: input.previous?.score ?? null,
        evidenceRefs: input.evidenceRefs,
        undocumentedExits: input.undocumentedExits,
        settings: input.settings,
      })
    : [];
  return {
    engineVersion: COLLATERAL_ENGINE_VERSION,
    evaluatedAt: input.now,
    state,
    stateReason: reason,
    reconciliation,
    score,
    coverage,
    risk,
    schedule,
    alerts,
    evidenceAgeDays: evidenceAgeDays === null ? null : Math.round(evidenceAgeDays * 10) / 10,
    quality,
  };
}
