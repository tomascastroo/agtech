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

  async health() {
    return { ok: true, detail: 'Proveedor simulado' };
  }
}
