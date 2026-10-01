import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedVegetation } from './phenology.js';
import { assessVegetation, type CurrentObservation } from './vegetation-assessment.js';
import { detectVegetationChange } from './vegetation-change.js';

const d = (iso: string) => new Date(`${iso}T14:00:00Z`);

describe('Fenología esperada', () => {
  it('maíz recién sembrado no tiene vegetación esperable', () => {
    const p = expectedVegetation(
      'CULTIVOS',
      { cultivo: 'Maíz', fecha_siembra: '2026-09-14' },
      d('2026-09-30'),
    );
    expect(p.stage).toBe('IMPLANTACION');
    expect(p.vegetationExpected).toBe(false);
  });
  it('trigo sembrado en junio está en crecimiento en septiembre', () => {
    const p = expectedVegetation(
      'CULTIVOS',
      { cultivo: 'Trigo', fecha_siembra: '2026-06-01' },
      d('2026-09-20'),
    );
    expect(p.stage).toBe('CRECIMIENTO');
  });
  it('viñedo en reposo invernal y activo en verano', () => {
    expect(expectedVegetation('VINEDOS', {}, d('2026-08-15')).stage).toBe('REPOSO');
    expect(expectedVegetation('VINEDOS', {}, d('2026-02-15')).vegetationExpected).toBe(true);
  });
});

describe('Detección de cambios NDVI', () => {
  it('caída significativa contra la observación anterior', () => {
    const c = detectVegetationChange({ observedAt: d('2026-08-23'), ndviMean: 0.3155 }, [
      { observedAt: d('2026-08-08'), ndviMean: 0.5745 },
    ]);
    expect(c.direction).toBe('DECLINE');
    expect(c.changePct).toBeCloseTo(-45.08, 1);
  });
  it('ignora referencias con nubosidad parcial', () => {
    const c = detectVegetationChange({ observedAt: d('2026-09-01'), ndviMean: 0.24 }, [
      { observedAt: d('2026-08-19'), ndviMean: 0.25, quality: 'GOOD' },
      { observedAt: d('2026-08-22'), ndviMean: 0.04, quality: 'ACCEPTABLE' },
    ]);
    expect(c.previous?.ndviMean).toBe(0.25);
    expect(c.direction).toBe('STABLE');
  });
});

/** Series Sentinel-2 reales del seed (infra/seed-assets/satellite/real). */
interface Fixture {
  observations: {
    scene_id: string;
    acquired_at: string;
    ndvi_mean: number | null;
    vegetated_area_estimated_ha: number | null;
    polygon_area_ha: number;
    cloud_cover_pct: number;
    valid_fraction: number;
    usable: boolean;
    quality: string;
  }[];
}
const fixture = (key: string): Fixture =>
  JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../../../infra/seed-assets/satellite/real',
        key,
        'manifest.json',
      ),
      'utf8',
    ),
  ) as Fixture;

function assessAt(
  key: string,
  date: string,
  typeCode: string,
  metadata: Record<string, unknown>,
  declaredHa: number,
) {
  const obs = fixture(key).observations.filter((o) => o.usable && o.ndvi_mean !== null);
  const index = obs.findIndex((o) => o.acquired_at.startsWith(date));
  const o = obs[index]!;
  const current: CurrentObservation = {
    evidenceId: 'e',
    observationId: 'o',
    sceneId: o.scene_id,
    acquiredAt: new Date(o.acquired_at),
    ndviMean: o.ndvi_mean!,
    ndviMedian: null,
    ndviMin: null,
    ndviMax: null,
    ndviStd: null,
    vegetationPct: null,
    vegetatedAreaHa: o.vegetated_area_estimated_ha,
    analyzedAreaHa: o.polygon_area_ha,
    cloudCoverPct: o.cloud_cover_pct,
    validFraction: o.valid_fraction,
    quality: o.quality,
  };
  return assessVegetation({
    verificationId: 'r',
    now: new Date(Date.parse(o.acquired_at) + 86_400_000),
    assetTypeCode: typeCode,
    metadata,
    declaredHa,
    current,
    excluded: [],
    history: obs.slice(0, index).map((h) => ({
      observedAt: new Date(h.acquired_at),
      ndviMean: h.ndvi_mean!,
      quality: h.quality,
    })),
    newestUsableAt: current.acquiredAt,
    windowDays: 30,
  });
}

describe('Evaluación sobre observaciones Sentinel-2 reales', () => {
  it('trigo: superficie con vegetación activa coincide con la declarada', () => {
    const r = assessAt(
      'los-alamos-trigo',
      '2026-09-17',
      'CULTIVOS',
      { cultivo: 'Trigo', fecha_siembra: '2026-06-01' },
      61,
    );
    expect(r.primaryEvidenceCount).toBe(1);
    expect(r.detectedQuantity! / 61).toBeGreaterThan(0.95);
    expect(r.anomalies.map((a) => a.code)).not.toContain('VEGETATION_AREA_DROP');
  });
  it('maíz: el barbecho produce una disminución significativa de actividad vegetal', () => {
    const r = assessAt(
      'los-ceibos-maiz',
      '2026-08-23',
      'CULTIVOS',
      { cultivo: 'Maíz', fecha_siembra: '2026-09-14' },
      54,
    );
    expect(r.anomalies.map((a) => a.code)).toContain('VEGETATION_DECLINE');
    expect(r.primaryEvidenceCount).toBe(0); // pre-siembra: no concluyente
  });
});
