import { describe, expect, it } from 'vitest';
import { classifyReading, formatEid, normalizeEid } from './rfid.js';

describe('RFID', () => {
  it('normaliza EID ISO 11784 con o sin separadores', () => {
    expect(normalizeEid('032 0000 1245 5678')).toBe('032000012455678');
    expect(normalizeEid('032-000012455678')).toBe('032000012455678');
    expect(normalizeEid('12345')).toBeNull();
    expect(normalizeEid('03200001245567X')).toBeNull();
    expect(formatEid('032000012455678')).toBe('032 0000 1245 5678');
  });

  it('clasifica la lectura según el animal y el establecimiento', () => {
    expect(classifyReading(null, 'e1')).toBe('UNKNOWN_TAG');
    expect(classifyReading({ establishmentId: 'e1' }, 'e1')).toBe('IDENTIFIED');
    expect(classifyReading({ establishmentId: 'e2' }, 'e1')).toBe('OTHER_ESTABLISHMENT');
  });
});
