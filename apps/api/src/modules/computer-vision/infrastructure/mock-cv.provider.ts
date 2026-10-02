import { Injectable } from '@nestjs/common';
import { sha256Hex } from '../../../common/crypto/hashing.js';
import {
  ComputerVisionProvider,
  type AnimalCount,
  type ChangeDetection,
  type ImageAnalysis,
  type ImageInput,
  type ModelRef,
  type ObjectDetection,
  type ScanFramesInput,
  type ScanProcessing,
} from '../domain/computer-vision.provider.js';

const MODEL: ModelRef = { code: 'mock-cv', version: '0.1.0', simulated: true };

/**
 * Proveedor SIMULADO para desarrollo sin servicio de IA y para tests. No analiza píxeles:
 * devuelve resultados determinísticos derivados del hash de la imagen o, si la fuente es
 * sintética, del conteo real conocido de la escena. Todos sus resultados quedan marcados
 * como simulados. La configuración impide usarlo en producción.
 */
@Injectable()
export class MockComputerVisionProvider extends ComputerVisionProvider {
  readonly name = 'mock';
  readonly simulated = true;

  async analyzeImage(image: ImageInput): Promise<ImageAnalysis> {
    const hash = sha256Hex(image.bytes);
    return {
      width: 1280,
      height: 800,
      sharpness: 400,
      brightness: 120,
      contrast: 40,
      dhash: hash.slice(0, 16),
      qualityScore: 0.87,
      issues: [],
      exif: { capturedAt: null, latitude: null, longitude: null, cameraModel: null },
      model: MODEL,
    };
  }

  async countAnimals(image: ImageInput): Promise<AnimalCount> {
    const hash = sha256Hex(image.bytes);
    const count = image.hints?.syntheticGroundTruth ?? 40 + (parseInt(hash.slice(0, 6), 16) % 200);
    return {
      count,
      confidence: 0.86,
      clusteredComponents: 0,
      detections: [],
      image: await this.analyzeImage(image),
      model: MODEL,
      processingMs: 1,
    };
  }

  async detectObjects(): Promise<ObjectDetection> {
    return { detections: [], model: MODEL };
  }

  async detectChanges(before: ImageInput, after: ImageInput): Promise<ChangeDetection> {
    const same = sha256Hex(before.bytes) === sha256Hex(after.bytes);
    return { changedFraction: same ? 0 : 0.05, regions: [], model: MODEL };
  }

  /**
   * Escaneo SIMULADO: no mira los cuadros. Devuelve un conteo determinístico derivado de los
   * hashes de los cuadros (independiente del conteo del celular), marcado como simulado.
   */
  async processScan(input: ScanFramesInput): Promise<ScanProcessing> {
    const digest = sha256Hex(Buffer.concat(input.frames.map((f) => f.bytes)));
    const count = 5 + (parseInt(digest.slice(0, 6), 16) % 20);
    return {
      netCount: count,
      positiveCrossings: count,
      negativeCrossings: 0,
      maxSimultaneous: Math.min(count, 6),
      confirmedTracks: count,
      confidence: 0.8,
      framesProcessed: input.frames.length,
      width: 640,
      height: 360,
      cameraPanPx: input.mode === 'SWEEP' ? 0 : null,
      blurryFrames: 0,
      tracks: [],
      crossings: [],
      frames: input.frames.map((f) => ({
        index: f.index,
        detections: [],
        sharpness: 400,
        cameraShift: null,
      })),
      keyFrames: input.keyFrames.map((f) => ({ index: f.index, detections: [] })),
      warnings: [],
      limitations: [
        'Resultado SIMULADO (proveedor de visión de desarrollo): no analiza los cuadros.',
      ],
      scoreThreshold: 0.15,
      tracker: 'mock-tracker/0.1.0',
      model: MODEL,
      processingMs: 1,
    };
  }

  async health() {
    return { ok: true, detail: 'Proveedor simulado' };
  }
}
