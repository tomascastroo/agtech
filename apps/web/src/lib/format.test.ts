import {
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatRelative,
  unitLabel,
} from './format';

describe('formatos es-AR', () => {
  it('formatea cantidades con separador de miles y unidad', () => {
    expect(formatQuantity(1482, 'HEAD')).toBe('1.482 cabezas');
    expect(formatQuantity(1, 'HEAD')).toBe('1 cabeza');
    expect(formatQuantity(347.94, 'HECTARE')).toBe('347,9 ha');
    expect(formatQuantity(null, 'HEAD')).toBe('—');
    expect(unitLabel('UNIT', 3)).toBe('unidades');
  });

  it('formatea porcentajes y montos', () => {
    expect(formatPercent(98.8, 0)).toBe('99 %');
    expect(formatPercent(98.8)).toBe('98,8 %');
    expect(formatMoney(1_350_000)).toBe('USD 1.350.000');
    expect(formatMoney(2_648_000, 'USD', true)).toBe('USD 2,6 M');
  });

  it('no corre un día las fechas sin hora', () => {
    expect(formatDate('2026-05-18')).toMatch(/^18 .*may.* 2026$/);
  });

  it('expresa tiempos relativos', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(formatRelative('2026-10-01T11:58:00Z', now)).toBe('hace 2 min');
    expect(formatRelative('2026-09-30T12:00:00Z', now)).toBe('hace 1 día');
    expect(formatRelative(null, now)).toBe('—');
  });
});
