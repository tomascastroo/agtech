/**
 * Motor de una sesión de escaneo en el celular:
 *   cámara → (cada cuadro disponible) YOLOX en el dispositivo → tracker → conteo neto PRELIMINAR
 *   cámara → (a tasa fija) cuadro muestreado JPEG 640 px + SHA-256 → IndexedDB
 *   cámara → (cada 5 s) cuadro representativo JPEG 1280 px → IndexedDB
 * Nada depende de la red: con o sin señal el escaneo continúa y queda guardado en el teléfono.
 * No se guarda el video completo.
 */
import type { OrtYoloxDetector } from './detector';
import { prefersWasm, SCANNER_MODEL } from './detector';
import { GpsTracker, HeadingTracker, keepScreenOn } from './sensors';
import {
  activeScans,
  compactFrames,
  putFrame,
  saveScan,
  sha256Hex,
  type DeviceResult,
  type FrameKind,
  type LocalScan,
  type ScanMode,
} from './store';
import { ByteTracker, DEFAULT_LINE, TRACKER_VERSION, type Box, type LineSpec } from './tracker';

export const SAMPLE_FPS = 6;
export const SAMPLE_WIDTH = 640;
export const KEY_WIDTH = 1280;
export const KEY_EVERY_MS = 5_000;
export const MAX_KEY_FRAMES = 12;
export const MAX_DURATION_S = 180;
/**
 * Cuadros que pueden estar codificándose/guardándose a la vez. Si el teléfono no da abasto
 * (iOS escribe lento en IndexedDB) se saltea el cuadro en lugar de acumular imágenes en
 * memoria hasta que el sistema cierre la página.
 */
export const MAX_PENDING_WRITES = 4;
/** Cada cuánto se actualiza el escaneo en curso en el teléfono (para recuperarlo si se corta). */
export const CHECKPOINT_EVERY_MS = 10_000;
/**
 * Tope de inferencias por segundo en iPhone: deja respirar a la CPU y al recolector de memoria
 * (el muestreo de cuadros para el servidor sigue a 6/s igual).
 */
export const LOW_MEMORY_MAX_INFERENCE_FPS = 4;
/** Giro más rápido que esto pierde animales en el barrido. */
export const FAST_TURN_DEG_S = 45;

export interface LiveState {
  elapsedS: number;
  netCount: number;
  newLast10s: number;
  visible: number;
  boxes: Box[];
  tracks: { id: number; box: Box; confirmed: boolean }[];
  linePx: number;
  inferenceFps: number;
  samples: number;
  sweptDeg: number | null;
  turnRate: number;
  warning: string | null;
}

export class ScanSessionEngine {
  readonly id = crypto.randomUUID();
  readonly startedAt = new Date();
  readonly line: LineSpec;
  private readonly tracker: ByteTracker;
  private readonly gps = new GpsTracker();
  private readonly heading = new HeadingTracker();
  private readonly sampleCanvas: HTMLCanvasElement;
  private readonly keyCanvas: HTMLCanvasElement;
  private frameIndex = 0;
  private samples = 0;
  private keyFrames = 0;
  private lastKeyAt = 0;
  private sampleTimer: number | null = null;
  private stopped = false;
  private busy = false;
  private detections = 0;
  private detectionStart = performance.now();
  private maxVisible = 0;
  private lastBoxes: Box[] = [];
  private crossingTimes: number[] = [];
  private readonly pendingWrites = new Set<Promise<void>>();
  private skippedFrames = 0;
  private checkpointTimer: number | null = null;
  private releaseWakeLock: () => void = () => undefined;
  private readonly warnings = new Set<string>();
  private readonly startMs = performance.now();
  private readonly minDetectionGapMs = prefersWasm() ? 1000 / LOW_MEMORY_MAX_INFERENCE_FPS : 0;
  private lastDetectionAt = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly detector: OrtYoloxDetector,
    readonly mode: ScanMode,
    private readonly request: { id: string; assetName: string },
    private readonly onUpdate: (state: LiveState) => void,
  ) {
    this.line = { ...DEFAULT_LINE, orientation: 'vertical', position: 0.5 };
    this.tracker = new ByteTracker([video.videoWidth, video.videoHeight], {}, this.line);
    const scale = Math.min(1, SAMPLE_WIDTH / video.videoWidth);
    this.sampleCanvas = Object.assign(document.createElement('canvas'), {
      width: Math.round(video.videoWidth * scale),
      height: Math.round(video.videoHeight * scale),
    });
    const keyScale = Math.min(1, KEY_WIDTH / video.videoWidth);
    this.keyCanvas = Object.assign(document.createElement('canvas'), {
      width: Math.round(video.videoWidth * keyScale),
      height: Math.round(video.videoHeight * keyScale),
    });
  }

  async start(): Promise<void> {
    this.gps.begin();
    this.heading.begin();
    this.releaseWakeLock = await keepScreenOn();
    activeScans.add(this.id);
    await saveScan(this.snapshot('RECORDING', null));
    this.sampleTimer = window.setInterval(() => this.sample(), 1000 / SAMPLE_FPS);
    // Si la página se cierra o el sistema la mata, el escaneo queda recuperable con lo último.
    this.checkpointTimer = window.setInterval(
      () => void saveScan(this.snapshot('RECORDING', this.deviceResult())).catch(() => undefined),
      CHECKPOINT_EVERY_MS,
    );
    this.scheduleDetection();
  }

  private elapsedMs() {
    return performance.now() - this.startMs;
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
    const sinceLast = performance.now() - this.lastDetectionAt;
    if (!this.busy && this.video.readyState >= 2 && sinceLast >= this.minDetectionGapMs) {
      this.busy = true;
      this.lastDetectionAt = performance.now();
      try {
        const boxes = await this.detector.detect(
          this.video,
          this.video.videoWidth,
          this.video.videoHeight,
        );
        const before = this.tracker.netCount;
        this.tracker.update(this.frameIndex++, boxes);
        this.detections += 1;
        this.lastBoxes = boxes;
        this.maxVisible = Math.max(this.maxVisible, boxes.length);
        const delta = this.tracker.netCount - before;
        const now = performance.now();
        for (let i = 0; i < Math.max(0, delta); i++) this.crossingTimes.push(now);
        this.publish();
      } catch (error) {
        this.warnings.add(`Error de detección en el dispositivo: ${(error as Error).message}`);
      } finally {
        this.busy = false;
      }
    }
    if (this.elapsedMs() / 1000 >= MAX_DURATION_S)
      this.warnings.add('Se alcanzó la duración máxima del escaneo');
    this.scheduleDetection();
  }

  private currentWarning(): string | null {
    if (this.mode === 'SWEEP' && this.heading.turnRate > FAST_TURN_DEG_S)
      return 'Girá más despacio';
    if (this.mode === 'SWEEP' && this.gps.maxDisplacementM > 15)
      return 'Quedate quieto: el barrido se hace desde un punto';
    if (this.mode === 'FIXED' && this.heading.turnRate > 20) return 'Mantené el celular quieto';
    return null;
  }

  private publish() {
    const now = performance.now();
    this.crossingTimes = this.crossingTimes.filter((t) => now - t <= 10_000);
    const warning = this.currentWarning();
    if (warning === 'Girá más despacio') this.warnings.add('Hubo tramos de giro demasiado rápido');
    this.onUpdate({
      elapsedS: this.elapsedMs() / 1000,
      netCount: this.tracker.netCount,
      newLast10s: this.crossingTimes.length,
      visible: this.lastBoxes.length,
      boxes: this.lastBoxes,
      tracks: this.tracker.tracks
        .filter((t) => t.lost === 0)
        .map((t) => ({ id: t.id, box: t.box, confirmed: t.confirmed })),
      linePx: this.tracker.linePosition,
      inferenceFps: this.detections / Math.max(0.001, (now - this.detectionStart) / 1000),
      samples: this.samples,
      sweptDeg: this.heading.sweptDeg,
      turnRate: this.heading.turnRate,
      warning,
    });
  }

  private sample() {
    if (this.stopped || this.video.readyState < 2) return;
    if (this.samples >= MAX_DURATION_S * SAMPLE_FPS) return;
    const capturedMs = Math.round(this.elapsedMs());
    if (this.pendingWrites.size >= MAX_PENDING_WRITES) {
      this.skippedFrames += 1;
      return;
    }
    this.capture('SAMPLE', this.samples++, this.sampleCanvas, 0.75, capturedMs);
    if (
      this.keyFrames < MAX_KEY_FRAMES &&
      capturedMs - this.lastKeyAt >= KEY_EVERY_MS &&
      this.pendingWrites.size < MAX_PENDING_WRITES
    ) {
      this.lastKeyAt = capturedMs;
      this.capture('KEY', this.keyFrames++, this.keyCanvas, 0.85, capturedMs);
    }
  }

  private capture(
    kind: FrameKind,
    index: number,
    canvas: HTMLCanvasElement,
    quality: number,
    capturedMs: number,
  ) {
    canvas.getContext('2d')!.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    const write = new Promise<void>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve();
          void sha256Hex(blob)
            .then((sha256) => putFrame({ scanId: this.id, kind, index, capturedMs, sha256, blob }))
            .catch(() => this.warnings.add('No se pudo guardar un cuadro en el teléfono'))
            .finally(resolve);
        },
        'image/jpeg',
        quality,
      );
    });
    this.pendingWrites.add(write);
    void write.then(() => this.pendingWrites.delete(write));
  }

  /** Termina el escaneo: guarda todo en el teléfono, listo para sincronizar. */
  async finish(): Promise<LocalScan> {
    this.stopped = true;
    if (this.sampleTimer !== null) window.clearInterval(this.sampleTimer);
    if (this.checkpointTimer !== null) window.clearInterval(this.checkpointTimer);
    await Promise.all([...this.pendingWrites]);
    const stored = await compactFrames(this.id);
    this.samples = stored.samples;
    this.keyFrames = stored.keys;
    if (this.skippedFrames > 0)
      this.warnings.add(
        `Se omitieron ${this.skippedFrames} cuadros porque el teléfono no llegaba a guardarlos`,
      );
    this.gps.end();
    this.heading.end();
    this.releaseWakeLock();
    if (!this.gps.start) this.warnings.add('Sin ubicación GPS durante el escaneo');
    if (this.mode === 'SWEEP' && this.heading.sweptDeg === null) {
      this.warnings.add('Sin brújula/giroscopio: no se midió el arco barrido');
    }
    const scan = this.snapshot('PENDING_SYNC', this.deviceResult());
    await saveScan(scan);
    activeScans.delete(this.id);
    return scan;
  }

  private deviceResult(): DeviceResult {
    const elapsedS = this.elapsedMs() / 1000;
    return {
      netCount: this.tracker.netCount,
      positiveCrossings: this.tracker.positiveCrossings,
      negativeCrossings: this.tracker.negativeCrossings,
      confirmedTracks: this.tracker.confirmedTracks().length,
      maxSimultaneous: this.maxVisible,
      detectionFrames: this.detections,
      inferenceFps: Math.round((this.detections / Math.max(elapsedS, 0.001)) * 10) / 10,
      backend: this.detector.backend,
      model: `${SCANNER_MODEL.name}@${SCANNER_MODEL.version}`,
      tracker: TRACKER_VERSION,
      preliminary: true,
    };
  }

  get limitReached(): boolean {
    return this.elapsedMs() / 1000 >= MAX_DURATION_S;
  }

  private snapshot(state: LocalScan['state'], deviceResult: DeviceResult | null): LocalScan {
    const elapsedS = this.elapsedMs() / 1000;
    return {
      id: this.id,
      requestId: this.request.id,
      assetName: this.request.assetName,
      mode: this.mode,
      startedAt: this.startedAt.toISOString(),
      endedAt: state === 'RECORDING' ? null : new Date().toISOString(),
      durationS: Math.round(elapsedS * 100) / 100,
      sampledFps: SAMPLE_FPS,
      frameWidth: this.sampleCanvas.width,
      frameHeight: this.sampleCanvas.height,
      line: { orientation: this.line.orientation, position: this.line.position },
      location: this.gps.start,
      locationEnd: this.gps.last,
      maxDisplacementM: this.gps.start ? Math.round(this.gps.maxDisplacementM * 10) / 10 : null,
      heading:
        this.mode === 'SWEEP'
          ? {
              startDeg: this.heading.startDeg,
              sweptDeg: this.heading.sweptDeg,
              source: this.heading.source,
            }
          : null,
      device: {
        userAgent: navigator.userAgent.slice(0, 200),
        backend: this.detector.backend,
        model: SCANNER_MODEL.name,
        videoWidth: this.video.videoWidth,
        videoHeight: this.video.videoHeight,
      },
      deviceResult,
      warnings: [...this.warnings],
      frameCount: this.samples,
      keyFrameCount: this.keyFrames,
      uploaded: 0,
      state,
      official: null,
      error: null,
      updatedAt: new Date().toISOString(),
    };
  }
}
