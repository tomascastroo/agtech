import { describe, expect, it } from 'vitest';
import { redactUrl } from './logging.module.js';

describe('redactUrl', () => {
  it('oculta el token de los links del productor y del inspector', () => {
    expect(redactUrl('/api/producer/requests/abc123/evidence')).toBe(
      '/api/producer/requests/[REDACTED]/evidence',
    );
    expect(redactUrl('/api/inspections/XyZ_-9?x=1')).toBe('/api/inspections/[REDACTED]?x=1');
  });

  it('oculta secretos en la query y deja el resto igual', () => {
    expect(redactUrl('/api/x?token=s3cret&page=2')).toBe('/api/x?token=[REDACTED]&page=2');
    expect(redactUrl('/api/bovine-guarantees/1')).toBe('/api/bovine-guarantees/1');
    expect(redactUrl('/api/producer/me/requests/1')).toBe('/api/producer/me/requests/1');
  });
});
