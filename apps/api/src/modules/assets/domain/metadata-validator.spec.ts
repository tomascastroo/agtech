import { ASSET_TYPES } from '../../../database/seed/catalog.js';
import { MetadataValidator } from './metadata-validator.js';

const bovinos = ASSET_TYPES.find((t) => t.code === 'BOVINOS')!.metadataSchema;
const validator = new MetadataValidator();

describe('MetadataValidator', () => {
  it('acepta metadata válida para bovinos', () => {
    const result = validator.validate('bov', bovinos, {
      sistema_productivo: 'Cría',
      raza_predominante: 'Aberdeen Angus',
      vacas: 780,
      ultima_vacunacion_aftosa: '2026-05-18',
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('informa campos faltantes, tipos inválidos y campos no permitidos', () => {
    const result = validator.validate('bov', bovinos, { vacas: 'muchas', color: 'negro' });
    expect(result.valid).toBe(false);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(['sistema_productivo', 'raza_predominante', 'vacas', 'color']),
    );
  });

  it('todos los esquemas del catálogo compilan en modo estricto', () => {
    for (const type of ASSET_TYPES) {
      expect(() => validator.validate(type.code, type.metadataSchema, {})).not.toThrow();
    }
  });
});
