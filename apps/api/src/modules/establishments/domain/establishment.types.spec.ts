import { isValidCuit } from './establishment.types.js';

describe('isValidCuit', () => {
  it('valida el dígito verificador', () => {
    expect(isValidCuit('30-71548963-1')).toBe(true);
    expect(isValidCuit('20-22345678-3')).toBe(true);
    expect(isValidCuit('30-71548963-4')).toBe(false);
    expect(isValidCuit('30-7154896')).toBe(false);
  });
});
