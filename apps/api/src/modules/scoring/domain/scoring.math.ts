export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export const round = (value: number, decimals = 0): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Coincidencia simétrica entre cantidad declarada y detectada (1 = coincidencia exacta). */
export function matchRatio(declared: number, detected: number | null): number | null {
  if (detected === null || declared <= 0) return null;
  if (detected <= 0) return 0;
  return detected <= declared ? detected / declared : declared / detected;
}

export const percent = (ratio: number, decimals = 1): string =>
  `${round(ratio * 100, decimals).toLocaleString('es-AR')} %`;
