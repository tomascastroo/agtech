import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidCuit } from '../../establishments/domain/establishment.types.js';
import { DEMO_PRODUCER, DEMO_SCENARIOS } from './demo-scenarios.js';

const DOCS = join(import.meta.dirname, '../../../../../../infra/seed-assets/demo-documents');

describe('escenarios de demostración', () => {
  it('usan datos ficticios: CUIT válido de demo y RENSPA de provincia inexistente', () => {
    expect(isValidCuit(DEMO_PRODUCER.taxId)).toBe(true);
    expect(DEMO_PRODUCER.taxId).toBe('20-00000001-9');
    expect(DEMO_PRODUCER.renspa.startsWith('99.')).toBe(true);
  });

  it('cada escenario tiene sus documentos de demostración', () => {
    expect(DEMO_SCENARIOS.map((s) => s.code)).toEqual([
      'COMPLETE',
      'MISSING_DOCUMENTS',
      'INCONSISTENT',
      'READY',
      'GUARANTEE_VERIFIED',
      'GUARANTEE_INSPECTION',
    ]);
    for (const s of DEMO_SCENARIOS)
      for (const d of s.documents) expect(existsSync(join(DOCS, `${d}.png`))).toBe(true);
  });
});
