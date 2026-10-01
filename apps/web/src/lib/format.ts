import type { Unit } from './api/types';

const LOCALE = 'es-AR';
const TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString(LOCALE, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—';
  return `${formatNumber(value, decimals)} %`;
}

export function formatMoney(
  value: number | null | undefined,
  currency = 'USD',
  compact = false,
): string {
  if (value === null || value === undefined) return '—';
  if (compact && Math.abs(value) >= 1_000_000)
    return `${currency} ${formatNumber(value / 1_000_000, 1)} M`;
  if (compact && Math.abs(value) >= 1_000)
    return `${currency} ${formatNumber(value / 1_000, 0)} mil`;
  return `${currency} ${formatNumber(value, 0)}`;
}

/** Fechas sin hora (AAAA-MM-DD) se interpretan como día calendario, sin corrimiento de zona. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year!, month! - 1, day!, 12)).toLocaleDateString(LOCALE, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: TIME_ZONE,
    });
  }
  return new Date(value).toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TIME_ZONE,
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

export function formatRelative(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return '—';
  const diff = now - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'hace instantes';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

const UNIT_LABELS: Record<Unit, [string, string]> = {
  HEAD: ['cabeza', 'cabezas'],
  HECTARE: ['ha', 'ha'],
  TONNE: ['t', 't'],
  UNIT: ['unidad', 'unidades'],
  CUBIC_METER: ['m³', 'm³'],
};

export function unitLabel(unit: Unit, quantity = 2): string {
  const [singular, plural] = UNIT_LABELS[unit] ?? ['', ''];
  return quantity === 1 ? singular : plural;
}

export function formatQuantity(value: number | null | undefined, unit: Unit): string {
  if (value === null || value === undefined) return '—';
  const decimals = unit === 'HECTARE' ? 1 : 0;
  return `${formatNumber(value, decimals)} ${unitLabel(unit, value)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${formatNumber(bytes / 1_048_576, 1)} MB`;
}
