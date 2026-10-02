/**
 * Puerto de visión computacional. El dominio depende de esta abstracción, nunca de una
 * librería o servicio concreto: el adapter puede ser el servicio Python propio, un proveedor
 * externo o un modelo simulado para desarrollo.
 */
export interface ImageInput {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  /** Datos conocidos solo por fuentes simuladas (p. ej. conteo real de una escena sintética). */
  hints?: { syntheticGroundTruth?: number };
}

export interface ModelRef {
  code: string;
  version: string;
  simulated: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageAnalysis {
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
  contrast: number;
  dhash: string;
  qualityScore: number;
  issues: string[];
  exif: {
    capturedAt: string | null;
    latitude: number | null;
    longitude: number | null;
    cameraModel: string | null;
  };
  model: ModelRef;
}

export interface AnimalCount {
  count: number;
  confidence: number;
  clusteredComponents: number;
  detections: (BoundingBox & { estimatedAnimals: number; label: string; score?: number | null })[];
  /** Pasadas de inferencia (1 = imagen completa; más = mosaico). */
  inferencePasses?: number;
  /** Umbral de confianza aplicado a las detecciones. */
  scoreThreshold?: number | null;
  image: ImageAnalysis;
  model: ModelRef;
  processingMs: number;
}

export interface ObjectDetection {
  detections: (BoundingBox & { label: string; score: number })[];
  model: ModelRef;
}

export interface ChangeDetection {
  changedFraction: number;
  regions: BoundingBox[];
  model: ModelRef;
}

/** Cuadros de un escaneo de bovinos (en orden) para el conteo oficial. */
export interface ScanFramesInput {
  frames: { bytes: Buffer; index: number }[];
  keyFrames: { bytes: Buffer; index: number }[];
  mode: 'FIXED' | 'SWEEP';
  line: { orientation: 'vertical' | 'horizontal'; position: number };
}

export interface ScanBox extends BoundingBox {
  score: number;
  label: string;
}

export interface ScanProcessing {
  netCount: number;
  positiveCrossings: number;
  negativeCrossings: number;
  maxSimultaneous: number;
  confirmedTracks: number;
  confidence: number;
  framesProcessed: number;
  width: number;
  height: number;
  cameraPanPx: number | null;
  blurryFrames: number;
  tracks: {
    id: number;
    firstFrame: number;
    lastFrame: number;
    hits: number;
    netCrossings: number;
    meanScore: number;
  }[];
  crossings: { trackId: number; frame: number; direction: number }[];
  frames: {
    index: number;
    detections: ScanBox[];
    sharpness: number;
    cameraShift: [number, number] | null;
  }[];
  keyFrames: { index: number; detections: ScanBox[] }[];
  warnings: string[];
  limitations: string[];
  scoreThreshold: number;
  tracker: string;
  model: ModelRef;
  processingMs: number;
}

export interface CallContext {
  requestId?: string;
}

export abstract class ComputerVisionProvider {
  abstract readonly name: string;
  abstract readonly simulated: boolean;
  abstract analyzeImage(image: ImageInput, context?: CallContext): Promise<ImageAnalysis>;
  abstract countAnimals(
    image: ImageInput,
    options: { species: 'bovine' },
    context?: CallContext,
  ): Promise<AnimalCount>;
  abstract detectObjects(image: ImageInput, context?: CallContext): Promise<ObjectDetection>;
  abstract detectChanges(
    before: ImageInput,
    after: ImageInput,
    context?: CallContext,
  ): Promise<ChangeDetection>;
  /** Conteo oficial de un escaneo: detección + seguimiento + conteo neto por línea. */
  abstract processScan(input: ScanFramesInput, context?: CallContext): Promise<ScanProcessing>;
  abstract health(): Promise<{ ok: boolean; detail?: string }>;
}
