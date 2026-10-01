import { anomalyScore, EVALUATORS, type AlertEvaluationContext } from './alert-evaluation.js';
import type { AlertConditionType } from './alert.types.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const evaluator = (type: AlertConditionType) => EVALUATORS.find((e) => e.type === type)!;

function context(overrides: Partial<AlertEvaluationContext> = {}): AlertEvaluationContext {
  return {
    phase: 'VERIFICATION',
    now: NOW,
    asset: {
      id: 'a1',
      name: 'Rodeo',
      assetTypeCode: 'BOVINOS',
      declaredQuantity: 1500,
      unitLabel: 'cabezas',
      establishmentName: 'La Esperanza',
    },
    verification: {
      runId: 'r1',
      detectedQuantity: 1482,
      finalScore: 82,
      previousDetectedQuantity: 1482,
      locationVerified: true,
      locationDistanceM: null,
      anomalies: [],
      vegetationChangePct: null,
    },
    newestEvidenceAt: NOW,
    lastVerifiedAt: NOW,
    documents: [],
    ...overrides,
  };
}

describe('Evaluadores de alertas', () => {
  it('cantidad detectada < declarada × umbral', () => {
    const e = evaluator('QUANTITY_RATIO_BELOW');
    expect(e.evaluate(context(), { threshold: 0.9 })).toBeNull();
    const low = context({ verification: { ...context().verification!, detectedQuantity: 1200 } });
    const alert = e.evaluate(low, { threshold: 0.9 });
    expect(alert?.title).toContain('Diferencia significativa');
    expect(alert?.context.ratio).toBeCloseTo(0.8);
  });

  it('disminución de actividad respecto de la verificación anterior', () => {
    const e = evaluator('ACTIVITY_DROP');
    const drop = context({
      verification: {
        ...context().verification!,
        detectedQuantity: 1250,
        previousDetectedQuantity: 1482,
      },
    });
    expect(e.evaluate(drop, { thresholdPct: 10 })?.title).toBe('Disminución de actividad ganadera');
    expect(e.evaluate(context(), { thresholdPct: 10 })).toBeNull();
  });

  it('evidencia desactualizada usa la antigüedad configurada en el activo', () => {
    const e = evaluator('EVIDENCE_STALE');
    const old = context({ newestEvidenceAt: new Date(NOW.getTime() - 100 * 3_600_000) });
    expect(e.evaluate(old, { maxAgeHours: 72 })).not.toBeNull();
    expect(e.evaluate({ ...old, maxEvidenceAgeHours: 168 }, { maxAgeHours: 72 })).toBeNull();
  });

  it('no reporta evidencia desactualizada para activos todavía no verificados', () => {
    const e = evaluator('EVIDENCE_STALE');
    expect(
      e.evaluate(context({ newestEvidenceAt: null, lastVerifiedAt: null }), { maxAgeHours: 72 }),
    ).toBeNull();
  });

  it('ubicación fuera del establecimiento', () => {
    const e = evaluator('LOCATION_MISMATCH');
    const outside = context({
      verification: {
        ...context().verification!,
        locationVerified: false,
        locationDistanceM: 3500,
      },
    });
    expect(e.evaluate(outside, {})?.description).toContain('3.500 m');
    expect(e.evaluate(context(), {})).toBeNull();
  });

  it('cambio de superficie de vegetación', () => {
    const e = evaluator('VEGETATION_AREA_DROP');
    const vineyard = context({
      asset: {
        ...context().asset,
        assetTypeCode: 'VINEDOS',
        declaredQuantity: 120,
        unitLabel: 'ha',
      },
      verification: { ...context().verification!, detectedQuantity: 106.8 },
    });
    expect(e.evaluate(vineyard, { thresholdPct: 8 })?.title).toBe(
      'Cambio en la superficie cultivada',
    );
  });

  it('documentación vencida o por vencer', () => {
    const e = evaluator('DOCUMENT_EXPIRING');
    const docs = context({
      documents: [
        { id: 'd1', title: 'Contrato', expiresAt: '2026-10-20', status: 'VALID' },
        { id: 'd2', title: 'RENSPA', expiresAt: '2027-10-20', status: 'VALID' },
      ],
    });
    const alert = e.evaluate(docs, { withinDays: 30 });
    expect(alert?.title).toBe('Documentación próxima a vencer');
    expect(alert?.description).toContain('Contrato');
    expect(alert?.description).not.toContain('RENSPA');
  });

  it('sin verificación reciente', () => {
    const e = evaluator('NO_RECENT_VERIFICATION');
    expect(e.evaluate(context({ lastVerifiedAt: null }), { maxDays: 15 })?.description).toContain(
      'todavía no fue verificado',
    );
    expect(e.evaluate(context(), { maxDays: 15 })).toBeNull();
  });

  it('score de anomalías considera solo anomalías de comportamiento', () => {
    expect(
      anomalyScore([
        { code: 'DUPLICATE_EVIDENCE', severity: 'WARNING', message: '' },
        { code: 'REGISTRY_DISCREPANCY', severity: 'WARNING', message: '' },
        { code: 'LOCATION_MISMATCH', severity: 'CRITICAL', message: '' },
      ]),
    ).toBe(0.7);
  });
});
