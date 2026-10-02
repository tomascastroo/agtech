import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { RfidService } from '../../animals/application/rfid.service.js';
import { normalizeEid } from '../../animals/domain/rfid.js';
import { BovineIndividualEntity } from '../../animals/infrastructure/bovine-individual.entity.js';
import {
  ComputerVisionProvider,
  type ModelRef,
} from '../../computer-vision/domain/computer-vision.provider.js';
import { EvidenceRecorder } from '../../evidence/application/evidence-recorder.js';
import { EVIDENCE_SOURCE_CODES } from '../../evidence/domain/evidence.types.js';
import {
  applySessionRules,
  CHUTE_MATCHER_VERSION,
  DEFAULT_CAPTURE_ZONE,
  matchChuteCapture,
  type ChuteDecision,
  type ChuteFrame,
} from '../domain/chute-matching.js';
import { ChuteCaptureEntity, type ChuteBestFrame } from '../infrastructure/chute-capture.entity.js';
import type { ScanFrameEntity } from '../infrastructure/scan-frame.entity.js';
import type { ScanSessionEntity } from '../infrastructure/scan-session.entity.js';

export interface ChuteSessionResult {
  confirmed: number;
  ambiguous: number;
  insufficient: number;
  /** Caravanas distintas confirmadas (el conteo de la sesión). */
  identified: number;
  rfidSimulated: boolean;
  framesProcessed: number;
  model: ModelRef | null;
  tracker: string | null;
  processingMs: number;
  captures: {
    id: string;
    sequence: number;
    status: string;
    reason: string | null;
    electronicId: string | null;
    individualId: string | null;
    evidenceId: string | null;
    bestFrames: number;
  }[];
}

/**
 * Manga + RFID (servidor, autoridad final). Por cada captura: re-detecta y re-sigue los cuadros
 * de la ventana (nunca usa el resultado del celular), decide la asociación con las mismas reglas
 * que el preliminar, aplica las reglas entre capturas y, si queda CONFIRMADA, registra la lectura
 * RFID, la identidad individual y la evidencia inmutable con los mejores cuadros. Sin
 * reconocimiento visual: la identidad la da la caravana.
 */
@Injectable()
export class ChuteProcessingService {
  constructor(
    @InjectRepository(ChuteCaptureEntity) private readonly captures: Repository<ChuteCaptureEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cv: ComputerVisionProvider,
    private readonly rfid: RfidService,
    private readonly recorder: EvidenceRecorder,
    private readonly audit: AuditService,
  ) {}

  async resolve(
    session: ScanSessionEntity,
    frameRows: ScanFrameEntity[],
    load: (row: ScanFrameEntity) => Promise<{ bytes: Buffer; index: number }>,
  ): Promise<ChuteSessionResult> {
    const started = Date.now();
    const rows = await this.captures.find({
      where: { scanSessionId: session.id },
      order: { sequence: 'ASC' },
    });
    const byIndex = new Map(
      frameRows.filter((r) => r.kind === 'SAMPLE').map((r) => [r.frameIndex, r]),
    );
    let model: ModelRef | null = null;
    let tracker: string | null = null;
    let framesProcessed = 0;

    // 1. Decisión por captura sobre los cuadros re-procesados en el servidor.
    const decisions: { row: ChuteCaptureEntity; decision: ChuteDecision }[] = [];
    for (const row of rows) {
      if (row.status !== 'PENDING') continue; // ya resuelta (reintento del job)
      const frameEntities = row.frameIndices
        .map((i) => byIndex.get(i))
        .filter((r): r is ScanFrameEntity => r !== undefined);
      const loaded = await Promise.all(frameEntities.map(load));
      const tracked = loaded.length ? await this.cv.trackFrames({ frames: loaded }) : null;
      model = tracked?.model ?? model;
      tracker = tracked?.tracker ?? tracker;
      framesProcessed += loaded.length;
      const msByIndex = new Map(frameEntities.map((r) => [r.frameIndex, r.capturedMs]));
      const frames: ChuteFrame[] = (tracked?.frames ?? []).map((f) => ({
        index: f.index,
        capturedMs: msByIndex.get(f.index) ?? 0,
        detections: f.detections.map((d) => ({
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          score: d.score,
          trackId: d.trackId,
          confirmed: d.confirmed,
        })),
        sharpness: f.sharpness,
        brightness: f.brightness,
      }));
      const decision = matchChuteCapture({
        frameSize: {
          width: tracked?.width ?? session.frameWidth,
          height: tracked?.height ?? session.frameHeight,
        },
        zone: session.captureZone ?? DEFAULT_CAPTURE_ZONE,
        reads: row.reads.map((r) => ({ eid: normalizeEid(r.electronicId), atMs: r.atMs })),
        frames,
      });
      decisions.push({ row, decision });
    }

    // 2. Reglas entre capturas (solo pueden bajar una confirmación).
    const final = applySessionRules(
      decisions.map(({ row, decision }) => ({
        id: row.id,
        sequence: row.sequence,
        readAtMs: decision.readAtMs,
        eid: decision.eid,
        clientTrackId: row.clientTrackId,
        decision,
      })),
    );

    // 3. Persistencia: lectura RFID, identidad, evidencia y captura resuelta (inmutable).
    for (const { row } of decisions) {
      const decision = final.get(row.id)!;
      await this.dataSource.transaction(async (manager) => {
        const validReads = row.reads.filter((r) => normalizeEid(r.electronicId));
        const observations = validReads.length
          ? await this.rfid.record(
              session.organizationId,
              { id: session.assetId, establishmentId: session.establishmentId },
              validReads.map((r) => ({
                electronicId: r.electronicId,
                observedAt: new Date(session.startedAt.getTime() + r.atMs).toISOString(),
                rawPayload: { chuteCaptureId: row.id, scanSessionId: session.id, atMs: r.atMs },
              })),
              row.rfidSource,
              row.readerDeviceId,
              manager,
            )
          : [];
        let individualId: string | null = null;
        let evidenceId: string | null = null;
        let bestFrames: ChuteBestFrame[] = [];
        if (decision.status === 'CONFIRMED' && decision.eid) {
          bestFrames = decision.bestFrames.map((f) => ({
            ...f,
            sha256: byIndex.get(f.index)!.sha256,
          }));
          const individual = await this.upsertIndividual(manager, session, row, decision.eid);
          individualId = individual.id;
          const capturedAt = new Date(session.startedAt.getTime() + (decision.readAtMs ?? 0));
          const manifest = {
            kind: 'agrogarantias.chute-capture',
            version: 1,
            captureId: row.id,
            scanSessionId: session.id,
            sequence: row.sequence,
            organizationId: session.organizationId,
            establishmentId: session.establishmentId,
            assetId: session.assetId,
            operator: row.createdBy,
            device: session.device,
            rfid: {
              electronicId: decision.eid,
              source: row.rfidSource,
              simulated: row.rfidSource === 'SIMULATED',
              readerDeviceId: row.readerDeviceId,
              reads: row.reads,
              observationIds: observations.map((o) => o.id),
            },
            individual: { id: individual.id, internalCode: individual.internalCode },
            association: {
              status: decision.status,
              reason: decision.reason,
              trackId: decision.trackId,
              matcher: CHUTE_MATCHER_VERSION,
              metrics: decision.metrics,
              zone: session.captureZone ?? DEFAULT_CAPTURE_ZONE,
            },
            // Dataset propio para investigación futura (Re-ID): cada cuadro con su caja y hash.
            bestFrames,
            windowFrames: row.frameIndices.map((i) => ({
              index: i,
              capturedMs: byIndex.get(i)?.capturedMs ?? null,
              sha256: byIndex.get(i)?.sha256 ?? null,
            })),
            model,
            tracker,
            capturedAt,
          };
          const evidence = await this.recorder.record(
            {
              organizationId: session.organizationId,
              assetId: session.assetId,
              establishmentId: session.establishmentId,
              sourceCode: EVIDENCE_SOURCE_CODES.BOVINE_SCANNER,
              type: 'RFID_READ',
              capturedAt,
              location: session.location,
              file: { bytes: Buffer.from(JSON.stringify(manifest)), mimeType: 'application/json' },
              uploadedBy: row.createdBy,
              metadata: {
                chuteCaptureId: row.id,
                scanSessionId: session.id,
                electronicId: decision.eid,
                individualId: individual.id,
                internalCode: individual.internalCode,
                associationStatus: decision.status,
                rfidSource: row.rfidSource,
                rfidSimulated: row.rfidSource === 'SIMULATED',
                bestFrames: bestFrames.length,
                trackId: decision.trackId,
              },
            },
            manager,
          );
          evidenceId = evidence.id;
        }
        await manager.getRepository(ChuteCaptureEntity).update(
          { id: row.id },
          {
            status: decision.status,
            reason: decision.reason,
            electronicId: decision.eid,
            trackId: decision.trackId,
            bestFrames,
            decision,
            rfidObservationIds: observations.map((o) => o.id),
            individualId,
            evidenceId,
            processedAt: new Date(),
          },
        );
      });
      await this.audit.record({
        actor: { kind: 'system', organizationId: session.organizationId, process: 'scan-worker' },
        action:
          decision.status === 'CONFIRMED'
            ? AUDIT_ACTIONS.BOVINE_RFID_ASSOCIATED
            : AUDIT_ACTIONS.BOVINE_RFID_NOT_ASSOCIATED,
        resourceType: 'chute_capture',
        resourceId: row.id,
        metadata: {
          scanSessionId: session.id,
          status: decision.status,
          reason: decision.reason,
          electronicId: decision.eid,
          rfidSource: row.rfidSource,
          clientStatus: (row.clientResult?.status as string | undefined) ?? null,
        },
      });
    }

    const resolved = await this.captures.find({
      where: { scanSessionId: session.id },
      order: { sequence: 'ASC' },
    });
    const confirmed = resolved.filter((c) => c.status === 'CONFIRMED');
    return {
      confirmed: confirmed.length,
      ambiguous: resolved.filter((c) => c.status === 'AMBIGUOUS').length,
      insufficient: resolved.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE').length,
      identified: new Set(confirmed.map((c) => c.electronicId)).size,
      rfidSimulated: confirmed.some((c) => c.rfidSource === 'SIMULATED'),
      framesProcessed,
      model,
      tracker,
      processingMs: Date.now() - started,
      captures: resolved.map((c) => ({
        id: c.id,
        sequence: c.sequence,
        status: c.status,
        reason: c.reason,
        electronicId: c.electronicId,
        individualId: c.individualId,
        evidenceId: c.evidenceId,
        bestFrames: c.bestFrames.length,
      })),
    };
  }

  /**
   * Identidad por caravana en la organización: la primera confirmación crea BOV-NNNNN; las
   * siguientes actualizan la última fecha. Real y simulado nunca comparten registro.
   */
  private async upsertIndividual(
    manager: import('typeorm').EntityManager,
    session: ScanSessionEntity,
    capture: ChuteCaptureEntity,
    eid: string,
  ): Promise<BovineIndividualEntity> {
    const repo = manager.getRepository(BovineIndividualEntity);
    const simulated = capture.rfidSource === 'SIMULATED';
    const now = new Date();
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `bovine_individuals:${session.organizationId}`,
    ]);
    const existing = await repo.findOneBy({
      organizationId: session.organizationId,
      electronicId: eid,
      simulated,
    });
    if (existing) {
      existing.lastIdentifiedAt = now;
      existing.confirmations += 1;
      existing.assetId = session.assetId;
      return repo.save(existing);
    }
    const [{ n }] = (await manager.query(
      `SELECT count(*)::int + 1 AS n FROM bovine_individuals WHERE organization_id = $1`,
      [session.organizationId],
    )) as { n: number }[];
    const animal = await this.rfid.animalByEid(session.organizationId, eid);
    return repo.save(
      repo.create({
        organizationId: session.organizationId,
        establishmentId: session.establishmentId,
        assetId: session.assetId,
        internalCode: `BOV-${String(n).padStart(5, '0')}`,
        electronicId: eid,
        animalId: animal?.id ?? null,
        simulated,
        firstIdentifiedAt: now,
        lastIdentifiedAt: now,
        confirmations: 1,
      }),
    );
  }
}
