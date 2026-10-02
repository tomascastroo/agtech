/**
 * Pre/posprocesamiento de YOLOX (Megvii, Apache-2.0) para el celular. Replica exactamente
 * apps/ai-service/src/agro_vision/domain/detection.py: letterbox con gris 114 alineado arriba a
 * la izquierda, canales BGR sin normalizar, decodificación por grillas (strides 8/16/32),
 * score = objetividad × clase, filtro por clases de ganado y NMS agnóstica de clase.
 */
import type { Box } from './tracker';

export const STRIDES = [8, 16, 32] as const;
/** Índices COCO: horse 17, sheep 18, cow 19 (conjunto "livestock" del servicio de visión). */
export const LIVESTOCK_CLASS_IDS = new Set([17, 18, 19]);

export interface Letterbox {
  ratio: number;
  width: number;
  height: number;
}

export function letterboxGeometry(srcW: number, srcH: number, size: number): Letterbox {
  const ratio = Math.min(size / srcW, size / srcH);
  return { ratio, width: Math.floor(srcW * ratio), height: Math.floor(srcH * ratio) };
}

/** RGBA (canvas, ya con letterbox) → tensor CHW float32 en orden BGR, valores 0-255. */
export function rgbaToBgrTensor(
  rgba: Uint8ClampedArray,
  size: number,
  out = new Float32Array(3 * size * size),
): Float32Array {
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    out[i] = rgba[i * 4 + 2]!; // B
    out[plane + i] = rgba[i * 4 + 1]!; // G
    out[2 * plane + i] = rgba[i * 4]!; // R
  }
  return out;
}

function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

export function nms(boxes: Box[], iouThreshold = 0.45): Box[] {
  const ordered = [...boxes].sort((a, b) => b[4] - a[4]);
  const kept: Box[] = [];
  for (const box of ordered) {
    if (kept.every((k) => iou(k, box) <= iouThreshold)) kept.push(box);
  }
  return kept;
}

/**
 * Salida cruda [1, N, 5 + clases] → cajas en píxeles de la imagen original (x1, y1, x2, y2, score).
 */
export function decodeYolox(
  raw: Float32Array,
  size: number,
  numClasses: number,
  scoreThreshold: number,
  letterbox: Letterbox,
  frame: { width: number; height: number },
  classIds: Set<number> = LIVESTOCK_CLASS_IDS,
): Box[] {
  const stride = 5 + numClasses;
  const candidates: Box[] = [];
  let anchor = 0;
  for (const s of STRIDES) {
    const gw = Math.floor(size / s);
    const gh = Math.floor(size / s);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++, anchor++) {
        const o = anchor * stride;
        const objectness = raw[o + 4]!;
        if (objectness < scoreThreshold) continue;
        let best = -1;
        let bestScore = 0;
        for (let c = 0; c < numClasses; c++) {
          const score = objectness * raw[o + 5 + c]!;
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (bestScore < scoreThreshold || !classIds.has(best)) continue;
        const cx = (raw[o]! + gx) * s;
        const cy = (raw[o + 1]! + gy) * s;
        const w = Math.exp(raw[o + 2]!) * s;
        const h = Math.exp(raw[o + 3]!) * s;
        const r = letterbox.ratio;
        const x1 = Math.min(Math.max((cx - w / 2) / r, 0), frame.width);
        const y1 = Math.min(Math.max((cy - h / 2) / r, 0), frame.height);
        const x2 = Math.min(Math.max((cx + w / 2) / r, 0), frame.width);
        const y2 = Math.min(Math.max((cy + h / 2) / r, 0), frame.height);
        if (x2 - x1 >= 2 && y2 - y1 >= 2) candidates.push([x1, y1, x2, y2, bestScore]);
      }
    }
  }
  return nms(candidates);
}
