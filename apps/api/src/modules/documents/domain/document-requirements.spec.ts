import { describe, expect, it } from 'vitest';
import {
  CREDIT_PRODUCTS,
  evaluateRequirement,
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
});
