/**
 * Manga + RFID en el celular: registro INDIVIDUAL de bovinos.
 *
 *   cámara → YOLOX (detecta) → ByteTrack (sigue) → estado de la escena en vivo
 *   cámara → (8/s) cuadro JPEG 640 px en un búfer circular de ~3,5 s (en memoria, no se guarda)
 *   lector RFID → lectura → se esperan los cuadros posteriores (ventana) → se guardan SOLO los
 *   cuadros de la ventana + la captura (lecturas, índices, decisión PRELIMINAR) en IndexedDB
 *
 * La identidad la da la caravana; la cámara solo indica si había UN bovino estable en la zona de
 * captura al momento de la lectura. No hay reconocimiento visual. Ante la duda no se asocia. El
 * resultado del celular es preliminar: el servidor re-detecta, re-sigue y decide (oficial).
 * Nada depende de la red. No se guarda el video completo.
 */
import {
  animalsInZone,
  applySessionRules,
  DEFAULT_CAPTURE_ZONE,
  DEFAULT_CHUTE_PARAMS,
  matchChuteCapture,
  normalizeEid,
  type CaptureZone,
  type ChuteDecision,
  type ChuteFrame,
  type ChuteStatus,
  type SessionCapture,
  type TrackedDetection,
} from './chute-matching';
import type { OrtYoloxDetector } from './detector';
import { SCANNER_MODEL } from './detector';
import type { RfidRead, RfidReader } from './rfid-reader';
import { GpsTracker, keepScreenOn } from './sensors';
import {
  activeScans,
  putFrame,
  saveScan,
  sha256Hex,
  type DeviceResult,
  type LocalChuteCapture,
  type LocalScan,
} from './store';
import { ByteTracker, DEFAULT_LINE, TRACKER_VERSION, type Box } from './tracker';

export const CHUTE_SAMPLE_FPS = 8;
export const CHUTE_SAMPLE_WIDTH = 640;
/** Igual que el servidor (SCAN_LIMITS). */
export const MAX_CAPTURES = 300;
export const MAX_FRAMES_PER_CAPTURE = 24;
/** Lo que se retiene en memoria: ventana antes + después de la lectura, con margen. */
const RING_MS = DEFAULT_CHUTE_PARAMS.windowBeforeMs + DEFAULT_CHUTE_PARAMS.windowAfterMs + 500;
/** Cuánto tiempo hacia atrás mira el estado en vivo para decidir si el animal está estable. */
const STABLE_MS = 1000;
/**
 * El celular no mide nitidez: la calidad de imagen la evalúa el servidor. El preliminar solo
 * mira la escena (cantidad de bovinos, track, movimiento, oclusión).
 */
const CLIENT_PARAMS = { minSharpness: 0, minBrightness: 0, maxBrightness: 255 };

export type ChuteLiveState =
  | 'WAITING_FOR_ANIMAL'
  | 'ANIMAL_DETECTED'
  | 'WAITING_FOR_STABLE_TRACK'
  | 'WAITING_FOR_RFID'
  | 'MULTIPLE_ANIMALS'
  | 'MATCHING'
  | ChuteStatus
  | 'FAILED';

export const CHUTE_STATE_LABELS: Record<ChuteLiveState, string> = {
  WAITING_FOR_ANIMAL: 'Esperando bovino en la manga',
  ANIMAL_DETECTED: 'Bovino detectado',
  WAITING_FOR_STABLE_TRACK: 'Esperando que el bovino quede quieto',
  WAITING_FOR_RFID: 'Bovino estable: leé la caravana',
  MULTIPLE_ANIMALS: 'Hay más de un bovino en la zona: no se puede asociar',
  MATCHING: 'Lectura recibida: asociando…',
  CONFIRMED: 'Bovino identificado (preliminar)',
  AMBIGUOUS: 'Ambiguo: no se asoció la caravana',
  INSUFFICIENT_EVIDENCE: 'No determinable: no se asoció la caravana',
  FAILED: 'Error al guardar la captura',
};

/** Motivos de la decisión (los mismos códigos que el servidor), para el operador. */
export const CHUTE_REASON_LABELS: Record<string, string> = {
  ONE_STABLE_ANIMAL: 'Un único bovino estable en la zona',
  NO_RFID: 'Sin lectura de caravana',
  INVALID_RFID: 'Lectura de caravana inválida o dudosa',
  MULTIPLE_RFID: 'Más de una caravana leída para el mismo animal',
  RFID_OUT_OF_WINDOW: 'La lectura no coincide en el tiempo con los cuadros',
  NO_ANIMAL: 'No había un bovino en la zona de captura',
  MULTIPLE_ANIMALS: 'Más de un bovino en la zona de captura',
  UNSTABLE_TRACK: 'El seguimiento del bovino no fue estable',
  ANIMAL_MOVING: 'El bovino se estaba moviendo',
  OCCLUDED: 'El bovino estaba tapado por otro',
  PARTIALLY_VISIBLE: 'El bovino no se veía completo',
  LOW_QUALITY: 'Imágenes de baja calidad',
  OVERLAPPING_CAPTURES: 'Lecturas demasiado seguidas: no se sabe a qué animal corresponde cada una',
  SAME_ANIMAL_MULTIPLE_RFID: 'El mismo bovino recibió caravanas distintas',
  RFID_ALREADY_REGISTERED: 'La caravana ya se registró en esta sesión',
};

/**
 * Estado de la escena en vivo a partir de los últimos cuadros seguidos (puro, para tests).
 * Usa las mismas reglas que la asociación: zona, puntaje, track confirmado y movimiento.
 */
export function sceneState(
  recent: readonly ChuteFrame[],
  frameSize: { width: number; height: number },
  zone: CaptureZone,
): Exclude<ChuteLiveState, 'MATCHING' | ChuteStatus | 'FAILED'> {
  const last = recent[recent.length - 1];
  if (!last) return 'WAITING_FOR_ANIMAL';
  const now = animalsInZone(last, { frameSize, zone });
  if (now.length === 0) return 'WAITING_FOR_ANIMAL';
  if (now.length > 1) return 'MULTIPLE_ANIMALS';
  const current = now[0]!;
  if (!current.confirmed || current.trackId === null) return 'ANIMAL_DETECTED';
  const own = recent
    .map((f) => animalsInZone(f, { frameSize, zone }))
    .filter((z) => z.length === 1 && z[0]!.trackId === current.trackId && z[0]!.confirmed)
    .map((z) => z[0]!);
  if (own.length < Math.max(3, recent.length * DEFAULT_CHUTE_PARAMS.minPresence))
    return 'WAITING_FOR_STABLE_TRACK';
  const cx = own.map((d) => d.x + d.width / 2);
  const cy = own.map((d) => d.y + d.height / 2);
  const size = Math.max(...own.map((d) => Math.max(d.width, d.height)), 1);
  const movement =
    Math.hypot(Math.max(...cx) - Math.min(...cx), Math.max(...cy) - Math.min(...cy)) / size;
  return movement > DEFAULT_CHUTE_PARAMS.maxMovement
    ? 'WAITING_FOR_STABLE_TRACK'
    : 'WAITING_FOR_RFID';
}

/** Elige hasta `max` cuadros repartidos de forma pareja (el servidor acepta 24 por captura). */
export function spread<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  return Array.from(
    { length: max },
    (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]!,
  );
}

export interface ChuteLive {
  state: ChuteLiveState;
  label: string;
  inZone: number;
  tracks: { id: number; box: Box; confirmed: boolean }[];
  zone: CaptureZone;
  captures: number;
  confirmed: number;
  last: {
    sequence: number;
    status: ChuteStatus;
    reason: string;
    electronicId: string | null;
    frames: number;
    simulated: boolean;
    capturedAt: string;
  } | null;
  elapsedS: number;
  inferenceFps: number;
  readerLabel: string;
}

interface RingFrame {
  capturedMs: number;
  blob: Promise<Blob | null>;
  frame: ChuteFrame;
}

export class ChuteSessionEngine {
  readonly id = crypto.randomUUID();
  readonly startedAt = new Date();
  readonly zone: CaptureZone = DEFAULT_CAPTURE_ZONE;
  readonly captures: LocalChuteCapture[] = [];
  private readonly startMs = performance.now();
  private readonly tracker: ByteTracker;
  private readonly gps = new GpsTracker();
  private readonly canvas: HTMLCanvasElement;
  private readonly scale: number;
  private readonly warnings = new Set<string>();
  private readonly decisions = new Map<string, SessionCapture>();
  private ring: RingFrame[] = [];
  private recent: ChuteFrame[] = [];
  private samples = 0;
  private frameIndex = 0;
  private detections = 0;
  private busy = false;
  private stopped = false;
  private sampleTimer: number | null = null;
  private pending: { reads: RfidRead[]; timer: number; closing: Promise<void> | null } | null =
    null;
  private last: ChuteLive['last'] = null;
  private failed = false;
  private releaseWakeLock: () => void = () => undefined;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly detector: OrtYoloxDetector,
    private readonly request: { id: string; assetName: string },
    readonly reader: RfidReader,
    private readonly onUpdate: (live: ChuteLive) => void,
  ) {
    this.tracker = new ByteTracker([video.videoWidth, video.videoHeight], {}, DEFAULT_LINE);
    this.scale = Math.min(1, CHUTE_SAMPLE_WIDTH / video.videoWidth);
    this.canvas = Object.assign(document.createElement('canvas'), {
      width: Math.round(video.videoWidth * this.scale),
      height: Math.round(video.videoHeight * this.scale),
    });
  }

  private get frameSize() {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  private elapsedMs() {
    return performance.now() - this.startMs;
  }

  async start(): Promise<void> {
    this.gps.begin();
    this.releaseWakeLock = await keepScreenOn();
    activeScans.add(this.id);
    await saveScan(this.snapshot('RECORDING'));
    await this.reader.start((read) => this.onRead(read));
    this.sampleTimer = window.setInterval(() => this.sample(), 1000 / CHUTE_SAMPLE_FPS);
    this.scheduleDetection();
  }

  private scheduleDetection() {
    if (this.stopped) return;
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof v.requestVideoFrameCallback === 'function')
      v.requestVideoFrameCallback(() => void this.detect());
    else requestAnimationFrame(() => void this.detect());
  }

  private async detect() {
    if (this.stopped) return;
    if (!this.busy && this.video.readyState >= 2) {
      this.busy = true;
      try {
        const boxes = await this.detector.detect(
          this.video,
          this.video.videoWidth,
          this.video.videoHeight,
        );
        this.tracker.update(this.frameIndex++, boxes);
        this.detections += 1;
        const now = this.elapsedMs();
        this.recent = [
          ...this.recent.filter((f) => now - f.capturedMs <= STABLE_MS),
          this.currentFrame(-1, Math.round(now)),
        ];
        this.publish();
      } catch (error) {
        this.warnings.add(`Error de detección en el dispositivo: ${(error as Error).message}`);
      } finally {
        this.busy = false;
      }
    }
    this.scheduleDetection();
  }

  /** Tracks vigentes, en coordenadas del cuadro guardado (640 px). */
  private currentFrame(index: number, capturedMs: number): ChuteFrame {
    const s = this.scale;
    const detections: TrackedDetection[] = this.tracker.tracks
      .filter((t) => t.lost === 0)
      .map((t) => ({
        x: t.box[0] * s,
        y: t.box[1] * s,
        width: (t.box[2] - t.box[0]) * s,
        height: (t.box[3] - t.box[1]) * s,
        score: t.box[4],
        trackId: t.id,
        confirmed: t.confirmed,
      }));
    return { index, capturedMs, detections, sharpness: 0, brightness: 128 };
  }

  private sample() {
    if (this.stopped || this.video.readyState < 2) return;
    const capturedMs = Math.round(this.elapsedMs());
    const { width, height } = this.canvas;
    this.canvas.getContext('2d')!.drawImage(this.video, 0, 0, width, height);
    const blob = new Promise<Blob | null>((resolve) =>
      this.canvas.toBlob(resolve, 'image/jpeg', 0.8),
    );
    this.ring = [
      ...this.ring.filter((r) => capturedMs - r.capturedMs <= RING_MS),
      { capturedMs, blob, frame: this.currentFrame(-1, capturedMs) },
    ];
  }

  private onRead(read: RfidRead) {
    if (this.stopped) return;
    if (this.pending) {
      // Otra lectura dentro de la ventana del mismo animal: se registra (y decide la regla).
      this.pending.reads.push(read);
      return;
    }
    if (this.captures.length >= MAX_CAPTURES) {
      this.warnings.add(`Máximo ${MAX_CAPTURES} animales por sesión: iniciá otra sesión`);
      this.publish();
      return;
    }
    const timer = window.setTimeout(
      () => void this.closeCapture(),
      DEFAULT_CHUTE_PARAMS.windowAfterMs + 150,
    );
    this.pending = { reads: [read], timer, closing: null };
    this.last = null;
    this.publish();
  }

  /** Cierra la captura en curso: guarda los cuadros de la ventana y la decisión preliminar. */
  private closeCapture(): Promise<void> {
    const pending = this.pending;
    if (!pending) return Promise.resolve();
    window.clearTimeout(pending.timer);
    pending.closing ??= this.persist(pending.reads).finally(() => {
      this.pending = null;
      this.publish();
    });
    return pending.closing;
  }

  private async persist(rawReads: RfidRead[]) {
    const reads = rawReads.map((r) => ({
      electronicId: r.electronicId,
      atMs: Math.max(0, Math.round(r.at - this.startMs)),
    }));
    const readAt = Math.min(...reads.map((r) => r.atMs));
    const inWindow = this.ring.filter(
      (r) =>
        r.capturedMs >= readAt - DEFAULT_CHUTE_PARAMS.windowBeforeMs &&
        r.capturedMs <= readAt + DEFAULT_CHUTE_PARAMS.windowAfterMs,
    );
    const frames: ChuteFrame[] = [];
    try {
      // De a un cuadro y en orden: los índices quedan consecutivos aunque falle uno.
      for (const r of spread(inWindow, MAX_FRAMES_PER_CAPTURE)) {
        const blob = await r.blob;
        if (!blob) continue;
        const sha256 = await sha256Hex(blob);
        const index = this.samples;
        await putFrame({
          scanId: this.id,
          kind: 'SAMPLE',
          index,
          capturedMs: r.capturedMs,
          sha256,
          blob,
        });
        this.samples += 1;
        frames.push({ ...r.frame, index });
      }
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      this.warnings.add(`No se pudo guardar un cuadro en el teléfono (${detail})`);
    }
    if (!frames.length) {
      // Sin cuadros no hay respaldo: la lectura no se asocia ni se envía como captura.
      this.failed = true;
      this.warnings.add(
        `Lectura ${reads.map((r) => r.electronicId).join(', ')} sin cuadros de la cámara: no se registró`,
      );
      return;
    }
    this.failed = false;
    const id = crypto.randomUUID();
    const decision = matchChuteCapture(
      {
        frameSize: this.frameSize,
        zone: this.zone,
        reads: reads.map((r) => ({ eid: normalizeEid(r.electronicId), atMs: r.atMs })),
        frames,
      },
      CLIENT_PARAMS,
    );
    const capture: LocalChuteCapture = {
      id,
      sequence: this.captures.length + 1,
      rfidSource: this.reader.source,
      readerDeviceId: this.reader.readerDeviceId,
      reads,
      frameIndices: frames.map((f) => f.index),
      clientTrackId: decision.trackId ?? dominantTrack(frames),
      preliminary: { status: decision.status, reason: decision.reason, electronicId: decision.eid },
      capturedAt: new Date(this.startedAt.getTime() + readAt).toISOString(),
      official: null,
    };
    this.captures.push(capture);
    this.decisions.set(id, {
      id,
      sequence: capture.sequence,
      readAtMs: decision.readAtMs,
      eid: decision.eid,
      clientTrackId: capture.clientTrackId,
      decision,
    });
    this.applyRules();
    await saveScan(this.snapshot('RECORDING'));
    const final = capture.preliminary;
    this.last = {
      sequence: capture.sequence,
      status: final.status,
      reason: final.reason,
      electronicId: final.status === 'CONFIRMED' ? final.electronicId : null,
      frames: frames.length,
      simulated: capture.rfidSource === 'SIMULATED',
      capturedAt: capture.capturedAt,
    };
  }

  /** Reglas entre capturas (solo bajan confirmaciones), como en el servidor. */
  private applyRules() {
    const out: Map<string, ChuteDecision> = applySessionRules([...this.decisions.values()]);
    for (const c of this.captures) {
      const d = out.get(c.id);
      if (d) c.preliminary = { status: d.status, reason: d.reason, electronicId: d.eid };
    }
  }

  /** "Registrar siguiente bovino": vuelve a esperar al próximo animal. */
  next() {
    this.last = null;
    this.failed = false;
    this.publish();
  }

  private liveState(): ChuteLiveState {
    if (this.pending) return 'MATCHING';
    if (this.last) return this.last.status;
    if (this.failed) return 'FAILED';
    return sceneState(this.recent, this.frameSize, this.zone);
  }

  private publish() {
    const state = this.liveState();
    const lastFrame = this.recent[this.recent.length - 1];
    const s = this.scale;
    this.onUpdate({
      state,
      label: CHUTE_STATE_LABELS[state],
      inZone: lastFrame
        ? animalsInZone(lastFrame, { frameSize: this.frameSize, zone: this.zone }).length
        : 0,
      tracks: (lastFrame?.detections ?? []).map((d) => ({
        id: d.trackId ?? 0,
        box: [d.x / s, d.y / s, (d.x + d.width) / s, (d.y + d.height) / s, d.score] as const,
        confirmed: d.confirmed,
      })),
      zone: this.zone,
      captures: this.captures.length,
      confirmed: this.captures.filter((c) => c.preliminary.status === 'CONFIRMED').length,
      last: this.last,
      elapsedS: this.elapsedMs() / 1000,
      inferenceFps: this.detections / Math.max(0.001, this.elapsedMs() / 1000),
      readerLabel: this.reader.label,
    });
  }

  /** Termina la sesión: cierra la captura en curso y deja todo listo para sincronizar. */
  async finish(): Promise<LocalScan> {
    if (this.pending) await this.closeCapture();
    this.stopped = true;
    if (this.sampleTimer !== null) window.clearInterval(this.sampleTimer);
    this.reader.stop();
    this.ring = [];
    this.gps.end();
    this.releaseWakeLock();
    if (!this.gps.start) this.warnings.add('Sin ubicación GPS durante la sesión');
    if (this.reader.source === 'SIMULATED')
      this.warnings.add('Lecturas RFID SIMULADAS: no es una identificación real');
    const scan = this.snapshot('PENDING_SYNC');
    await saveScan(scan);
    activeScans.delete(this.id);
    return scan;
  }

  private deviceResult(): DeviceResult {
    const confirmed = this.captures.filter((c) => c.preliminary.status === 'CONFIRMED');
    const identified = new Set(confirmed.map((c) => c.preliminary.electronicId)).size;
    const elapsedS = this.elapsedMs() / 1000;
    return {
      netCount: identified,
      observed: identified,
      positiveCrossings: 0,
      negativeCrossings: 0,
      confirmedTracks: confirmed.length,
      maxSimultaneous: 1,
      detectionFrames: this.detections,
      inferenceFps: Math.round((this.detections / Math.max(elapsedS, 0.001)) * 10) / 10,
      backend: this.detector.backend,
      model: `${SCANNER_MODEL.name}@${SCANNER_MODEL.version}`,
      tracker: `${TRACKER_VERSION}+chute`,
      preliminary: true,
    };
  }

  private snapshot(state: LocalScan['state']): LocalScan {
    const elapsedS = this.elapsedMs() / 1000;
    return {
      id: this.id,
      requestId: this.request.id,
      assetName: this.request.assetName,
      mode: 'CHUTE',
      startedAt: this.startedAt.toISOString(),
      endedAt: state === 'RECORDING' ? null : new Date().toISOString(),
      durationS: Math.round(elapsedS * 100) / 100,
      sampledFps: CHUTE_SAMPLE_FPS,
      frameWidth: this.canvas.width,
      frameHeight: this.canvas.height,
      line: { orientation: DEFAULT_LINE.orientation, position: DEFAULT_LINE.position },
      location: this.gps.start,
      locationEnd: this.gps.last,
      maxDisplacementM: this.gps.start ? Math.round(this.gps.maxDisplacementM * 10) / 10 : null,
      heading: null,
      device: {
        userAgent: navigator.userAgent.slice(0, 200),
        backend: this.detector.backend,
        model: SCANNER_MODEL.name,
        videoWidth: this.video.videoWidth,
        videoHeight: this.video.videoHeight,
        rfidReader: this.reader.label,
        rfidSource: this.reader.source,
      },
      deviceResult: this.captures.length ? this.deviceResult() : null,
      warnings: [...this.warnings],
      frameCount: this.samples,
      keyFrameCount: 0,
      captureZone: this.zone,
      captures: this.captures.map((c) => ({ ...c })),
      uploaded: 0,
      state,
      official: null,
      error: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

/** Track más frecuente en los cuadros (para la regla "mismo animal, otra caravana"). */
function dominantTrack(frames: readonly ChuteFrame[]): number | null {
  const counts = new Map<number, number>();
  for (const f of frames)
    for (const d of f.detections)
      if (d.trackId !== null && d.confirmed)
        counts.set(d.trackId, (counts.get(d.trackId) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
