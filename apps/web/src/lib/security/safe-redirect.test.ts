import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-redirect';

describe('safeInternalPath', () => {
  it('acepta rutas internas', () => {
    expect(safeInternalPath('/guarantees/abc?tab=x')).toBe('/guarantees/abc?tab=x');
    expect(safeInternalPath('/productor')).toBe('/productor');
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\\/evil.example',
    'javascript:alert(1)',
    '/\tevil',
    `/${'a'.repeat(600)}`,
  ])('rechaza %s', (value) => {
    expect(safeInternalPath(value)).toBeNull();
  });
});
