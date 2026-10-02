/**
 * Movimiento de la cámara en el celular (escáner de corral), liviano: miniaturas en escala de
 * grises de ~96 px de ancho y búsqueda del desplazamiento que minimiza la diferencia absoluta
 * media (SAD) entre cuadros consecutivos. Las zonas con animales se ignoran (un animal que camina
 * no es un movimiento de la cámara). Es solo para el conteo PRELIMINAR y las instrucciones en
 * vivo; el servidor usa flujo óptico + RANSAC sobre los cuadros completos.
 */
export const MOTION_WIDTH = 96;

export interface Thumbnail {
  gray: Uint8Array;
  width: number;
  height: number;
}

export function thumbnailSize(videoWidth: number, videoHeight: number): [number, number] {
  const height = Math.max(8, Math.round((MOTION_WIDTH * videoHeight) / Math.max(videoWidth, 1)));
  return [MOTION_WIDTH, height];
}

/** RGBA → luminancia (BT.601). */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Thumbnail {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4]! * 299 + rgba[i * 4 + 1]! * 587 + rgba[i * 4 + 2]! * 114) / 1000;
  }
  return { gray, width, height };
}

export function meanBrightness(t: Thumbnail): number {
  let sum = 0;
  for (const v of t.gray) sum += v;
  return t.gray.length ? sum / t.gray.length : 0;
}

/**
 * Desplazamiento del CONTENIDO de `prev` a `cur`, en px de la miniatura: cur(x) ≈ prev(x − dx).
 * `exclude`: cajas (px de la miniatura) de animales en `prev` que no se usan para comparar.
 * Devuelve null si no hay textura suficiente para decidir.
 */
export function estimateShift(
  prev: Thumbnail,
  cur: Thumbnail,
  exclude: readonly (readonly [number, number, number, number])[] = [],
  maxDx = 16,
  maxDy = 6,
): [number, number] | null {
  const { width: w, height: h } = prev;
  if (cur.width !== w || cur.height !== h) return null;
  const mask = new Uint8Array(w * h);
  for (const [x1, y1, x2, y2] of exclude) {
    for (let y = Math.max(0, Math.floor(y1)); y < Math.min(h, Math.ceil(y2)); y++)
      for (let x = Math.max(0, Math.floor(x1)); x < Math.min(w, Math.ceil(x2)); x++)
        mask[y * w + x] = 1;
  }
  // Sin textura (cielo, pantalla negra): no se puede estimar.
  let mean = 0;
  for (const v of prev.gray) mean += v;
  mean /= prev.gray.length;
  let variance = 0;
  for (const v of prev.gray) variance += (v - mean) ** 2;
  if (variance / prev.gray.length < 20) return null;

  const costs = new Map<string, number>();
  let best: [number, number] = [0, 0];
  let bestCost = Number.POSITIVE_INFINITY;
  for (let dy = -maxDy; dy <= maxDy; dy++) {
    for (let dx = -maxDx; dx <= maxDx; dx++) {
      let sum = 0;
      let n = 0;
      for (let y = Math.max(0, dy); y < Math.min(h, h + dy); y += 1) {
        const py = y - dy;
        for (let x = Math.max(0, dx); x < Math.min(w, w + dx); x += 1) {
          const px = x - dx;
          if (mask[py * w + px]) continue;
          sum += Math.abs(cur.gray[y * w + x]! - prev.gray[py * w + px]!);
          n++;
        }
      }
      // Se exige que se compare al menos un tercio de la miniatura.
      const cost = n > (w * h) / 3 ? sum / n : Number.POSITIVE_INFINITY;
      costs.set(`${dx},${dy}`, cost);
      if (cost < bestCost) {
        bestCost = cost;
        best = [dx, dy];
      }
    }
  }
  if (!Number.isFinite(bestCost)) return null;
  // Refinamiento sub-píxel horizontal (parábola por los vecinos).
  const [bx, by] = best;
  const left = costs.get(`${bx - 1},${by}`);
  const right = costs.get(`${bx + 1},${by}`);
  let sub = 0;
  if (left !== undefined && right !== undefined && Number.isFinite(left + right)) {
    const denom = left - 2 * bestCost + right;
    if (denom > 0) sub = Math.max(-0.5, Math.min(0.5, (left - right) / (2 * denom)));
  }
  return [bx + sub, by];
}
