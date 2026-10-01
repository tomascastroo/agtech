import { describe, expect, it } from 'vitest';
import { compactName, validateDocument, type TextAnalysis } from './document-analysis.js';

const base: TextAnalysis = {
  method: 'OCR',
  textConfidence: 0.97,
  textExcerpt:
    'SENASA CONSTANCIA DE INSCRIPCION RENSPA 06.687.0.01542/00 TITULAR: GANADERA LA ESPERANZA S.A. CUIT 30-71234567-1',
  detectedType: 'RENSPA',
  fields: {
    renspa: ['06.687.0.01542/00'],
    cuit: ['30-71234567-1'],
    holderNames: ['GANADERALAESPERANZA S.A.'],
    issuedAt: null,
    expiresAt: null,
    dates: [],
  },
};
const declared = {
  documentType: 'RENSPA' as const,
  renspa: '06.687.0.01542/00',
  holderName: 'Ganadera La Esperanza SA',
  holderTaxId: '30-71234567-1',
};

describe('validateDocument', () => {
  it('es consistente cuando RENSPA, CUIT, titular y tipo coinciden', () => {
    const r = validateDocument(base, declared);
    expect(r.status).toBe('CONSISTENT');
    expect(r.results.find((x) => x.check === 'RENSPA')?.status).toBe('MATCH');
    expect(r.results.find((x) => x.check === 'HOLDER')?.status).toBe('MATCH');
  });

  it('requiere revisión si el RENSPA leído es otro', () => {
    const r = validateDocument(
      { ...base, fields: { ...base.fields, renspa: ['06.111.0.00001/00'] } },
      declared,
    );
    expect(r.status).toBe('REVIEW_REQUIRED');
    expect(r.results.find((x) => x.check === 'RENSPA')?.status).toBe('MISMATCH');
  });

  it('requiere revisión con baja confianza de lectura aunque todo coincida', () => {
    expect(validateDocument({ ...base, textConfidence: 0.6 }, declared).status).toBe(
      'REVIEW_REQUIRED',
    );
  });

  it('requiere revisión si falta un campo obligatorio o el documento está vencido', () => {
    const noRenspa = { ...base, fields: { ...base.fields, renspa: [] } };
    expect(validateDocument(noRenspa, declared).status).toBe('REVIEW_REQUIRED');
    const expired = { ...base, fields: { ...base.fields, expiresAt: '2020-01-01' } };
    expect(validateDocument(expired, declared).status).toBe('REVIEW_REQUIRED');
  });

  it('normaliza nombres sin espacios, acentos ni forma societaria', () => {
    expect(compactName('Ganadera La Esperanza S.A.')).toBe(compactName('GANADERALAESPERANZA'));
    expect(compactName('Peñón Agropecuaria SRL')).toBe('PENONAGROPECUARIA');
  });
});
