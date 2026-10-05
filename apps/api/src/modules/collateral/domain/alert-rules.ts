import type { AlertSeverity, CollateralAlertType, CollateralState } from './collateral.types.js';
import type { CoverageResult } from './coverage.js';
import type { ReconciliationResult } from './reconciliation.js';
import type { Gate } from './score.js';
import type { EngineSettings } from './policy.js';

/**
 * Alertas derivadas de una evaluación. Cada alerta explica QUÉ PASÓ, POR QUÉ, CON QUÉ EVIDENCIA y
 * QUÉ ACCIÓN se recomienda. El servicio abre las nuevas y cierra (RESOLVED por el sistema) las
 * que dejaron de cumplirse; nunca borra ninguna.
 */
export interface AlertDraft {
  type: CollateralAlertType;
  severity: AlertSeverity;
  title: string;
  what: string;
  why: string;
  evidence: string[];
  action: string;
}

export interface AlertRulesInput {
  state: CollateralState;
  gates: Gate[];
  reconciliation: ReconciliationResult;
  previousReconciliation: { expected: number } | null;
  coverage: CoverageResult;
  score: number | null;
  previousScore: number | null;
  /** Ids/descripciones de la evidencia vigente (para citar en la alerta). */
  evidenceRefs: string[];
  /** Movimientos de egreso solo declarados (sin DT-e). */
  undocumentedExits: number;
  settings: EngineSettings;
}

export function deriveAlerts(input: AlertRulesInput): AlertDraft[] {
  const out: AlertDraft[] = [];
  const r = input.reconciliation;
  const gate = (code: Gate['code']) => input.gates.find((g) => g.code === code);
  const ev = input.evidenceRefs;
  const story = r.narrative;

  const diff = gate('DIFERENCIA_NO_EXPLICADA');
  if (diff)
    out.push({
      type: 'BG_QUANTITY_DIFFERENCE',
      severity: 'CRITICAL',
      title: 'Diferencia de cantidad no explicada',
      what: story.join(' '),
      why: diff.explanation,
      evidence: ev,
      action:
        'Programar inspección presencial o un conteo completo en manga y pedir los DT-e de los movimientos.',
    });
  const minor = gate('DIFERENCIA_MENOR');
  if (minor)
    out.push({
      type: 'BG_QUANTITY_DIFFERENCE',
      severity: 'WARNING',
      title: 'Diferencia menor de cantidad',
      what: story.join(' '),
      why: minor.explanation,
      evidence: ev,
      action:
        'Revisar la diferencia con el productor (muertes, movimientos sin registrar) y documentarla.',
    });
  if (input.state === 'REQUIERE_INSPECCION')
    out.push({
      type: 'BG_INSPECTION_REQUIRED',
      severity: 'CRITICAL',
      title: 'Requiere inspección presencial',
      what: 'La garantía pasó a REQUIERE INSPECCIÓN.',
      why:
        input.gates
          .filter((g) => g.state === 'REQUIERE_INSPECCION')
          .map((g) => g.explanation)
          .join(' ') || 'El nivel de riesgo exige inspección presencial.',
      evidence: ev,
      action: 'Asignar un inspector y registrar la inspección con conteo, evidencia y firma.',
    });
  const stale = gate('EVIDENCIA_VENCIDA');
  if (stale)
    out.push({
      type: 'BG_EVIDENCE_EXPIRED',
      severity: 'WARNING',
      title: 'Evidencia física vencida',
      what: 'La última evidencia física superó la antigüedad máxima.',
      why: stale.explanation,
      evidence: ev,
      action: 'Pedir al productor una captura nueva desde la app (escáner o manga + RFID).',
    });
  const insufficient = gate('EVIDENCIA_INSUFICIENTE') ?? gate('SIN_EXISTENCIA');
  if (insufficient && input.state !== 'PENDIENTE_VERIFICACION')
    out.push({
      type: 'BG_INSUFFICIENT_EVIDENCE',
      severity: 'WARNING',
      title: 'Evidencia insuficiente',
      what: story.join(' '),
      why: insufficient.explanation,
      evidence: ev,
      action: 'Pedir un conteo completo (manga, escáner fijo) o programar inspección.',
    });
  const docs = gate('INCONSISTENCIA_DOCUMENTAL');
  if (docs)
    out.push({
      type: 'BG_DOCUMENT_INCONSISTENCY',
      severity: 'WARNING',
      title: 'Inconsistencia documental',
      what: docs.explanation,
      why: 'Los datos leídos del documento no coinciden con lo declarado.',
      evidence: ev,
      action: 'Revisar el documento y pedir uno corregido o una constancia oficial actualizada.',
    });
  const loc = gate('UBICACION_FUERA_DE_ZONA');
  if (loc)
    out.push({
      type: 'BG_LOCATION',
      severity: 'WARNING',
      title: 'Evidencia fuera del establecimiento',
      what: loc.explanation,
      why: 'La ubicación GPS de captura no cae dentro del establecimiento declarado.',
      evidence: ev,
      action: 'Pedir una captura nueva en el establecimiento o revisar la ubicación declarada.',
    });
  const identity = gate('IDENTIDAD_INCONSISTENTE');
  if (identity)
    out.push({
      type: r.rfid && r.rfid.otherEstablishment > 0 ? 'BG_IDENTITY' : 'BG_RFID_INCONSISTENCY',
      severity: 'WARNING',
      title: 'Inconsistencia de identificación RFID',
      what: identity.explanation,
      why: story.filter((s) => s.startsWith('RFID') || s.includes('caravanas')).join(' '),
      evidence: ev,
      action: 'Revisar las caravanas leídas y su RENSPA de origen.',
    });
  const double = gate('POSIBLE_DOBLE_GARANTIA');
  if (double)
    out.push({
      type: 'BG_POSSIBLE_DOUBLE_GUARANTEE',
      severity: 'CRITICAL',
      title: 'Posible doble garantía',
      what: double.explanation,
      why: 'Los mismos animales no pueden respaldar dos garantías por el total. TRAZA (registro de ganado prendado) no está conectado: el control cubre solo esta entidad.',
      evidence: ev,
      action: 'Verificar con el productor y pedir la constancia TRAZA o el informe de gravámenes.',
    });
  if (input.undocumentedExits > 0)
    out.push({
      type: 'BG_UNEXPECTED_MOVEMENT',
      severity: 'WARNING',
      title: 'Egresos sin respaldo documental',
      what: `${input.undocumentedExits} cabezas salieron según el productor, sin DT-e cargado.`,
      why: 'Una salida sin DT-e no se puede contrastar con la fuente oficial.',
      evidence: ev,
      action: 'Pedir el DT-e de cada egreso.',
    });
  if (input.previousReconciliation && input.previousReconciliation.expected > 0) {
    const drop =
      (input.previousReconciliation.expected - r.expected) / input.previousReconciliation.expected;
    if (drop >= 0.1)
      out.push({
        type: 'BG_STOCK_DECREASE',
        severity: drop >= 0.25 ? 'CRITICAL' : 'WARNING',
        title: 'Disminución de stock',
        what: `La cantidad esperada bajó de ${input.previousReconciliation.expected} a ${r.expected} cabezas (${Math.round(drop * 100)} %).`,
        why: 'Las salidas registradas reducen el respaldo de la garantía.',
        evidence: ev,
        action: 'Revisar la cobertura y, si corresponde, pedir reposición o refuerzo de garantía.',
      });
  }
  const c = input.coverage;
  if (c.status === 'DETERMINADA' && c.ratio !== null && c.ratio < input.settings.minCoverageRatio)
    out.push({
      type: 'BG_COVERAGE',
      severity: c.ratio < 1 ? 'CRITICAL' : 'WARNING',
      title: 'Cobertura insuficiente',
      what: `Cobertura ${c.ratio.toFixed(2)} (${c.formula}).`,
      why: `Debajo del mínimo configurado (${input.settings.minCoverageRatio}).`,
      evidence: ev,
      action: 'Revisar la valuación y la deuda; evaluar refuerzo de garantía.',
    });
  if (
    input.score !== null &&
    input.previousScore !== null &&
    input.previousScore - input.score >= 15
  )
    out.push({
      type: 'BG_SCORE_DETERIORATED',
      severity: 'WARNING',
      title: 'Score deteriorado',
      what: `El score bajó de ${input.previousScore} a ${input.score}.`,
      why: 'Uno o más componentes empeoraron desde la evaluación anterior.',
      evidence: ev,
      action: 'Revisar los componentes del score en el passport.',
    });
  // Una alerta por tipo (la más severa).
  const byType = new Map<string, AlertDraft>();
  const rank = { INFO: 0, WARNING: 1, CRITICAL: 2 };
  for (const a of out) {
    const prev = byType.get(a.type);
    if (!prev || rank[a.severity] > rank[prev.severity]) byType.set(a.type, a);
  }
  return [...byType.values()];
}
