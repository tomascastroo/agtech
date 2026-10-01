import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import { ExternalServiceError } from '../../../common/domain/errors.js';
import {
  ComputerVisionProvider,
  type AnimalCount,
  type CallContext,
  type ChangeDetection,
  type ImageAnalysis,
  type ImageInput,
  type ModelRef,
  type ObjectDetection,
} from '../domain/computer-vision.provider.js';

interface RemoteModel {
  code: string;
  version: string;
  simulated: boolean;
}

interface RemoteAnalysis {
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
  contrast: number;
  dhash: string;
  quality_score: number;
  issues: string[];
  exif: {
    captured_at: string | null;
    latitude: number | null;
    longitude: number | null;
    camera_model: string | null;
  };
  model: RemoteModel;
}

interface RemoteDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  estimated_animals: number;
  label: string;
}

interface RemoteCount {
  count: number;
  confidence: number;
  clustered_components: number;
  detections: RemoteDetection[];
  image: RemoteAnalysis;
  model: RemoteModel;
  processing_ms: number;
}

interface RemoteChanges {
  changed_fraction: number;
  regions: { x: number; y: number; width: number; height: number }[];
  model: RemoteModel;
}

const toModel = (m: RemoteModel): ModelRef => ({
  code: m.code,
  version: m.version,
  simulated: m.simulated,
});

const toAnalysis = (r: RemoteAnalysis): ImageAnalysis => ({
  width: r.width,
  height: r.height,
  sharpness: r.sharpness,
  brightness: r.brightness,
  contrast: r.contrast,
  dhash: r.dhash,
  qualityScore: r.quality_score,
  issues: r.issues,
  exif: {
    capturedAt: r.exif.captured_at,
    latitude: r.exif.latitude,
    longitude: r.exif.longitude,
    cameraModel: r.exif.camera_model,
  },
  model: toModel(r.model),
});

/** Adapter HTTP hacia el servicio de visión computacional (FastAPI + OpenCV). */
@Injectable()
export class AiServiceComputerVisionProvider extends ComputerVisionProvider {
  readonly name = 'ai-service';
  readonly simulated = false;
  private readonly logger = new Logger(AiServiceComputerVisionProvider.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  async analyzeImage(image: ImageInput, context?: CallContext): Promise<ImageAnalysis> {
    return toAnalysis(
      await this.post<RemoteAnalysis>('/v1/images/analyze', { file: image }, context),
    );
  }

  async countAnimals(
    image: ImageInput,
    options: { species: 'bovine' },
    context?: CallContext,
  ): Promise<AnimalCount> {
    const r = await this.post<RemoteCount>(
      `/v1/animals/count?species=${options.species}`,
      { file: image },
      context,
    );
    return {
      count: r.count,
      confidence: r.confidence,
      clusteredComponents: r.clustered_components,
      detections: r.detections.map((d) => ({
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
        estimatedAnimals: d.estimated_animals,
        label: d.label,
      })),
      image: toAnalysis(r.image),
      model: toModel(r.model),
      processingMs: r.processing_ms,
    };
  }

  async detectObjects(image: ImageInput, context?: CallContext): Promise<ObjectDetection> {
    const count = await this.countAnimals(image, { species: 'bovine' }, context);
    return {
      detections: count.detections.map((d) => ({ ...d, score: count.confidence })),
      model: count.model,
    };
  }

  async detectChanges(
    before: ImageInput,
    after: ImageInput,
    context?: CallContext,
  ): Promise<ChangeDetection> {
    const r = await this.post<RemoteChanges>('/v1/changes/detect', { before, after }, context);
    return { changedFraction: r.changed_fraction, regions: r.regions, model: toModel(r.model) };
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const response = await fetch(new URL('/health/ready', this.config.env.AI_SERVICE_URL), {
        signal: AbortSignal.timeout(3000),
      });
      return { ok: response.ok };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  private async post<T>(
    path: string,
    files: Record<string, ImageInput>,
    context?: CallContext,
  ): Promise<T> {
    const form = new FormData();
    for (const [field, image] of Object.entries(files)) {
      form.append(
        field,
        new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }),
        image.fileName,
      );
    }
    const headers: Record<string, string> = {};
    if (this.config.env.AI_SERVICE_TOKEN)
      headers['x-internal-token'] = this.config.env.AI_SERVICE_TOKEN;
    if (context?.requestId) headers['x-request-id'] = context.requestId;

    let response: Response;
    try {
      response = await fetch(new URL(path, this.config.env.AI_SERVICE_URL), {
        method: 'POST',
        body: form,
        headers,
        signal: AbortSignal.timeout(this.config.env.AI_SERVICE_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn({ err: error, path }, 'Servicio de visión no disponible');
      throw new ExternalServiceError('El servicio de visión computacional no está disponible');
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ExternalServiceError(`El servicio de visión respondió ${response.status}`, {
        status: response.status,
        detail: detail.slice(0, 300),
      });
    }
    return (await response.json()) as T;
  }
}
