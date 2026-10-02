/**
 * "Analizar foto": el productor toma una o varias fotos del mismo grupo con la cámara del
 * celular. Cada foto se analiza en el teléfono (YOLOX, cajas y conteo PRELIMINAR) y se guarda con
 * fecha/hora, GPS si hay y SHA-256 en IndexedDB, con o sin señal. Se sincroniza como una sesión del
 * escáner en modo PHOTO; el conteo oficial (animales únicos entre fotos que se solapan) lo calcula
 * el servidor.
 *
 * Varias fotos: en el teléfono no se registran entre sí, así que el preliminar es el MÁXIMO por
 * foto (no la suma), para no contar dos veces los mismos animales.
 */
import type { OrtYoloxDetector } from './detector';
import { SCANNER_MODEL } from './detector';
import { GpsTracker } from './sensors';
import {
  activeScans,
  putFrame,
  saveScan,
  sha256Hex,
  type DeviceResult,
  type LocalScan,
} from './store';
import { DEFAULT_LINE, TRACKER_VERSION, type Box } from './tracker';

export const PHOTO_WIDTH = 1280;
export const PHOTO_QUALITY = 0.85;
/** Igual que el límite del servidor (SCAN_LIMITS.maxPhotos). */
export const MAX_PHOTOS = 12;

export interface PhotoShot {
  index: number;
  capturedMs: number;
  count: number;
  boxes: Box[];
  width: number;
  height: number;
  previewUrl: string;
}

/** Estimación conservadora entre fotos sin registrar: el máximo por foto, nunca la suma. */
export function preliminaryPhotoCount(counts: readonly number[]): number {
  return counts.length ? Math.max(...counts) : 0;
}

export class PhotoSessionEngine {
  readonly id = crypto.randomUUID();
  readonly startedAt = new Date();
  private readonly startMs = performance.now();
  private readonly gps = new GpsTracker();
  private readonly canvas: HTMLCanvasElement;
  readonly shots: PhotoShot[] = [];
  private readonly warnings = new Set<string>();

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly detector: OrtYoloxDetector,
    private readonly request: { id: string; assetName: string },
  ) {
    const scale = Math.min(1, PHOTO_WIDTH / video.videoWidth);
    this.canvas = Object.assign(document.createElement('canvas'), {
      width: Math.round(video.videoWidth * scale),
      height: Math.round(video.videoHeight * scale),
    });
  }

  async start(): Promise<void> {
    this.gps.begin();
    activeScans.add(this.id);
    await saveScan(this.snapshot('RECORDING'));
  }

  get full(): boolean {
    return this.shots.length >= MAX_PHOTOS;
  }

  /** Toma la foto del cuadro actual, la analiza en el teléfono y la guarda. */
  async capture(): Promise<PhotoShot> {
    if (this.full) throw new Error(`Máximo ${MAX_PHOTOS} fotos por análisis`);
    const { width, height } = this.canvas;
    this.canvas.getContext('2d')!.drawImage(this.video, 0, 0, width, height);
    const capturedMs = Math.round(performance.now() - this.startMs);
    const [boxes, blob] = await Promise.all([
      this.detector.detect(this.canvas, width, height),
      new Promise<Blob | null>((resolve) =>
        this.canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY),
      ),
    ]);
    if (!blob) throw new Error('No se pudo guardar la foto');
    const sha256 = await sha256Hex(blob);
    const index = this.shots.length;
    // La misma imagen es el cuadro a contar (SAMPLE) y el representativo que ve el banco (KEY).
    await putFrame({ scanId: this.id, kind: 'SAMPLE', index, capturedMs, sha256, blob });
    await putFrame({ scanId: this.id, kind: 'KEY', index, capturedMs, sha256, blob });
    const confirmed = boxes.filter((b) => b[4] >= 0.4);
    const shot: PhotoShot = {
      index,
      capturedMs,
      count: confirmed.length,
      boxes: confirmed,
      width,
      height,
      previewUrl: URL.createObjectURL(blob),
    };
    this.shots.push(shot);
    await saveScan(this.snapshot('RECORDING'));
    return shot;
  }

  async finish(): Promise<LocalScan> {
    this.gps.end();
    if (!this.gps.start) this.warnings.add('Sin ubicación GPS al tomar las fotos');
    if (this.shots.length > 1)
      this.warnings.add(
        'Varias fotos: el servidor solo suma zonas de fotos que se solapan entre sí',
      );
    const scan = this.snapshot('PENDING_SYNC');
    await saveScan(scan);
    activeScans.delete(this.id);
    for (const s of this.shots) URL.revokeObjectURL(s.previewUrl);
    return scan;
  }

  private deviceResult(): DeviceResult {
    const observed = preliminaryPhotoCount(this.shots.map((s) => s.count));
    return {
      netCount: observed,
      observed,
      photos: this.shots.length,
      positiveCrossings: 0,
      negativeCrossings: 0,
      confirmedTracks: 0,
      maxSimultaneous: observed,
      detectionFrames: this.shots.length,
      inferenceFps: 0,
      backend: this.detector.backend,
      model: `${SCANNER_MODEL.name}@${SCANNER_MODEL.version}`,
      tracker: `${TRACKER_VERSION}+photo-max`,
      preliminary: true,
    };
  }

  private snapshot(state: LocalScan['state']): LocalScan {
    const durationS = (performance.now() - this.startMs) / 1000;
    return {
      id: this.id,
      requestId: this.request.id,
      assetName: this.request.assetName,
      mode: 'PHOTO',
      startedAt: this.startedAt.toISOString(),
      endedAt: state === 'RECORDING' ? null : new Date().toISOString(),
      durationS: Math.round(durationS * 100) / 100,
      sampledFps: 0,
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
      },
      deviceResult: this.shots.length ? this.deviceResult() : null,
      warnings: [...this.warnings],
      frameCount: this.shots.length,
      keyFrameCount: this.shots.length,
      uploaded: 0,
      state,
      official: null,
      error: null,
      updatedAt: new Date().toISOString(),
    };
  }
}
