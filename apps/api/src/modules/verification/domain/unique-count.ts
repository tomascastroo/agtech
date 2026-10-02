/**
 * Estimación de animales únicos a partir de varias imágenes, evitando el doble conteo.
 *
 * Regla conservadora y explicable: dos imágenes se consideran de animales DISTINTOS solo si
 *   - son de cámaras fijas distintas (instalaciones que cubren zonas diferentes), o
 *   - ambas tienen ubicación de captura medida (GPS/EXIF/manual) a más de 300 m entre sí
 *     (más la imprecisión declarada) y fueron tomadas con menos de 20 minutos de diferencia.
 * En cualquier otro caso pueden mostrar los mismos animales: se agrupan y de cada grupo se toma
 * el máximo (cota inferior de animales únicos), nunca la suma.
 */

export interface CountedImage {
  evidenceId: string;
  count: number;
  deviceId: string | null;
  capturedAt: Date;
  /** Solo ubicaciones de captura reales (no la del establecimiento). */
  location: { latitude: number; longitude: number } | null;
  accuracyM: number | null;
  dhash: string | null;
  /**
   * Distancia mínima (m) para considerar esta captura de otra zona. Por defecto la regla general
   * (300 m); en feedlot, los escaneos de corral usan una menor (corrales vecinos). Para un par se
   * toma la MAYOR de las dos (la más conservadora).
   */
  distinctMinDistanceM?: number;
}

export interface OverlapGroup {
  evidenceIds: string[];
  counts: number[];
  estimate: number;
  reason: string;
}

export interface UniqueCountEstimate {
  /** Suma ingenua de detecciones por imagen (cota superior). */
  detectionsSum: number;
  /** Animales únicos estimados (suma de los máximos por grupo). */
  uniqueEstimate: number;
  groups: OverlapGroup[];
  possibleOverlap: boolean;
  method: string;
}

export const DISTINCT_MIN_DISTANCE_M = 300;
export const DISTINCT_MAX_TIME_GAP_MIN = 20;
const NEAR_DUPLICATE_HAMMING = 6;

function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let bits = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/** ¿Hay base suficiente para afirmar que dos imágenes muestran animales distintos? */
export function provablyDistinct(
  a: CountedImage,
  b: CountedImage,
): { distinct: boolean; reason: string } {
  if (a.dhash && b.dhash && hamming(a.dhash, b.dhash) <= NEAR_DUPLICATE_HAMMING) {
    return { distinct: false, reason: 'imágenes casi idénticas' };
  }
  if (a.deviceId && b.deviceId) {
    return a.deviceId === b.deviceId
      ? { distinct: false, reason: 'misma cámara' }
      : { distinct: true, reason: 'cámaras fijas en instalaciones distintas' };
  }
  if (a.location && b.location) {
    const d = distanceM(a.location, b.location);
    const gapMin = Math.abs(a.capturedAt.getTime() - b.capturedAt.getTime()) / 60_000;
    const minDistance = Math.max(
      a.distinctMinDistanceM ?? DISTINCT_MIN_DISTANCE_M,
      b.distinctMinDistanceM ?? DISTINCT_MIN_DISTANCE_M,
    );
    const threshold = minDistance + (a.accuracyM ?? 0) + (b.accuracyM ?? 0);
    if (d > threshold && gapMin <= DISTINCT_MAX_TIME_GAP_MIN) {
      return { distinct: true, reason: `capturas a ${Math.round(d)} m entre sí` };
    }
    return {
      distinct: false,
      reason:
        d <= threshold
          ? `capturas a ${Math.round(d)} m entre sí (mismo sector)`
          : `capturas separadas por ${Math.round(gapMin)} min (los animales pueden haberse desplazado)`,
    };
  }
  return { distinct: false, reason: 'sin ubicación de captura que permita distinguirlas' };
}

export function estimateUniqueAnimals(images: CountedImage[]): UniqueCountEstimate {
  const parent = images.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const reasons = new Map<number, string>();
  for (let i = 0; i < images.length; i++) {
    for (let j = i + 1; j < images.length; j++) {
      const check = provablyDistinct(images[i]!, images[j]!);
      if (!check.distinct) {
        const [ri, rj] = [find(i), find(j)];
        if (ri !== rj) parent[rj] = ri;
        reasons.set(find(i), check.reason);
      }
    }
  }
  const byRoot = new Map<number, number[]>();
  images.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), i]));
  const groups: OverlapGroup[] = [...byRoot.entries()].map(([root, members]) => {
    const counts = members.map((m) => images[m]!.count);
    return {
      evidenceIds: members.map((m) => images[m]!.evidenceId),
      counts,
      estimate: counts.length ? Math.max(...counts) : 0,
      reason:
        members.length > 1 ? (reasons.get(root) ?? 'posible solapamiento') : 'imagen independiente',
    };
  });
  const detectionsSum = images.reduce((acc, i) => acc + i.count, 0);
  const uniqueEstimate = groups.reduce((acc, g) => acc + g.estimate, 0);
  const possibleOverlap = groups.some(
    (g) => g.evidenceIds.length > 1 && g.counts.filter((c) => c > 0).length > 1,
  );
  return {
    detectionsSum,
    uniqueEstimate,
    groups,
    possibleOverlap,
    method: `agrupación por posible solapamiento (máximo por grupo); distintas solo si cámaras fijas distintas o GPS a >${DISTINCT_MIN_DISTANCE_M} m en ≤${DISTINCT_MAX_TIME_GAP_MIN} min`,
  };
}
