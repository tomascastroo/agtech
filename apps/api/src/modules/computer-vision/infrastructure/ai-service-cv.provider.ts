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
  type ScanFramesInput,
  type ScanProcessing,
  type TrackedFrames,
  type TrackedFramesInput,
} from '../domain/computer-vision.provider.js';

interface RemoteScanBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  label: string;
}

interface RemoteTrack {
  frames: {
    index: number;
    detections: (RemoteScanBox & { track_id: number | null; confirmed: boolean })[];
    sharpness: number;
    brightness: number;
  }[];
  width: number;
  height: number;
  tracker: string;
  model: RemoteModel;
  processing_ms: number;
}

interface RemoteScan {
  observed: number;
  method: string;
  pen: {
    observed: number;
    unique_groups: number;
    tracks_counted: number;
    merged_tracks: number;
    max_simultaneous: number;
    coverage_views: number;
    revisit_ratio: number;
    occlusion_ratio: number;
    small_animal_ratio: number;
    edge_animals: number;
    method: string;
  } | null;
  metrics: {
    frames: number;
    blurry_ratio: number;
    underexposed_ratio: number;
    overexposed_ratio: number;
    fast_motion_ratio: number;
    occlusion_ratio: number;
    small_animal_ratio: number;
    coverage_views: number | null;
    edge_animals: number | null;
    registered_photos: number | null;
  };
  net_count: number;
  positive_crossings: number;
  negative_crossings: number;
  max_simultaneous: number;
  confirmed_tracks: number;
  confidence: number;
  frames_processed: number;
  width: number;
  height: number;
  camera_pan_px: number | null;
  blurry_frames: number;
  tracks: {
    id: number;
    first_frame: number;
    last_frame: number;
    hits: number;
    net_crossings: number;
    mean_score: number;
  }[];
  crossings: { track_id: number; frame: number; direction: number }[];
  frames: {
    index: number;
    detections: RemoteScanBox[];
    sharpness: number;
    camera_shift: [number, number] | null;
  }[];
  key_frames: { index: number; detections: RemoteScanBox[] }[];
  warnings: string[];
  limitations: string[];
  score_threshold: number;
  tracker: string;
  model: RemoteModel;
  processing_ms: number;
}

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
  score?: number | null;
}

interface RemoteCount {
  count: number;
  confidence: number;
  inference_passes?: number;
  score_threshold?: number | null;
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
        score: d.score ?? null,
      })),
      inferencePasses: r.inference_passes ?? 1,
      scoreThreshold: r.score_threshold ?? null,
      image: toAnalysis(r.image),
      model: toModel(r.model),
      processingMs: r.processing_ms,
    };
  }

  async detectObjects(image: ImageInput, context?: CallContext): Promise<ObjectDetection> {
    const count = await this.countAnimals(image, { species: 'bovine' }, context);
    return {
      detections: count.detections.map((d) => ({ ...d, score: d.score ?? count.confidence })),
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

  async processScan(input: ScanFramesInput, context?: CallContext): Promise<ScanProcessing> {
    const form = new FormData();
    for (const frame of input.frames) {
      form.append(
        'frames',
        new Blob([new Uint8Array(frame.bytes)], { type: 'image/jpeg' }),
        `${String(frame.index).padStart(5, '0')}.jpg`,
      );
    }
    for (const frame of input.keyFrames) {
      form.append(
        'key_frames',
        new Blob([new Uint8Array(frame.bytes)], { type: 'image/jpeg' }),
        `k${String(frame.index).padStart(3, '0')}.jpg`,
      );
    }
    form.append('mode', input.mode);
    form.append('line_orientation', input.line.orientation);
    form.append('line_position', String(input.line.position));
    const r = await this.send<RemoteScan>(
      '/v1/scans/process',
      form,
      context,
      this.config.env.AI_SERVICE_SCAN_TIMEOUT_MS,
    );
    const m = r.metrics;
    return {
      observed: r.observed,
      method: r.method,
      pen: r.pen
        ? {
            observed: r.pen.observed,
            uniqueGroups: r.pen.unique_groups,
            tracksCounted: r.pen.tracks_counted,
            mergedTracks: r.pen.merged_tracks,
            maxSimultaneous: r.pen.max_simultaneous,
            coverageViews: r.pen.coverage_views,
            revisitRatio: r.pen.revisit_ratio,
            occlusionRatio: r.pen.occlusion_ratio,
            smallAnimalRatio: r.pen.small_animal_ratio,
            edgeAnimals: r.pen.edge_animals,
            method: r.pen.method,
          }
        : null,
      metrics: {
        frames: m.frames,
        blurryRatio: m.blurry_ratio,
        underexposedRatio: m.underexposed_ratio,
        overexposedRatio: m.overexposed_ratio,
        fastMotionRatio: m.fast_motion_ratio,
        occlusionRatio: m.occlusion_ratio,
        smallAnimalRatio: m.small_animal_ratio,
        coverageViews: m.coverage_views,
        edgeAnimals: m.edge_animals,
        registeredPhotos: m.registered_photos,
      },
      netCount: r.net_count,
      positiveCrossings: r.positive_crossings,
      negativeCrossings: r.negative_crossings,
      maxSimultaneous: r.max_simultaneous,
      confirmedTracks: r.confirmed_tracks,
      confidence: r.confidence,
      framesProcessed: r.frames_processed,
      width: r.width,
      height: r.height,
      cameraPanPx: r.camera_pan_px,
      blurryFrames: r.blurry_frames,
      tracks: r.tracks.map((t) => ({
        id: t.id,
        firstFrame: t.first_frame,
        lastFrame: t.last_frame,
        hits: t.hits,
        netCrossings: t.net_crossings,
        meanScore: t.mean_score,
      })),
      crossings: r.crossings.map((c) => ({
        trackId: c.track_id,
        frame: c.frame,
        direction: c.direction,
      })),
      frames: r.frames.map((f) => ({
        index: f.index,
        detections: f.detections,
        sharpness: f.sharpness,
        cameraShift: f.camera_shift,
      })),
      keyFrames: r.key_frames.map((f) => ({ index: f.index, detections: f.detections })),
      warnings: r.warnings,
      limitations: r.limitations,
      scoreThreshold: r.score_threshold,
      tracker: r.tracker,
      model: toModel(r.model),
      processingMs: r.processing_ms,
    };
  }

  async trackFrames(input: TrackedFramesInput, context?: CallContext): Promise<TrackedFrames> {
    const form = new FormData();
    for (const frame of input.frames) {
      form.append(
        'frames',
        new Blob([new Uint8Array(frame.bytes)], { type: 'image/jpeg' }),
        `${String(frame.index).padStart(5, '0')}.jpg`,
      );
    }
    const r = await this.send<RemoteTrack>(
      '/v1/scans/track',
      form,
      context,
      this.config.env.AI_SERVICE_SCAN_TIMEOUT_MS,
    );
    // El servicio numera los cuadros 0..n-1 en el orden enviado: se vuelve a los índices propios.
    return {
      width: r.width,
      height: r.height,
      frames: r.frames.map((f) => ({
        index: input.frames[f.index]!.index,
        detections: f.detections.map((d) => ({
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          score: d.score,
          label: d.label,
          trackId: d.track_id,
          confirmed: d.confirmed,
        })),
        sharpness: f.sharpness,
        brightness: f.brightness,
      })),
      tracker: r.tracker,
      model: toModel(r.model),
      processingMs: r.processing_ms,
    };
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
    return this.send<T>(path, form, context, this.config.env.AI_SERVICE_TIMEOUT_MS);
  }

  private async send<T>(
    path: string,
    form: FormData,
    context: CallContext | undefined,
    timeoutMs: number,
  ): Promise<T> {
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
        signal: AbortSignal.timeout(timeoutMs),
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
