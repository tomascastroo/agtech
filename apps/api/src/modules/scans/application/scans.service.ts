import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { sha256Hex } from '../../../common/crypto/hashing.js';
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain/errors.js';
import { detectFileKind } from '../../../common/files/file-signature.js';
import { point } from '../../../common/geo/geojson.js';
import { QUEUES, type ScanJobData } from '../../../common/queues/queues.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { GuaranteeRequestsService } from '../../guarantee-requests/application/guarantee-requests.service.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { storageKeys } from '../../storage/storage-keys.js';
import {
  EVIDENCE_STATUS_BY_QUALITY,
  EVIDENCE_STATUS_LABELS,
  SCAN_LIMITS,
  SCAN_MODE_LABELS,
  type ScanFrameKind,
  type ScanLine,
  type ScanMode,
  STILL_MODES,
} from '../domain/scan.types.js';
import { ScanFrameEntity } from '../infrastructure/scan-frame.entity.js';
import { ScanSessionEntity } from '../infrastructure/scan-session.entity.js';

export interface CreateScanCommand {
  id: string;
  mode: ScanMode;
  startedAt: string;
  sampledFps: number;
  frameWidth: number;
  frameHeight: number;
  line: ScanLine;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  device?: Record<string, unknown>;
}

export interface UploadFrameCommand {
  kind: ScanFrameKind;
  index: number;
  capturedMs: number;
  sha256: string;
}

export interface FinalizeScanCommand {
  endedAt: string;
  durationS: number;
  expectedFrames: number;
  expectedKeyFrames: number;
  clientResult: Record<string, unknown>;
  headingStartDeg?: number;
  sweptDeg?: number;
  headingSource?: string;
  endLatitude?: number;
  endLongitude?: number;
  maxDisplacementM?: number;
  warnings?: string[];
}

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Escáner de Bovinos (API). La subida es reanudable e idempotente:
 *  - la sesión la identifica un UUID generado en el celular (crearla dos veces no duplica);
 *  - cada cuadro se identifica por (sesión, tipo, índice) con su SHA-256: reenviarlo con el
 *    mismo hash no hace nada y con otro hash se rechaza;
 *  - al finalizar se exige que estén todos los cuadros declarados y se encola el conteo oficial.
 */
@Injectable()
export class ScansService {
  constructor(
    @InjectRepository(ScanSessionEntity) private readonly sessions: Repository<ScanSessionEntity>,
    @InjectRepository(ScanFrameEntity) private readonly frames: Repository<ScanFrameEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(QUEUES.SCANS) private readonly queue: Queue<ScanJobData>,
    private readonly requests: GuaranteeRequestsService,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: AuthenticatedUser,
    requestId: string,
    command: CreateScanCommand,
    context: RequestContext,
  ) {
    const request = await this.requests.mine(user, requestId);
    if (!request.assetId || !request.establishmentId) {
      throw new ValidationFailedError('Primero declará el rodeo a escanear');
    }
    const existing = await this.sessions.findOneBy({ id: command.id });
    if (existing) {
      if (existing.createdBy !== user.userId || existing.guaranteeRequestId !== request.id) {
        throw new ConflictError('El identificador de escaneo ya está en uso');
      }
      return this.view(existing);
    }
    if (command.mode !== 'PHOTO' && command.sampledFps < SCAN_LIMITS.minSampledFps) {
      throw new ValidationFailedError(
        `Tasa de muestreo mínima: ${SCAN_LIMITS.minSampledFps} cuadros por segundo`,
      );
    }
    const startedAt = new Date(command.startedAt);
    if (
      Number.isNaN(startedAt.getTime()) ||
      startedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS
    ) {
      throw new ValidationFailedError('Fecha de inicio inválida');
    }
    const session = await this.sessions.save(
      this.sessions.create({
        id: command.id,
        organizationId: request.organizationId,
        guaranteeRequestId: request.id,
        assetId: request.assetId,
        establishmentId: request.establishmentId,
        createdBy: user.userId,
        mode: command.mode,
        status: 'UPLOADING',
        startedAt,
        sampledFps: command.sampledFps,
        frameWidth: command.frameWidth,
        frameHeight: command.frameHeight,
        line: command.line,
        location:
          command.latitude !== undefined && command.longitude !== undefined
            ? point(command.longitude, command.latitude)
            : null,
        locationAccuracyM: command.accuracyM ?? null,
        device: command.device ?? {},
        warnings: [],
      }),
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.SCAN_STARTED,
      resourceType: 'scan_session',
      resourceId: session.id,
      metadata: { mode: session.mode, assetId: session.assetId, guaranteeRequestId: request.id },
      context,
    });
    return this.view(session);
  }

  async uploadFrame(
    user: AuthenticatedUser,
    requestId: string,
    scanId: string,
    file: { buffer: Buffer; size: number } | undefined,
    command: UploadFrameCommand,
  ) {
    const session = await this.owned(user, requestId, scanId);
    if (!file || file.size === 0) throw new ValidationFailedError('Falta el cuadro');
    if (file.size > SCAN_LIMITS.maxFrameBytes)
      throw new ValidationFailedError('Cuadro demasiado grande');
    if (detectFileKind(file.buffer)?.mime !== 'image/jpeg') {
      throw new ValidationFailedError('El cuadro debe ser JPEG');
    }
    const limit =
      session.mode === 'PHOTO'
        ? SCAN_LIMITS.maxPhotos
        : command.kind === 'KEY'
          ? SCAN_LIMITS.maxKeyFrames
          : SCAN_LIMITS.maxFrames;
    if (command.index >= limit) throw new ValidationFailedError('Índice de cuadro fuera de rango');
    const sha256 = sha256Hex(file.buffer);
    if (sha256 !== command.sha256.toLowerCase()) {
      throw new ValidationFailedError('El hash del cuadro no coincide con su contenido');
    }
    const existing = await this.frames.findOneBy({
      scanSessionId: session.id,
      kind: command.kind,
      frameIndex: command.index,
    });
    if (existing) {
      if (existing.sha256 !== sha256) {
        throw new ConflictError('Ya existe un cuadro distinto con ese índice');
      }
      return { stored: false, index: command.index, kind: command.kind };
    }
    if (session.status !== 'UPLOADING') {
      throw new ConflictError('El escaneo ya fue enviado: no admite cuadros nuevos');
    }
    const key = storageKeys.scanFrame(
      session.organizationId,
      session.id,
      command.kind,
      command.index,
    );
    await this.storage.putObject({
      key,
      body: file.buffer,
      contentType: 'image/jpeg',
      metadata: { sha256 },
    });
    // Carrera entre dos envíos del mismo cuadro: la clave primaria evita duplicados.
    await this.frames
      .createQueryBuilder()
      .insert()
      .values({
        scanSessionId: session.id,
        organizationId: session.organizationId,
        kind: command.kind,
        frameIndex: command.index,
        capturedMs: command.capturedMs,
        storageKey: key,
        sha256,
        sizeBytes: file.size,
      })
      .orIgnore()
      .execute();
    return { stored: true, index: command.index, kind: command.kind };
  }

  async finalize(
    user: AuthenticatedUser,
    requestId: string,
    scanId: string,
    command: FinalizeScanCommand,
    context: RequestContext,
  ) {
    const session = await this.owned(user, requestId, scanId);
    if (session.status !== 'UPLOADING') return this.view(session);
    const received = await this.receivedIndices(session.id);
    const missing = {
      SAMPLE: range(command.expectedFrames).filter((i) => !received.SAMPLE.has(i)),
      KEY: range(command.expectedKeyFrames).filter((i) => !received.KEY.has(i)),
    };
    if (missing.SAMPLE.length || missing.KEY.length) {
      throw new ConflictError('Faltan cuadros por subir', {
        missingSample: missing.SAMPLE.slice(0, 200),
        missingKey: missing.KEY,
      });
    }
    if (command.expectedFrames < 1) throw new ValidationFailedError('El escaneo no tiene cuadros');
    await this.sessions.save(
      Object.assign(session, {
        status: 'PROCESSING' as const,
        endedAt: new Date(command.endedAt),
        durationS: command.durationS,
        expectedFrames: command.expectedFrames,
        expectedKeyFrames: command.expectedKeyFrames,
        clientResult: command.clientResult,
        heading:
          command.sweptDeg !== undefined || command.headingStartDeg !== undefined
            ? {
                startDeg: command.headingStartDeg ?? null,
                sweptDeg: command.sweptDeg ?? null,
                source: command.headingSource ?? 'deviceorientation',
              }
            : null,
        locationEnd:
          command.endLatitude !== undefined && command.endLongitude !== undefined
            ? point(command.endLongitude, command.endLatitude)
            : null,
        maxDisplacementM: command.maxDisplacementM ?? null,
        warnings: (command.warnings ?? []).slice(0, 20),
        finalizedAt: new Date(),
        error: null,
      }),
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.SCAN_SUBMITTED,
      resourceType: 'scan_session',
      resourceId: session.id,
      metadata: {
        frames: command.expectedFrames,
        keyFrames: command.expectedKeyFrames,
        deviceCount: command.clientResult.netCount ?? null,
      },
      context,
    });
    await this.enqueue(session);
    return this.view((await this.sessions.findOneBy({ id: session.id }))!);
  }

  /** Reintenta un procesamiento fallido (los cuadros ya están en el servidor). */
  async retry(user: AuthenticatedUser, requestId: string, scanId: string) {
    const session = await this.owned(user, requestId, scanId);
    if (session.status !== 'FAILED') return this.view(session);
    await this.sessions.update({ id: session.id }, { status: 'PROCESSING', error: null });
    await this.enqueue(session);
    return this.view((await this.sessions.findOneBy({ id: session.id }))!);
  }

  async producerView(user: AuthenticatedUser, requestId: string, scanId: string) {
    return this.view(await this.owned(user, requestId, scanId));
  }

  async producerList(user: AuthenticatedUser, requestId: string) {
    const request = await this.requests.mine(user, requestId);
    const rows = await this.sessions.find({
      where: { guaranteeRequestId: request.id, createdBy: user.userId },
      order: { startedAt: 'DESC' },
    });
    return Promise.all(rows.map((s) => this.view(s)));
  }

  /** Vista de la entidad financiera: escaneos del activo con cuadros representativos. */
  async listForAsset(organizationId: string, assetId: string) {
    const rows = await this.sessions.find({
      where: { organizationId, assetId },
      order: { startedAt: 'DESC' },
      take: 20,
    });
    return Promise.all(rows.map((s) => this.view(s, { withKeyFrames: true })));
  }

  async detail(organizationId: string, scanId: string) {
    const session = await this.sessions.findOneBy({ id: scanId, organizationId });
    if (!session) throw new NotFoundError('Escaneo', scanId);
    return this.view(session, { withKeyFrames: true, withServerDetail: true });
  }

  private async owned(user: AuthenticatedUser, requestId: string, scanId: string) {
    const request = await this.requests.mine(user, requestId);
    const session = await this.sessions.findOneBy({
      id: scanId,
      guaranteeRequestId: request.id,
      createdBy: user.userId,
    });
    if (!session) throw new NotFoundError('Escaneo', scanId);
    return session;
  }

  private async receivedIndices(scanId: string) {
    const rows = await this.frames.find({
      where: { scanSessionId: scanId },
      select: { kind: true, frameIndex: true },
    });
    return {
      SAMPLE: new Set(rows.filter((r) => r.kind === 'SAMPLE').map((r) => r.frameIndex)),
      KEY: new Set(rows.filter((r) => r.kind === 'KEY').map((r) => r.frameIndex)),
    };
  }

  private async enqueue(session: ScanSessionEntity) {
    await this.queue.add(
      'process-scan',
      { scanId: session.id, organizationId: session.organizationId },
      {
        jobId: `scan-${session.id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    );
  }

  private async view(
    session: ScanSessionEntity,
    options: { withKeyFrames?: boolean; withServerDetail?: boolean } = {},
  ) {
    const received = await this.receivedIndices(session.id);
    const server = session.serverResult;
    const keyFrames = options.withKeyFrames ? await this.keyFrames(session) : undefined;
    return {
      id: session.id,
      mode: session.mode,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationS: session.durationS,
      sampledFps: session.sampledFps,
      frameSize: { width: session.frameWidth, height: session.frameHeight },
      line: session.line,
      location: session.location,
      locationAccuracyM: session.locationAccuracyM,
      maxDisplacementM: session.maxDisplacementM,
      heading: session.heading,
      device: session.device,
      received: { frames: received.SAMPLE.size, keyFrames: received.KEY.size },
      receivedSampleIndices:
        session.status === 'UPLOADING' ? [...received.SAMPLE].sort((a, b) => a - b) : undefined,
      receivedKeyIndices:
        session.status === 'UPLOADING' ? [...received.KEY].sort((a, b) => a - b) : undefined,
      expected: { frames: session.expectedFrames, keyFrames: session.expectedKeyFrames },
      // Conteo del celular: preliminar, nunca es el resultado oficial.
      deviceResult: session.clientResult,
      modeLabel: SCAN_MODE_LABELS[session.mode],
      official: server
        ? {
            count: session.officialCount,
            method: server.method ?? 'LINE_CROSSING_NET',
            stillAnimals: STILL_MODES.includes(session.mode),
            pen: server.pen ?? null,
            metrics: server.metrics ?? null,
            positiveCrossings: server.positiveCrossings,
            negativeCrossings: server.negativeCrossings,
            maxSimultaneous: server.maxSimultaneous,
            confirmedTracks: server.confirmedTracks,
            confidence: server.confidence,
            framesProcessed: server.framesProcessed,
            blurryFrames: server.blurryFrames,
            cameraPanPx: server.cameraPanPx,
            limitations: server.limitations,
            model: server.model,
            tracker: server.tracker,
            lowerBound: session.mode !== 'FIXED',
          }
        : null,
      quality: session.quality,
      evidenceStatus: session.quality ? EVIDENCE_STATUS_BY_QUALITY[session.quality] : null,
      evidenceStatusLabel: session.quality
        ? EVIDENCE_STATUS_LABELS[EVIDENCE_STATUS_BY_QUALITY[session.quality]]
        : null,
      guidance: server?.guidance ?? [],
      warnings: session.warnings,
      evidenceId: session.evidenceId,
      error: session.error,
      processedAt: session.processedAt,
      keyFrames,
      serverDetail:
        options.withServerDetail && server
          ? { crossings: server.crossings, tracks: server.tracks }
          : undefined,
    };
  }

  private async keyFrames(session: ScanSessionEntity) {
    const rows = await this.frames.find({
      where: { scanSessionId: session.id, kind: 'KEY' },
      order: { frameIndex: 'ASC' },
    });
    const detections =
      (session.serverResult?.keyFrames as { index: number; detections: unknown[] }[] | undefined) ??
      [];
    return Promise.all(
      rows.map(async (r) => ({
        index: r.frameIndex,
        capturedMs: r.capturedMs,
        sha256: r.sha256,
        url: await this.storage.signedDownloadUrl(r.storageKey, { inline: true }),
        detections: detections.find((d) => d.index === r.frameIndex)?.detections ?? null,
      })),
    );
  }
}

function range(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}
