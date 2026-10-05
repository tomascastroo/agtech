import { describe, expect, it } from 'vitest';
import {
  CREDIT_PRODUCTS,
  evaluateRequirement,
  evaluateRequirements,
  REQUIREMENT_CATALOG,
  type RequirementDocument,
} from './document-requirements.js';

const renspa = REQUIREMENT_CATALOG.RENSPA;
const doc = (patch: Partial<RequirementDocument> = {}): RequirementDocument => ({
  id: 'd1',
  type: 'RENSPA',
  status: 'PENDING_REVIEW',
  createdAt: new Date('2026-09-01'),
  analysis: { status: 'CONSISTENT', validationResults: [] },
  ...patch,
});

describe('requisitos documentales', () => {
  it('sin documento → pendiente; no aplica → no aplica', () => {
    expect(evaluateRequirement(renspa, []).status).toBe('PENDING');
    expect(evaluateRequirement(renspa, [doc()], { notApplicable: true }).status).toBe(
      'NOT_APPLICABLE',
    );
  });

  it('lectura en curso → procesando; consistente; lectura fallida → requiere revisión', () => {
    expect(evaluateRequirement(renspa, [doc({ analysis: null })]).status).toBe('PROCESSING');
    expect(evaluateRequirement(renspa, [doc()]).status).toBe('CONSISTENT');
    expect(
      evaluateRequirement(renspa, [doc({ analysis: { status: 'FAILED', validationResults: [] } })])
        .status,
    ).toBe('REVIEW_REQUIRED');
  });

  it('un dato distinto del declarado → inconsistente, con el motivo', () => {
    const r = evaluateRequirement(renspa, [
      doc({
        analysis: {
          status: 'REVIEW_REQUIRED',
          validationResults: [
            {
              check: 'RENSPA',
              status: 'MISMATCH',
              required: true,
              expected: '99.001.0.00001/00',
              found: ['99.001.0.00002/00'],
              message: 'RENSPA del documento distinto del declarado',
            },
          ],
        },
      }),
    ]);
    expect(r).toMatchObject({ status: 'INCONSISTENT', reason: expect.stringContaining('RENSPA') });
  });

  it('la revisión de la entidad manda; el documento más reciente cuenta', () => {
    expect(evaluateRequirement(renspa, [doc({ status: 'REJECTED' })]).status).toBe('INCONSISTENT');
    expect(evaluateRequirement(renspa, [doc({ status: 'EXPIRED' })]).reason).toBe(
      'Documento vencido',
    );
    const older = doc({ id: 'old', status: 'REJECTED', createdAt: new Date('2026-01-01') });
    expect(evaluateRequirement(renspa, [older, doc()]).documentId).toBe('d1');
  });

  it('sin validación automática → cargado (revisión humana); otro tipo no cuenta', () => {
    const financial = REQUIREMENT_CATALOG.FINANCIAL_STATEMENTS;
    expect(evaluateRequirement(financial, [doc({ type: 'FINANCIAL_STATEMENTS' })]).status).toBe(
      'UPLOADED',
    );
    expect(evaluateRequirement(financial, [doc()]).status).toBe('PENDING');
  });

  it('productos: requisitos del catálogo, fuentes en las referencias y nada universal', () => {
    for (const p of CREDIT_PRODUCTS) {
      for (const r of p.requirements) expect(REQUIREMENT_CATALOG[r.code]).toBeDefined();
      if (p.kind === 'REFERENCE') {
        expect(p.sources.length).toBeGreaterThan(0);
        expect(p.consultedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      // Ningún producto exige todo el catálogo como obligatorio.
      const mandatory = p.requirements.filter((r) => r.obligation === 'MANDATORY');
      expect(mandatory.length).toBeLessThan(Object.keys(REQUIREMENT_CATALOG).length);
    }
  });

  it('cada documento respalda un solo requisito (no se verifican todos juntos)', () => {
    const reqs = (['ACTIVITY_HISTORY', 'FINANCIAL_STATEMENTS', 'RENSPA', 'TAX_ID'] as const).map(
      (code, sortOrder) => ({ code, definition: REQUIREMENT_CATALOG[code], sortOrder }),
    );
    // Un único documento de información financiera: lo toma el requisito específico, no ambos.
    const one = evaluateRequirements(reqs, [doc({ id: 'fin', type: 'FINANCIAL_STATEMENTS' })]);
    expect(one.get('FINANCIAL_STATEMENTS')!.documentId).toBe('fin');
    expect(one.get('ACTIVITY_HISTORY')!.documentId).toBeNull();
    expect(one.get('ACTIVITY_HISTORY')!.status).toBe('PENDING');
    // Con dos documentos, cada requisito tiene el suyo; RENSPA y CUIT no se tocan.
    const two = evaluateRequirements(reqs, [
      doc({ id: 'fin', type: 'FINANCIAL_STATEMENTS' }),
      doc({ id: 'hist', type: 'OTHER' }),
      doc({ id: 'ren', type: 'RENSPA', analysis: null }),
    ]);
    expect(two.get('ACTIVITY_HISTORY')!.documentId).toBe('hist');
    expect(two.get('RENSPA')!.status).toBe('PROCESSING');
    expect(two.get('TAX_ID')!.status).toBe('PENDING');
    const used = [...two.values()].map((e) => e.documentId).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
});
