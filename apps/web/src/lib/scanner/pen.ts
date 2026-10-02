/**
 * Conteo de animales QUIETOS en el celular (escáner de corral), PRELIMINAR. Mismo algoritmo que
 * el servidor (apps/ai-service/src/agro_vision/domain/pen_count.py), que es el que da el conteo
 * oficial:
 *   - tracker estilo ByteTrack con compensación del movimiento de la cámara;
 *   - cada track confirmado se ubica en coordenadas del "mundo" (cuadro inicial);
 *   - dos tracks que nunca estuvieron a la vez en cuadro y ocupan el mismo lugar del mundo son
 *     el mismo animal visto de nuevo (unión conservadora); vistos a la vez, siempre distintos.
 */
import { ByteTracker, DEFAULT_TRACKER_PARAMS, iou, type Box, type Shift } from './tracker';

export const PEN_METHOD = 'agro-pen-unique/1.0.0';
export const PEN_MIN_HITS = 3;
const MERGE_MIN_IOU = 0.3;
const MERGE_MAX_CENTER_DISTANCE = 0.5;
export const OCCLUSION_IOU = 0.2;
export const SMALL_HEIGHT_FRACTION = 0.08;
const EDGE_FRACTION = 0.02;

type WorldBox = [number, number, number, number];

export interface PenSummary {
  observed: number;
  tracksCounted: number;
  mergedTracks: number;
  coverageViews: number;
  edgeAnimals: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function centerDistance(a: WorldBox, b: WorldBox): number {
  const dx = (a[0] + a[2]) / 2 - (b[0] + b[2]) / 2;
  const dy = (a[1] + a[3]) / 2 - (b[1] + b[3]) / 2;
  const size = Math.max(a[2] - a[0], a[3] - a[1], b[2] - b[0], b[3] - b[1], 1);
  return Math.hypot(dx, dy) / size;
}

/** Cajas de un cuadro que se solapan con otra (posibles animales ocultos). */
export function frameOcclusion(boxes: readonly Box[], minScore: number): [number, number] {
  const strong = boxes.filter((b) => b[4] >= minScore);
  const overlapped = strong.filter((a, i) =>
    strong.some((b, j) => j !== i && iou(a, b) >= OCCLUSION_IOU),
  ).length;
  return [overlapped, strong.length];
}

export class PenCounter {
  readonly tracker: ByteTracker;
  private frame = 0;
  private offset: [number, number] = [0, 0];
  private readonly world = new Map<number, WorldBox[]>();
  private readonly framesOf = new Map<number, Set<number>>();
  private minCameraX = 0;
  private maxCameraX = 0;

  constructor(readonly frameSize: readonly [number, number]) {
    this.tracker = new ByteTracker(frameSize, DEFAULT_TRACKER_PARAMS);
  }

  /** `shift`: desplazamiento del contenido desde el cuadro anterior (px). */
  update(boxes: readonly Box[], shift: Shift = [0, 0]): void {
    const index = this.frame++;
    this.offset = [this.offset[0] + shift[0], this.offset[1] + shift[1]];
    this.minCameraX = Math.min(this.minCameraX, -this.offset[0]);
    this.maxCameraX = Math.max(this.maxCameraX, -this.offset[0]);
    this.tracker.update(index, boxes, shift);
    for (const t of this.tracker.tracks) {
      if (t.lastFrame !== index) continue;
      const [x1, y1, x2, y2] = t.box;
      const w: WorldBox = [
        x1 - this.offset[0],
        y1 - this.offset[1],
        x2 - this.offset[0],
        y2 - this.offset[1],
      ];
      this.world.set(t.id, [...(this.world.get(t.id) ?? []), w]);
      if (!this.framesOf.has(t.id)) this.framesOf.set(t.id, new Set());
      this.framesOf.get(t.id)!.add(index);
    }
  }

  summary(): PenSummary {
    const [width] = this.frameSize;
    const candidates = this.tracker.confirmedTracks().filter((t) => t.hits >= PEN_MIN_HITS);
    const medians = new Map<number, WorldBox>(
      candidates.map((t) => {
        const boxes = this.world.get(t.id) ?? [];
        return [t.id, [0, 1, 2, 3].map((k) => median(boxes.map((b) => b[k]!))) as WorldBox];
      }),
    );
    const parent = new Map(candidates.map((t) => [t.id, t.id]));
    const find = (i: number): number => {
      while (parent.get(i) !== i) i = parent.get(i)!;
      return i;
    };
    const members = new Map(candidates.map((t) => [t.id, new Set([t.id])]));
    const framesOfGroup = (root: number) => {
      const out = new Set<number>();
      for (const m of members.get(root) ?? [])
        for (const f of this.framesOf.get(m) ?? []) out.add(f);
      return out;
    };
    const ordered = [...candidates].sort((a, b) => a.id - b.id);
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const [a, b] = [ordered[i]!, ordered[j]!];
        const [ra, rb] = [find(a.id), find(b.id)];
        if (ra === rb) continue;
        const fa = framesOfGroup(ra);
        if ([...framesOfGroup(rb)].some((f) => fa.has(f))) continue;
        const [wa, wb] = [medians.get(a.id)!, medians.get(b.id)!];
        if (
          iou([...wa, 1], [...wb, 1]) >= MERGE_MIN_IOU ||
          centerDistance(wa, wb) <= MERGE_MAX_CENTER_DISTANCE
        ) {
          parent.set(rb, ra);
          for (const m of members.get(rb)!) members.get(ra)!.add(m);
          members.delete(rb);
        }
      }
    }
    const groups = new Set(candidates.map((t) => find(t.id))).size;
    const left = this.minCameraX + EDGE_FRACTION * width;
    const right = this.maxCameraX + width - EDGE_FRACTION * width;
    const edgeAnimals = candidates.filter((t) => {
      const w = medians.get(t.id)!;
      return w[0] <= left || w[2] >= right;
    }).length;
    return {
      observed: groups,
      tracksCounted: candidates.length,
      mergedTracks: candidates.length - groups,
      coverageViews:
        Math.round(((this.maxCameraX - this.minCameraX + width) / Math.max(width, 1)) * 100) / 100,
      edgeAnimals,
    };
  }
}

/** Versión por lotes (pruebas): mismas entradas que pen_count.count_pen del servidor. */
export function countPen(
  frames: readonly (readonly Box[])[],
  frameSize: readonly [number, number],
  shifts?: readonly Shift[],
): PenSummary {
  const counter = new PenCounter(frameSize);
  frames.forEach((boxes, i) => counter.update(boxes, shifts ? shifts[i]! : [0, 0]));
  return counter.summary();
}
