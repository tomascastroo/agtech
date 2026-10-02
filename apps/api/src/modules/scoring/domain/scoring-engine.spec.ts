import { ScoringEngine } from './scoring-engine.js';
import {
  DEFAULT_SCORING_WEIGHTS,
  InvalidScoringWeightsError,
  validateWeights,
} from './scoring.config.js';
import type { ScoringInput } from './scoring.types.js';

const NOW = new Date('2026-10-01T15:00:00Z');
const DAY = 86_400_000;

/** Escenario de referencia: rodeo de La Esperanza (1.500 declaradas, 1.482 detectadas). */
function laEsperanza(overrides: Partial<ScoringInput> = {}): ScoringInput {
  const previousScores = [74, 80, 80, 81, 82];
  return {
    now: NOW,
    asset: { declaredQuantity: 1500, unit: 'HEAD', mobility: 'HIGH', tenure: 'LEASED' },
    detection: { detectedQuantity: 1482, confidence: 0.86, evidenceCount: 6, averageQuality: 0.87 },
    freshness: { newestEvidenceAt: new Date(NOW.getTime() - 5 * 60_000), maxEvidenceAgeHours: 192 },
    documents: {
      requirements: ['RENSPA', 'PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
      documents: [
        { type: 'RENSPA', status: 'VALID', expiresAt: '2027-06-30' },
        { type: 'LEASE_CONTRACT', status: 'VALID', expiresAt: '2028-04-30' },
        { type: 'ID_CUIT', status: 'PENDING_REVIEW', expiresAt: null },
      ],
    },
    history: {
      previous: previousScores.map((finalScore, i) => ({
        completedAt: new Date(NOW.getTime() - (35 - i * 7) * DAY),
        matchRatio: 1482 / 1500,
        finalScore,
      })),
    },
    location: { verified: true, distanceM: null },
    registry: { status: 'OK', registeredQuantity: 1540, declaredOnEstablishment: 1500 },
    risk: {
      openAlerts: [],
      activeDevices: 6,
      expectedDevices: 6,
      monitoringEnabled: true,
      insured: false,
    },
    anomalies: [],
    ...overrides,
  };
}

const engine = new ScoringEngine();
const component = (output: ReturnType<ScoringEngine['score']>, key: string) =>
  output.components.find((c) => c.key === key)!;

describe('ScoringEngine', () => {
  it('reproduce el escenario de referencia: 82/100 con componentes 90/85/70/68/95', () => {
    const output = engine.score(laEsperanza(), DEFAULT_SCORING_WEIGHTS);
    expect(output.finalScore).toBe(82);
    expect(output.outcome).toBe('VERIFIED');
    expect(output.riskLevel).toBe('MEDIUM');
    expect(output.matchRatio).toBeCloseTo(0.988, 3);
    expect(output.confidence).toBe(0.86);
    expect(output.components.map((c) => [c.key, c.score])).toEqual([
      ['documentation', 90],
      ['existence', 85],
      ['historical', 70],
      ['risk', 68],
      ['consistency', 95],
    ]);
    expect(output.modelVersion).toBe('agro-score/1.1.0');
  });

  it('es explicable: cada componente informa peso, aporte, explicación y factores', () => {
    const output = engine.score(laEsperanza(), DEFAULT_SCORING_WEIGHTS);
    for (const c of output.components) {
      expect(c.weight).toBe(DEFAULT_SCORING_WEIGHTS[c.key]);
      expect(c.contribution).toBeCloseTo(c.score * c.weight, 2);
      expect(c.explanation.length).toBeGreaterThan(10);
    }
    expect(component(output, 'risk').factors.map((f) => f.label)).toEqual([
      'Movilidad del activo',
      'Tenencia del establecimiento',
      'Seguro del activo',
    ]);
  });

  it('es determinístico', () => {
    expect(engine.score(laEsperanza(), DEFAULT_SCORING_WEIGHTS)).toEqual(
      engine.score(laEsperanza(), DEFAULT_SCORING_WEIGHTS),
    );
  });

  it('no infla el historial con varias verificaciones en el mismo día', () => {
    const base = laEsperanza();
    const sameDay = laEsperanza({
      history: {
        previous: [
          ...base.history.previous,
          { completedAt: new Date(NOW.getTime() - 60 * 60_000), matchRatio: 0.988, finalScore: 82 },
        ],
      },
    });
    expect(component(engine.score(sameDay, DEFAULT_SCORING_WEIGHTS), 'historical').score).toBe(70);
  });

  it('cota inferior por debajo de lo declarado: no concluyente (cobertura parcial), no rechazo', () => {
    const partial = {
      detectedQuantity: 261,
      confidence: 0.82,
      evidenceCount: 7,
      averageQuality: 0.8,
    };
    const lowerBound = engine.score(
      laEsperanza({ detection: { ...partial, countBasis: 'LOWER_BOUND' } }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(lowerBound.outcome).toBe('INCONCLUSIVE');
    expect(component(lowerBound, 'existence').explanation).toMatch(/al menos 261 de 1500/);
    // El mismo número en un conteo comparable (paso controlado) sí es un faltante.
    const census = engine.score(
      laEsperanza({ detection: { ...partial, countBasis: 'CENSUS' } }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(census.outcome).not.toBe('INCONCLUSIVE');
    expect(census.outcome).not.toBe('VERIFIED');
    // El puntaje no cambia: solo la interpretación del resultado.
    expect(lowerBound.finalScore).toBe(census.finalScore);
  });

  it('cota inferior con anomalía crítica mantiene el rechazo/observación', () => {
    const output = engine.score(
      laEsperanza({
        detection: {
          detectedQuantity: 261,
          confidence: 0.82,
          evidenceCount: 7,
          averageQuality: 0.8,
          countBasis: 'LOWER_BOUND',
        },
        anomalies: [
          { code: 'LOCATION_MISMATCH', severity: 'CRITICAL', message: 'fuera', details: {} },
        ],
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(['REJECTED', 'OBSERVED']).toContain(output.outcome);
  });

  it('cota inferior que alcanza lo declarado se verifica normalmente', () => {
    const output = engine.score(
      laEsperanza({
        detection: {
          detectedQuantity: 1482,
          confidence: 0.86,
          evidenceCount: 6,
          averageQuality: 0.87,
          countBasis: 'LOWER_BOUND',
        },
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(output.outcome).toBe('VERIFIED');
    expect(output.finalScore).toBe(82);
  });

  it('marca INCONCLUSIVE sin evidencia', () => {
    const output = engine.score(
      laEsperanza({
        detection: {
          detectedQuantity: null,
          confidence: null,
          evidenceCount: 0,
          averageQuality: null,
        },
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(output.outcome).toBe('INCONCLUSIVE');
    expect(output.confidence).toBe(0);
    expect(component(output, 'existence').score).toBe(0);
  });

  it('marca OBSERVED cuando la coincidencia cae por debajo del 90 %', () => {
    const output = engine.score(
      laEsperanza({
        detection: {
          detectedQuantity: 1300,
          confidence: 0.86,
          evidenceCount: 6,
          averageQuality: 0.87,
        },
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(output.outcome).toBe('OBSERVED');
  });

  it('penaliza anomalías críticas y no verifica con geolocalización inconsistente', () => {
    const output = engine.score(
      laEsperanza({
        location: { verified: false, distanceM: 4200 },
        anomalies: [
          { code: 'LOCATION_MISMATCH', severity: 'CRITICAL', message: 'fuera del límite' },
        ],
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(output.riskPenalty).toBe(10);
    expect(output.outcome).toBe('OBSERVED');
    expect(output.finalScore).toBeLessThan(75);
  });

  it('trata la sobre-detección como discrepancia simétrica', () => {
    const over = engine.score(
      laEsperanza({
        detection: {
          detectedQuantity: 1800,
          confidence: 0.86,
          evidenceCount: 6,
          averageQuality: 0.87,
        },
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(over.matchRatio).toBeCloseTo(1500 / 1800, 5);
  });

  it('documentación: vencida = 0 puntos, por vencer = 85, pendiente = 70', () => {
    const output = engine.score(
      laEsperanza({
        documents: {
          requirements: ['RENSPA', 'PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
          documents: [
            { type: 'RENSPA', status: 'VALID', expiresAt: '2026-09-01' },
            { type: 'LEASE_CONTRACT', status: 'VALID', expiresAt: '2026-10-15' },
            { type: 'ID_CUIT', status: 'PENDING_REVIEW', expiresAt: null },
          ],
        },
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    expect(component(output, 'documentation').score).toBe(Math.round((0 + 85 + 70) / 3));
  });

  it('compara el registro oficial con toda la hacienda declarada en el establecimiento', () => {
    // Segundo rodeo de 300 cabezas en un establecimiento con 1.540 registradas y 1.200 ya declaradas.
    const asset = {
      declaredQuantity: 300,
      unit: 'HEAD' as const,
      mobility: 'HIGH' as const,
      tenure: 'LEASED' as const,
    };
    const detection = {
      detectedQuantity: 296,
      confidence: 0.86,
      evidenceCount: 2,
      averageQuality: 0.87,
    };
    const perAsset = engine.score(
      laEsperanza({
        asset,
        detection,
        registry: { status: 'OK', registeredQuantity: 1540, declaredOnEstablishment: null },
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    const perEstablishment = engine.score(
      laEsperanza({
        asset,
        detection,
        registry: { status: 'OK', registeredQuantity: 1540, declaredOnEstablishment: 1500 },
      }),
      DEFAULT_SCORING_WEIGHTS,
    );
    const registryFactor = (o: typeof perAsset) =>
      component(o, 'consistency').factors.find((f) => f.label === 'Registro oficial')!.value;
    expect(registryFactor(perAsset)).toMatch(/Diferencia de 413/);
    expect(registryFactor(perEstablishment)).toBe(
      'Diferencia de 2,7 % con el registro (establecimiento)',
    );
    expect(component(perEstablishment, 'consistency').score).toBeGreaterThan(
      component(perAsset, 'consistency').score,
    );
  });

  it('respeta pesos configurables', () => {
    const weights = { documentation: 0, existence: 1, historical: 0, risk: 0, consistency: 0 };
    expect(engine.score(laEsperanza(), weights).finalScore).toBe(85);
  });
});

describe('validateWeights', () => {
  it('acepta pesos que suman 1', () => {
    expect(validateWeights({ ...DEFAULT_SCORING_WEIGHTS })).toEqual(DEFAULT_SCORING_WEIGHTS);
  });

  it('rechaza pesos que no suman 1, negativos o desconocidos', () => {
    expect(() => validateWeights({ ...DEFAULT_SCORING_WEIGHTS, risk: 0.5 })).toThrow(
      InvalidScoringWeightsError,
    );
    expect(() => validateWeights({ ...DEFAULT_SCORING_WEIGHTS, risk: -0.15 })).toThrow(
      InvalidScoringWeightsError,
    );
    expect(() => validateWeights({ ...DEFAULT_SCORING_WEIGHTS, extra: 0 })).toThrow(
      InvalidScoringWeightsError,
    );
  });
});
