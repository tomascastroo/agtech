import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { sha256Hex } from '../../../common/crypto/hashing.js';
import { ConflictError, DomainError } from '../../../common/domain/errors.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { ComputerVisionProvider } from '../../computer-vision/domain/computer-vision.provider.js';
import { EvidenceRecorder } from '../../evidence/application/evidence-recorder.js';
import { EVIDENCE_SOURCE_CODES } from '../../evidence/domain/evidence.types.js';
import { livestockProfile } from '../../assets/domain/livestock-profile.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { VerificationRequestService } from '../../verification/application/verification-request.service.js';
import { CHUTE_MATCHER_VERSION } from '../domain/chute-matching.js';
import {
  assessChuteQuality,
  isLowerBound,
  assessScanQuality,
  STILL_MODES,
  type OfficialScanResult,
} from '../domain/scan.types.js';
import { ChuteProcessingService } from './chute-processing.service.js';
import { ScanFrameEntity } from '../infrastructure/scan-frame.entity.js';
import { ScanSessionEntity } from '../infrastructure/scan-session.entity.js';

const MAX_DETECTIONS_PER_FRAME = 50;

/**
 * Conteo OFICIAL de un escaneo (proceso worker). Recalcula todo sobre los cuadros que subió el
 * celular — nunca toma el conteo del dispositivo — y registra el resultado como evidencia
 * inmutable (manifiesto con los hashes de cada cuadro y el resultado), que la verificación usa
 * como cualquier otra evidencia.
 */
@Injectable()
export class ScanProcessingService {
  private readonly logger = new Logger(ScanProcessingService.name);

  constructor(
    @InjectRepository(ScanSessionEntity) private readonly sessions: Repository<ScanSessionEntity>,
    @InjectRepository(ScanFrameEntity) private readonly frames: Repository<ScanFrameEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cv: ComputerVisionProvider,
    private readonly storage: ObjectStorage,
    private readonly recorder: EvidenceRecorder,
    private readonly verifications: VerificationRequestService,
    private readonly audit: AuditService,
    private readonly chute: ChuteProcessingService,
  ) {}

  async process(scanId: string): Promise<void> {
    const session = await this.sessions.findOneBy({ id: scanId });
    if (!session || session.status !== 'PROCESSING') return;
    const rows = await this.frames.find({
      where: { scanSessionId: scanId },
      order: { kind: 'ASC', frameIndex: 'ASC' },
    });
    const load = async (row: ScanFrameEntity) => {
      const bytes = await this.storage.getObject(row.storageKey);
      if (sha256Hex(bytes) !== row.sha256) {
        throw new DomainIntegrityError(
          `El cuadro ${row.kind}/${row.frameIndex} no coincide con su hash`,
        );
      }
      return { bytes, index: row.frameIndex };
    };
    if (session.mode === 'CHUTE') return this.processChute(session, rows, load);
    const samples = await mapLimit(
      rows.filter((r) => r.kind === 'SAMPLE'),
      8,
      load,
    );
    const keys = await mapLimit(
      rows.filter((r) => r.kind === 'KEY'),
      4,
      load,
    );

    const result = await this.cv.processScan({
      frames: samples,
      keyFrames: keys,
      mode: session.mode,
      line: session.line,
    });
    const quality = assessScanQuality({
      mode: session.mode,
      durationS: session.durationS ?? 0,
      frames: result.framesProcessed,
      sampledFps: session.sampledFps,
      official: result,
      metrics: result.metrics,
      maxDisplacementM: session.maxDisplacementM,
      sweptDegrees: session.heading?.sweptDeg ?? null,
      thresholds: await this.thresholds(session),
    });
    const official: OfficialScanResult = {
      observed: result.observed,
      method: result.method,
      pen: result.pen,
      metrics: result.metrics,
      guidance: quality.guidance,
      netCount: result.netCount,
      positiveCrossings: result.positiveCrossings,
      negativeCrossings: result.negativeCrossings,
      maxSimultaneous: result.maxSimultaneous,
      confirmedTracks: result.confirmedTracks,
      confidence: result.confidence,
      framesProcessed: result.framesProcessed,
      blurryFrames: result.blurryFrames,
      cameraPanPx: result.cameraPanPx,
      warnings: result.warnings,
      limitations: result.limitations,
      model: result.model,
      tracker: result.tracker,
      processingMs: result.processingMs,
    };
    const warnings = [...new Set([...session.warnings, ...result.warnings, ...quality.reasons])];

    const manifest = {
      kind: 'agrogarantias.bovine-scan',
      version: 1,
      scanId: session.id,
      organizationId: session.organizationId,
      assetId: session.assetId,
      establishmentId: session.establishmentId,
      guaranteeRequestId: session.guaranteeRequestId,
      createdBy: session.createdBy,
      mode: session.mode,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationS: session.durationS,
      sampledFps: session.sampledFps,
      line: session.line,
      location: session.location,
      locationAccuracyM: session.locationAccuracyM,
      locationEnd: session.locationEnd,
      maxDisplacementM: session.maxDisplacementM,
      heading: session.heading,
      device: session.device,
      frames: rows.map((r) => ({
        kind: r.kind,
        index: r.frameIndex,
        capturedMs: r.capturedMs,
        sha256: r.sha256,
      })),
      deviceResult: session.clientResult,
      official: { ...official, crossings: result.crossings, tracks: result.tracks },
      quality: quality.quality,
      evidenceStatus: quality.evidenceStatus,
      guidance: quality.guidance,
      warnings,
    };
    const evidence = await this.recorder.record({
      organizationId: session.organizationId,
      assetId: session.assetId,
      establishmentId: session.establishmentId,
      sourceCode: EVIDENCE_SOURCE_CODES.BOVINE_SCANNER,
      type: 'SCAN',
      capturedAt: session.startedAt,
      location: session.location,
      file: { bytes: Buffer.from(JSON.stringify(manifest)), mimeType: 'application/json' },
      uploadedBy: session.createdBy,
      metadata: {
        scanSessionId: session.id,
        mode: session.mode,
        officialCount: result.observed,
        confidence: result.confidence,
        lowerBound: isLowerBound(session.mode),
        method: result.method,
        quality: quality.quality,
        evidenceStatus: quality.evidenceStatus,
        stillAnimals: STILL_MODES.includes(session.mode),
        durationS: session.durationS,
        frames: result.framesProcessed,
        deviceCount: session.clientResult?.netCount ?? null,
        model: result.model,
        tracker: result.tracker,
        simulated: result.model.simulated,
        locationSource: session.location ? 'DEVICE_GPS' : 'NONE',
        locationAccuracyM: session.locationAccuracyM,
      },
    });
    await this.sessions.save(
      Object.assign(session, {
        status: 'COMPLETED' as const,
        serverResult: {
          ...official,
          crossings: result.crossings,
          tracks: result.tracks,
          keyFrames: result.keyFrames,
          frames: result.frames.map((f) => ({
            ...f,
            detections: f.detections.slice(0, MAX_DETECTIONS_PER_FRAME),
          })),
        },
        officialCount: result.observed,
        quality: quality.quality,
        warnings,
        evidenceId: evidence.id,
        processedAt: new Date(),
        error: null,
      }),
    );
    await this.audit.record({
      actor: { kind: 'system', organizationId: session.organizationId, process: 'scan-worker' },
      action: AUDIT_ACTIONS.SCAN_PROCESSED,
      resourceType: 'scan_session',
      resourceId: session.id,
      metadata: {
        officialCount: result.observed,
        mode: session.mode,
        evidenceStatus: quality.evidenceStatus,
        deviceCount: session.clientResult?.netCount ?? null,
        quality: quality.quality,
        evidenceId: evidence.id,
        simulated: result.model.simulated,
      },
    });
    await this.reverify(session);
  }

  /**
   * Manga + RFID: cada captura se resuelve en el servidor (ChuteProcessingService); la sesión
   * registra una evidencia SCAN con el conteo de caravanas distintas confirmadas. Con lecturas
   * SIMULADAS el conteo nunca es censo (cota inferior) y queda marcado como simulado.
   */
  private async processChute(
    session: ScanSessionEntity,
    rows: ScanFrameEntity[],
    load: (row: ScanFrameEntity) => Promise<{ bytes: Buffer; index: number }>,
  ): Promise<void> {
    const result = await this.chute.resolve(session, rows, load);
    const quality = assessChuteQuality(result);
    const model = result.model ?? { code: 'yolox', version: 'n/a', simulated: false };
    const warnings = [
      ...new Set([
        ...session.warnings,
        ...quality.reasons,
        ...(result.rfidSimulated ? ['Lecturas RFID SIMULADAS: no es una identificación real'] : []),
      ]),
    ];
    const official: OfficialScanResult = {
      observed: result.identified,
      method: CHUTE_MATCHER_VERSION,
      pen: null,
      metrics: null,
      guidance: quality.guidance,
      netCount: result.identified,
      positiveCrossings: 0,
      negativeCrossings: 0,
      maxSimultaneous: 1,
      confirmedTracks: result.confirmed,
      confidence: result.confirmed / Math.max(1, result.captures.length),
      framesProcessed: result.framesProcessed,
      blurryFrames: 0,
      cameraPanPx: null,
      warnings,
      limitations: [
        'Manga + RFID: la identidad la da la caravana electrónica. La cámara solo confirma que había UN bovino estable en la zona de captura al momento de la lectura; no reconoce animales por su aspecto.',
        'Ante más de un bovino, un seguimiento inestable o lecturas superpuestas, la lectura queda sin asociar (no se inventa una identidad).',
        'Comparable con lo declarado solo si todo el rodeo pasa por la manga y las lecturas son de un lector real.',
      ],
      model,
      tracker: result.tracker ?? 'n/a',
      processingMs: result.processingMs,
    };
    const manifest = {
      kind: 'agrogarantias.chute-session',
      version: 1,
      scanId: session.id,
      organizationId: session.organizationId,
      assetId: session.assetId,
      establishmentId: session.establishmentId,
      guaranteeRequestId: session.guaranteeRequestId,
      createdBy: session.createdBy,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      captureZone: session.captureZone,
      device: session.device,
      captures: result.captures,
      official: { ...official, chute: result },
      quality: quality.quality,
      warnings,
    };
    const evidence = await this.recorder.record({
      organizationId: session.organizationId,
      assetId: session.assetId,
      establishmentId: session.establishmentId,
      sourceCode: EVIDENCE_SOURCE_CODES.BOVINE_SCANNER,
      type: 'SCAN',
      capturedAt: session.startedAt,
      location: session.location,
      file: { bytes: Buffer.from(JSON.stringify(manifest)), mimeType: 'application/json' },
      uploadedBy: session.createdBy,
      metadata: {
        scanSessionId: session.id,
        mode: session.mode,
        officialCount: result.identified,
        confidence: official.confidence,
        // Censo solo con lecturas reales; con lecturas simuladas, cota inferior.
        lowerBound: isLowerBound('CHUTE', result.rfidSimulated),
        method: CHUTE_MATCHER_VERSION,
        quality: quality.quality,
        evidenceStatus: quality.evidenceStatus,
        stillAnimals: false,
        identifiedByRfid: result.identified,
        rfidSimulated: result.rfidSimulated,
        frames: result.framesProcessed,
        deviceCount: (session.clientResult?.netCount as number | undefined) ?? null,
        model,
        tracker: official.tracker,
        simulated: model.simulated || result.rfidSimulated,
        locationSource: session.location ? 'DEVICE_GPS' : 'NONE',
        locationAccuracyM: session.locationAccuracyM,
      },
    });
    await this.sessions.save(
      Object.assign(session, {
        status: 'COMPLETED' as const,
        serverResult: { ...official, chute: result },
        officialCount: result.identified,
        quality: quality.quality,
        warnings,
        evidenceId: evidence.id,
        processedAt: new Date(),
        error: null,
      }),
    );
    await this.audit.record({
      actor: { kind: 'system', organizationId: session.organizationId, process: 'scan-worker' },
      action: AUDIT_ACTIONS.SCAN_PROCESSED,
      resourceType: 'scan_session',
      resourceId: session.id,
      metadata: {
        mode: 'CHUTE',
        identified: result.identified,
        confirmed: result.confirmed,
        ambiguous: result.ambiguous,
        insufficient: result.insufficient,
        rfidSimulated: result.rfidSimulated,
        evidenceId: evidence.id,
      },
    });
    await this.reverify(session);
  }

  /** Umbrales de calidad según el tipo de producción del rodeo (feedlot, cría, pastoreo). */
  private async thresholds(session: ScanSessionEntity) {
    const [row] = (await this.dataSource.query(
      `SELECT data FROM asset_metadata WHERE asset_id = $1 ORDER BY version DESC LIMIT 1`,
      [session.assetId],
    )) as { data: Record<string, unknown> }[];
    return livestockProfile(row?.data ?? null).quality;
  }

  async fail(scanId: string, reason: string): Promise<void> {
    const session = await this.sessions.findOneBy({ id: scanId });
    if (!session || session.status !== 'PROCESSING') return;
    await this.sessions.update({ id: scanId }, { status: 'FAILED', error: reason.slice(0, 500) });
    await this.audit.record({
      actor: { kind: 'system', organizationId: session.organizationId, process: 'scan-worker' },
      action: AUDIT_ACTIONS.SCAN_FAILED,
      resourceType: 'scan_session',
      resourceId: scanId,
      metadata: { reason: reason.slice(0, 300) },
    });
  }

  /** Si la declaración ya fue enviada, la nueva evidencia dispara una nueva verificación. */
  private async reverify(session: ScanSessionEntity) {
    if (!session.guaranteeRequestId) return;
    const [request] = (await this.dataSource.query(
      `SELECT id, status FROM guarantee_requests WHERE id = $1`,
      [session.guaranteeRequestId],
    )) as { id: string; status: string }[];
    if (request?.status !== 'READY_FOR_VERIFICATION') return;
    try {
      const run = await this.verifications.request(
        { kind: 'system', organizationId: session.organizationId, process: 'bovine-scanner' },
        { assetId: session.assetId, note: 'Nuevo escaneo de bovinos procesado', trigger: 'API' },
      );
      await this.dataSource.query(
        `UPDATE guarantee_requests SET verification_run_id = $2, updated_at = now() WHERE id = $1`,
        [request.id, run.id],
      );
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      this.logger.log(
        { scanId: session.id },
        'Verificación en curso: el escaneo se usará en la próxima',
      );
    }
  }
}

export class DomainIntegrityError extends DomainError {
  readonly code = 'INTEGRITY_ERROR';
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}
