import { assess, type AssessmentInput } from './assessment.js';
import { computeCoverage } from './coverage.js';
import { assessEvidenceQuality } from './evidence-quality.js';
import { DEFAULT_ENGINE_SETTINGS, INITIAL_POLICIES } from './policy.js';
import { reconcile } from './reconciliation.js';
import { assessRisk, levelFor } from './risk.js';
import { computeSchedule } from './schedule.js';

const NOW = new Date('2026-10-05T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const tolerance = DEFAULT_ENGINE_SETTINGS.tolerance;
const exits25 = [
  {
    direction: 'EGRESO' as const,
    heads: 25,
    sourceLevel: 'DOCUMENTADO' as const,
    verificationState: 'VERIFICADO' as const,
  },
];
const valuation = {
  averageWeightKg: null,
  weightSource: null,
  pricePerKg: null,
  priceCurrency: null,
  priceSource: null,
  priceDate: null,
  qualityFactor: null,
};

function input(overrides: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    now: NOW,
    production: 'FEEDLOT',
    settings: DEFAULT_ENGINE_SETTINGS,
    policy: INITIAL_POLICIES.FEEDLOT,
    declared: 1000,
    movements: exits25,
    undocumentedExits: 0,
    observation: {
      count: 975,
      basis: 'CENSO',
      method: 'ESCANER_FIJO',
      observedAt: daysAgo(1),
      quality: 'ALTA',
      locationVerified: true,
    },
    rfid: null,
    documents: [{ type: 'RENSPA', label: 'RENSPA', analysis: 'CONSISTENTE', expired: false }],
    requiredDocuments: ['RENSPA'],
    hasVerification: true,
    lastVerificationAt: daysAgo(1),
    lastInspection: null,
    possibleDoubleGuarantee: false,
    previous: null,
    recentAlerts: 0,
    amount: 500_000,
    debtAmount: null,
    currency: 'USD',
    highAmountThreshold: null,
    valuation,
    finalized: false,
    expiresAt: null,
    evidenceRefs: ['ev-1'],
    ...overrides,
  };
}

describe('reconciliación declarado / movimientos / esperado / observado', () => {
  it('1.000 − 25 salidas = 975 esperados; 975 observados → consistente', () => {
    const r = reconcile({
      declared: 1000,
      movements: exits25,
      observation: { count: 975, basis: 'CENSO', method: 'ESCANER_FIJO', observedAt: NOW },
      rfid: null,
      tolerance,
    });
    expect(r.expected).toBe(975);
    expect(r.unexplainedDifference).toBe(0);
    expect(r.status).toBe('CONSISTENTE');
    expect(r.verifiable).toBe(975);
  });

  it('973 observados → diferencia no explicada de 2, nunca "faltan 27"', () => {
    const r = reconcile({
      declared: 1000,
      movements: exits25,
      observation: { count: 973, basis: 'CENSO', method: 'FOTO', observedAt: NOW },
      rfid: null,
      tolerance,
    });
    expect(r.narrative).toEqual([
      'Se declararon 1.000 animales.',
      'Se registraron 25 salidas.',
      'La cantidad esperada es 975.',
      'La última evidencia visual (foto) observó 973 animales.',
      expect.stringContaining('Diferencia no explicada: 2 menos de lo esperado'),
    ]);
    expect(r.narrative.join(' ')).not.toMatch(/faltan 27/i);
    expect(r.status).toBe('DIFERENCIA_MENOR');
  });

  it('los movimientos rechazados no explican diferencias', () => {
    const r = reconcile({
      declared: 100,
      movements: [
        {
          direction: 'EGRESO',
          heads: 10,
          sourceLevel: 'DECLARADO',
          verificationState: 'RECHAZADO',
        },
        {
          direction: 'INGRESO',
          heads: 5,
          sourceLevel: 'DECLARADO',
          verificationState: 'PENDIENTE',
        },
      ],
      observation: null,
      rfid: null,
      tolerance,
    });
    expect(r.expected).toBe(105);
    expect(r.rejectedHeads).toBe(10);
    expect(r.declaredOnlyHeads).toBe(5);
    expect(r.status).toBe('SIN_OBSERVACION');
  });

  it('una cota inferior por debajo de lo esperado es evidencia insuficiente, no faltante', () => {
    const r = reconcile({
      declared: 500,
      movements: [],
      observation: { count: 120, basis: 'COTA_INFERIOR', method: 'FOTO', observedAt: NOW },
      rfid: null,
      tolerance,
    });
    expect(r.status).toBe('EVIDENCIA_INSUFICIENTE');
    expect(r.unexplainedDifference).toBeNull();
    expect(r.narrative.join(' ')).toContain('No implica faltante');
  });

  it('más caravanas que animales esperados es inconsistencia RFID', () => {
    const r = reconcile({
      declared: 10,
      movements: [],
      observation: null,
      rfid: { identified: 12, ambiguous: 0, otherEstablishment: 0 },
      tolerance,
    });
    expect(r.rfidExceedsExpected).toBe(true);
    expect(r.verifiable).toBe(10);
  });
});

describe('evaluación: compuertas y estado', () => {
  it('evidencia reciente y consistente → VERIFICADA', () => {
    const a = assess(input());
    expect(a.state).toBe('VERIFICADA');
    expect(a.score.gates).toEqual([]);
    expect(a.score.finalScore).toBeGreaterThanOrEqual(70);
    expect(a.score.components).toHaveLength(10);
    for (const c of a.score.components) expect(c.explanation.length).toBeGreaterThan(5);
  });

  it('cámara 720 contra 975 esperados → REQUIERE_INSPECCION con alerta explicada', () => {
    const a = assess(
      input({
        observation: { ...input().observation!, count: 720 },
      }),
    );
    expect(a.state).toBe('REQUIERE_INSPECCION');
    expect(a.score.gates.map((g) => g.code)).toContain('DIFERENCIA_NO_EXPLICADA');
    const alert = a.alerts.find((x) => x.type === 'BG_QUANTITY_DIFFERENCE')!;
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.what).toContain('La cantidad esperada es 975');
    expect(alert.action).toMatch(/inspección/);
    expect(a.alerts.map((x) => x.type)).toContain('BG_INSPECTION_REQUIRED');
  });

  it('diferencia menor → REQUIERE_REVISION', () => {
    const a = assess(input({ observation: { ...input().observation!, count: 973 } }));
    expect(a.state).toBe('REQUIERE_REVISION');
  });

  it('evidencia vieja → REQUIERE_EVIDENCIA', () => {
    const a = assess(
      input({
        observation: { ...input().observation!, observedAt: daysAgo(40) },
        lastVerificationAt: daysAgo(40),
      }),
    );
    expect(a.state).toBe('REQUIERE_EVIDENCIA');
    expect(a.alerts.map((x) => x.type)).toContain('BG_EVIDENCE_EXPIRED');
  });

  it('sin evidencia física después de verificar → NO_DETERMINABLE; dos veces seguidas → inspección', () => {
    const first = assess(input({ observation: null }));
    expect(first.state).toBe('NO_DETERMINABLE');
    expect(first.score.finalScore).not.toBeNull();
    const second = assess(
      input({
        observation: null,
        previous: {
          state: 'NO_DETERMINABLE',
          score: null,
          riskLevel: 'MEDIO',
          expected: 975,
          states: ['NO_DETERMINABLE'],
        },
      }),
    );
    expect(second.state).toBe('REQUIERE_INSPECCION');
  });

  it('sin verificación inicial → PENDIENTE_VERIFICACION; sin declaración → PENDIENTE_DECLARACION', () => {
    expect(assess(input({ observation: null, hasVerification: false })).state).toBe(
      'PENDIENTE_VERIFICACION',
    );
    expect(assess(input({ declared: null, hasVerification: false })).state).toBe(
      'PENDIENTE_DECLARACION',
    );
  });

  it('conteo parcial (cota inferior) → NO_DETERMINABLE', () => {
    const a = assess(
      input({
        observation: {
          ...input().observation!,
          basis: 'COTA_INFERIOR',
          count: 300,
          method: 'FOTO',
          quality: 'BAJA',
        },
      }),
    );
    expect(a.state).toBe('NO_DETERMINABLE');
    expect(a.score.components.find((c) => c.code === 'cantidad')!.value).toBeLessThanOrEqual(80);
  });

  it('inconsistencia documental → REQUIERE_REVISION', () => {
    const a = assess(
      input({
        documents: [{ type: 'RENSPA', label: 'RENSPA', analysis: 'INCONSISTENTE', expired: false }],
      }),
    );
    expect(a.state).toBe('REQUIERE_REVISION');
    expect(a.alerts.map((x) => x.type)).toContain('BG_DOCUMENT_INCONSISTENCY');
  });

  it('el score queda limitado por el eslabón más débil', () => {
    const a = assess(
      input({
        observation: { ...input().observation!, observedAt: daysAgo(44) },
        lastVerificationAt: daysAgo(44),
      }),
    );
    const recencia = a.score.components.find((c) => c.code === 'recencia')!;
    expect(a.score.weakestLink!.code).toBe('recencia');
    expect(a.score.finalScore).toBeLessThanOrEqual(
      recencia.value! + DEFAULT_ENGINE_SETTINGS.weakestLinkMargin,
    );
  });

  it('garantía finalizada o vencida no genera alertas', () => {
    expect(assess(input({ finalized: true })).state).toBe('FINALIZADA');
    const v = assess(
      input({ expiresAt: daysAgo(1), observation: { ...input().observation!, count: 10 } }),
    );
    expect(v.state).toBe('VENCIDA');
    expect(v.alerts).toEqual([]);
  });

  it('posible doble garantía → REQUIERE_REVISION con alerta crítica', () => {
    const a = assess(input({ possibleDoubleGuarantee: true }));
    expect(a.state).toBe('REQUIERE_REVISION');
    expect(a.alerts.find((x) => x.type === 'BG_POSSIBLE_DOUBLE_GUARANTEE')!.severity).toBe(
      'CRITICAL',
    );
  });
});

describe('cobertura monetaria', () => {
  it('sin peso ni precio → NO DETERMINABLE con lo que falta', () => {
    const c = computeCoverage({
      verifiableHeads: 975,
      valuation,
      debtAmount: 100,
      guaranteeAmount: null,
      currency: 'USD',
      now: NOW,
      maxPriceAgeDays: 30,
    });
    expect(c.status).toBe('NO_DETERMINABLE');
    expect(c.missing).toEqual([
      'peso promedio',
      'precio de referencia por kg',
      'factor de calidad',
    ]);
    expect(c.verifiableValue).toBeNull();
  });

  it('verificables × peso × precio × factor contra la deuda', () => {
    const c = computeCoverage({
      verifiableHeads: 975,
      valuation: {
        averageWeightKg: 400,
        weightSource: 'Balanza',
        pricePerKg: 2,
        priceCurrency: 'USD',
        priceSource: 'Mercado',
        priceDate: daysAgo(3),
        qualityFactor: 0.9,
      },
      debtAmount: 500_000,
      guaranteeAmount: 600_000,
      currency: 'USD',
      now: NOW,
      maxPriceAgeDays: 30,
    });
    expect(c.status).toBe('DETERMINADA');
    expect(c.verifiableValue).toBe(702_000);
    expect(c.ratio).toBe(1.4);
    expect(c.ratioBasis).toBe('DEUDA');
    expect(c.guaranteeRatio).toBe(1.17);
    expect(c.warnings).toEqual([]);
  });

  it('moneda distinta sin tipo de cambio → NO DETERMINABLE', () => {
    const c = computeCoverage({
      verifiableHeads: 10,
      valuation: {
        averageWeightKg: 400,
        weightSource: 'x',
        pricePerKg: 3000,
        priceCurrency: 'ARS',
        priceSource: 'x',
        priceDate: NOW,
        qualityFactor: 1,
      },
      debtAmount: 100,
      guaranteeAmount: null,
      currency: 'USD',
      now: NOW,
      maxPriceAgeDays: 30,
    });
    expect(c.status).toBe('NO_DETERMINABLE');
    expect(c.missing[0]).toContain('tipo de cambio');
  });

  it('precio viejo genera advertencia', () => {
    const c = computeCoverage({
      verifiableHeads: 10,
      valuation: {
        averageWeightKg: 400,
        weightSource: 'x',
        pricePerKg: 2,
        priceCurrency: 'USD',
        priceSource: 'x',
        priceDate: daysAgo(60),
        qualityFactor: 1,
      },
      debtAmount: 100,
      guaranteeAmount: null,
      currency: 'USD',
      now: NOW,
      maxPriceAgeDays: 30,
    });
    expect(c.warnings[0]).toContain('60 días');
  });
});

describe('calidad de evidencia', () => {
  it('manga + RFID capturada en campo con GPS es ALTA', () => {
    expect(
      assessEvidenceQuality({
        method: 'MANGA_RFID',
        basis: 'CENSO',
        captureOrigin: 'CAPTURA_EN_CAMPO',
        hasCaptureLocation: true,
      }).level,
    ).toBe('ALTA');
  });
  it('un archivo de galería nunca supera BAJA y una foto nunca supera BAJA', () => {
    expect(
      assessEvidenceQuality({
        method: 'ESCANER_FIJO',
        basis: 'CENSO',
        captureOrigin: 'ARCHIVO_CARGADO',
        hasCaptureLocation: true,
      }).level,
    ).toBe('BAJA');
    expect(
      assessEvidenceQuality({
        method: 'FOTO',
        basis: 'COTA_INFERIOR',
        captureOrigin: 'CAPTURA_EN_CAMPO',
        hasCaptureLocation: true,
      }).level,
    ).toBe('BAJA');
  });
  it('sin GPS y no concluyente baja niveles; simulada o insuficiente es INSUFICIENTE', () => {
    expect(
      assessEvidenceQuality({
        method: 'ESCANER_FIJO',
        basis: 'CENSO',
        captureOrigin: 'CAPTURA_EN_CAMPO',
        hasCaptureLocation: false,
        evidenceStatus: 'INCONCLUSIVE',
      }).level,
    ).toBe('BAJA');
    expect(
      assessEvidenceQuality({
        method: 'MANGA_RFID',
        basis: 'CENSO',
        captureOrigin: 'CAPTURA_EN_CAMPO',
        hasCaptureLocation: true,
        simulated: true,
      }).level,
    ).toBe('INSUFICIENTE');
    expect(
      assessEvidenceQuality({
        method: 'VIDEO',
        basis: 'COTA_INFERIOR',
        captureOrigin: 'CAPTURA_EN_CAMPO',
        hasCaptureLocation: true,
        evidenceStatus: 'INSUFFICIENT',
      }).level,
    ).toBe('INSUFICIENTE');
  });
});

describe('riesgo y agenda', () => {
  it('niveles por puntos', () => {
    expect([0, 2, 4, 7].map(levelFor)).toEqual(['BAJO', 'MEDIO', 'ALTO', 'CRITICO']);
  });

  it('cada factor queda explicado', () => {
    const r = reconcile({
      declared: 1200,
      movements: [],
      observation: null,
      rfid: null,
      tolerance,
    });
    const risk = assessRisk(
      {
        production: 'CRIA',
        state: 'REQUIERE_INSPECCION',
        reconciliation: r,
        amount: null,
        highAmountThreshold: null,
        evidenceAgeDays: null,
        frequencyDays: 90,
        quality: null,
        documentationScore: 40,
        coverageRatio: 0.8,
        previousScore: 80,
        currentScore: 50,
        recentAlerts: 3,
      },
      DEFAULT_ENGINE_SETTINGS,
    );
    expect(risk.level).toBe('CRITICO');
    expect(risk.factors.map((f) => f.code)).toEqual([
      'CANTIDAD',
      'ESTADO',
      'RFID',
      'DOCUMENTACION',
      'COBERTURA',
      'SCORE_DETERIORADO',
      'FRECUENCIA_ALERTAS',
    ]);
  });

  it('feedlot 30/14/7 días según riesgo; la frecuencia sale de la política, no del código', () => {
    const at = (riskLevel: 'BAJO' | 'MEDIO' | 'ALTO') =>
      computeSchedule({
        policy: INITIAL_POLICIES.FEEDLOT,
        riskLevel,
        lastVerificationAt: NOW,
        now: NOW,
      }).frequencyDays;
    expect([at('BAJO'), at('MEDIO'), at('ALTO')]).toEqual([30, 14, 7]);
    const custom = {
      ...INITIAL_POLICIES.FEEDLOT,
      BAJO: { ...INITIAL_POLICIES.FEEDLOT.BAJO, frequencyDays: 21 },
    };
    const s = computeSchedule({
      policy: custom,
      riskLevel: 'BAJO',
      lastVerificationAt: NOW,
      now: NOW,
    });
    expect(s.nextVerificationAt.toISOString()).toBe('2026-10-26T12:00:00.000Z');
  });

  it('riesgo crítico escala a inspección presencial', () => {
    const a = assess(
      input({
        production: 'CRIA',
        policy: INITIAL_POLICIES.CRIA,
        declared: 1500,
        movements: [],
        observation: null,
        recentAlerts: 5,
        documents: [{ type: 'RENSPA', label: 'RENSPA', analysis: 'INCONSISTENTE', expired: false }],
        previous: {
          state: 'NO_DETERMINABLE',
          score: 90,
          riskLevel: 'ALTO',
          expected: 1500,
          states: ['NO_DETERMINABLE'],
        },
      }),
    );
    expect(a.risk.level).toBe('CRITICO');
    expect(a.state).toBe('REQUIERE_INSPECCION');
    expect(a.schedule.recommendedMethod).toBe('INSPECCION');
  });
});
