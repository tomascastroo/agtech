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
  detections: (BoundingBox & { estimatedAnimals: number; label: string })[];
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
  abstract health(): Promise<{ ok: boolean; detail?: string }>;
}
