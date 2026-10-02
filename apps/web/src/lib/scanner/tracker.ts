/**
 * Tracker del Escáner de Bovinos y conteo neto por línea.
 *
 * Es el MISMO algoritmo que apps/ai-service/src/agro_vision/domain/tracking.py (allí está la
 * explicación completa); ambos se prueban con el fixture compartido
 * apps/ai-service/tests/fixtures/scanner-tracks.json. En el celular da el conteo PRELIMINAR en
 * vivo; el conteo oficial lo recalcula el servidor sobre los cuadros muestreados.
 */

export const TRACKER_VERSION = 'agro-bytetrack/1.0.0';

/** x1, y1, x2, y2, score */
export type Box = readonly [number, number, number, number, number];
export type Orientation = 'vertical' | 'horizontal';

export interface TrackerParams {
  highThreshold: number;
  lowThreshold: number;
  newTrackThreshold: number;
  minAffinityHigh: number;
  minAffinityLow: number;
  maxCenterDistance: number;
  maxLost: number;
  minHits: number;
  velocitySmoothing: number;
}

export const DEFAULT_TRACKER_PARAMS: TrackerParams = {
  highThreshold: 0.4,
  lowThreshold: 0.15,
  newTrackThreshold: 0.45,
  minAffinityHigh: 0.1,
  minAffinityLow: 0.3,
  maxCenterDistance: 0.75,
  maxLost: 8,
  minHits: 2,
  velocitySmoothing: 0.5,
};

export interface LineSpec {
  orientation: Orientation;
  /** Fracción del ancho (vertical) o alto (horizontal). */
  position: number;
  /** Banda de histéresis, fracción de esa dimensión. */
  hysteresis: number;
}

export const DEFAULT_LINE: LineSpec = { orientation: 'vertical', position: 0.5, hysteresis: 0.02 };

export interface Track {
  id: number;
  box: Box;
  firstFrame: number;
  lastFrame: number;
  side: number;
  scoreSum: number;
  confirmed: boolean;
  vx: number;
  vy: number;
  hits: number;
  lost: number;
  pending: [number, number][];
}

export interface CrossingEvent {
  trackId: number;
  frame: number;
  direction: 1 | -1;
}

export type Shift = readonly [number, number];

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

export function affinity(predicted: Box, box: Box, maxCenterDistance: number): number {
  const overlap = iou(predicted, box);
  if (overlap > 0) return overlap;
  const cx1 = (predicted[0] + predicted[2]) / 2;
  const cy1 = (predicted[1] + predicted[3]) / 2;
  const cx2 = (box[0] + box[2]) / 2;
  const cy2 = (box[1] + box[3]) / 2;
  const size = Math.max(predicted[2] - predicted[0], predicted[3] - predicted[1], 1);
  const distance = Math.hypot(cx1 - cx2, cy1 - cy2) / size;
  if (distance >= maxCenterDistance) return 0;
  return 0.5 * (1 - distance / maxCenterDistance);
}

export class ByteTracker {
  readonly params: TrackerParams;
  readonly line: LineSpec;
  tracks: Track[] = [];
  removed: Track[] = [];
  events: CrossingEvent[] = [];
  private nextId = 1;
  private readonly linePx: number;
  private readonly margin: number;

  constructor(
    frameSize: readonly [number, number],
    params: Partial<TrackerParams> = {},
    line: LineSpec = DEFAULT_LINE,
  ) {
    this.params = { ...DEFAULT_TRACKER_PARAMS, ...params };
    this.line = line;
    const span = line.orientation === 'vertical' ? frameSize[0] : frameSize[1];
    this.linePx = line.position * span;
    this.margin = line.hysteresis * span;
  }

  /** Posición de la línea en píxeles del cuadro (para dibujarla). */
  get linePosition(): number {
    return this.linePx;
  }

  side(box: Box): number {
    const center =
      this.line.orientation === 'vertical' ? (box[0] + box[2]) / 2 : (box[1] + box[3]) / 2;
    const offset = center - this.linePx;
    if (offset > this.margin) return 1;
    if (offset < -this.margin) return -1;
    return 0;
  }

  private predict(track: Track, frame: number, shift: Shift): Box {
    const steps = frame - track.lastFrame;
    const dx = track.vx * steps + shift[0];
    const dy = track.vy * steps + shift[1];
    const b = track.box;
    return [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy, b[4]];
  }

  private associate(
    tracks: Track[],
    boxes: Box[],
    predicted: Map<number, Box>,
    minAffinity: number,
  ): { matches: [Track, Box][]; restTracks: Track[]; restBoxes: Box[] } {
    const candidates: [number, number, number][] = [];
    tracks.forEach((track, ti) => {
      boxes.forEach((box, di) => {
        const a = affinity(predicted.get(track.id)!, box, this.params.maxCenterDistance);
        if (a >= minAffinity) candidates.push([a, ti, di]);
      });
    });
    candidates.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
    const usedT = new Set<number>();
    const usedD = new Set<number>();
    const matches: [Track, Box][] = [];
    for (const [, ti, di] of candidates) {
      if (usedT.has(ti) || usedD.has(di)) continue;
      usedT.add(ti);
      usedD.add(di);
      matches.push([tracks[ti]!, boxes[di]!]);
    }
    return {
      matches,
      restTracks: tracks.filter((_, i) => !usedT.has(i)),
      restBoxes: boxes.filter((_, i) => !usedD.has(i)),
    };
  }

  private apply(track: Track, box: Box, frame: number, shift: Shift): void {
    const steps = Math.max(frame - track.lastFrame, 1);
    const old = track.box;
    const mvx = ((box[0] + box[2] - (old[0] + old[2])) / 2 - shift[0]) / steps;
    const mvy = ((box[1] + box[3] - (old[1] + old[3])) / 2 - shift[1]) / steps;
    const s = this.params.velocitySmoothing;
    if (track.hits === 1) {
      track.vx = mvx;
      track.vy = mvy;
    } else {
      track.vx = s * mvx + (1 - s) * track.vx;
      track.vy = s * mvy + (1 - s) * track.vy;
    }
    track.box = box;
    track.hits += 1;
    track.lost = 0;
    track.lastFrame = frame;
    track.scoreSum += box[4];
    const side = this.side(box);
    if (side !== 0 && track.side !== 0 && side !== track.side) track.pending.push([frame, side]);
    if (side !== 0) track.side = side;
    if (!track.confirmed && track.hits >= this.params.minHits) track.confirmed = true;
    if (track.confirmed && track.pending.length > 0) {
      for (const [eventFrame, direction] of track.pending) {
        this.events.push({ trackId: track.id, frame: eventFrame, direction: direction as 1 | -1 });
      }
      track.pending = [];
    }
  }

  update(frame: number, boxes: readonly Box[], shift: Shift = [0, 0]): void {
    const p = this.params;
    const high = boxes.filter((b) => b[4] >= p.highThreshold);
    const low = boxes.filter((b) => b[4] >= p.lowThreshold && b[4] < p.highThreshold);
    const predicted = new Map(this.tracks.map((t) => [t.id, this.predict(t, frame, shift)]));

    const first = this.associate(this.tracks, high, predicted, p.minAffinityHigh);
    const second = this.associate(first.restTracks, low, predicted, p.minAffinityLow);
    for (const [track, box] of [...first.matches, ...second.matches]) {
      this.apply(track, box, frame, shift);
    }
    const survivors: Track[] = [...first.matches, ...second.matches].map(([t]) => t);
    for (const track of second.restTracks) {
      track.lost += 1;
      const b = track.box;
      track.box = [b[0] + shift[0], b[1] + shift[1], b[2] + shift[0], b[3] + shift[1], b[4]];
      (track.lost > p.maxLost ? this.removed : survivors).push(track);
    }
    for (const box of first.restBoxes) {
      if (box[4] >= p.newTrackThreshold) {
        survivors.push({
          id: this.nextId++,
          box,
          firstFrame: frame,
          lastFrame: frame,
          side: this.side(box),
          scoreSum: box[4],
          confirmed: p.minHits <= 1,
          vx: 0,
          vy: 0,
          hits: 1,
          lost: 0,
          pending: [],
        });
      }
    }
    this.tracks = survivors.sort((a, b) => a.id - b.id);
  }

  get positiveCrossings(): number {
    return this.events.filter((e) => e.direction > 0).length;
  }

  get negativeCrossings(): number {
    return this.events.filter((e) => e.direction < 0).length;
  }

  /** Conteo neto: |cruces(+) − cruces(−)|. */
  get netCount(): number {
    return Math.abs(this.positiveCrossings - this.negativeCrossings);
  }

  confirmedTracks(): Track[] {
    return [...this.tracks, ...this.removed].filter((t) => t.confirmed).sort((a, b) => a.id - b.id);
  }
}

export interface ScanCountSummary {
  netCount: number;
  positiveCrossings: number;
  negativeCrossings: number;
  maxSimultaneous: number;
  confirmedTracks: number;
  frames: number;
}

export function countScan(
  frames: readonly (readonly Box[])[],
  frameSize: readonly [number, number],
  line: LineSpec = DEFAULT_LINE,
  shifts: readonly Shift[] | null = null,
  params: Partial<TrackerParams> = {},
): ScanCountSummary {
  const tracker = new ByteTracker(frameSize, params, line);
  frames.forEach((boxes, i) => tracker.update(i, boxes, shifts ? shifts[i]! : [0, 0]));
  return {
    netCount: tracker.netCount,
    positiveCrossings: tracker.positiveCrossings,
    negativeCrossings: tracker.negativeCrossings,
    maxSimultaneous: Math.max(0, ...frames.map((f) => f.length)),
    confirmedTracks: tracker.confirmedTracks().length,
    frames: frames.length,
  };
}
