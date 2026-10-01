import { Injectable } from '@nestjs/common';
import { CameraGateway } from '../../../devices/domain/camera-gateway.js';
import { CAMERA_DEVICE_TYPES } from '../../../devices/domain/device.types.js';
import { DevicesRepository } from '../../../devices/infrastructure/devices.repository.js';
import { EvidenceRecorder } from '../../../evidence/application/evidence-recorder.js';
import { EVIDENCE_SOURCE_CODES } from '../../../evidence/domain/evidence.types.js';
import type { EvidenceEntity } from '../../../evidence/infrastructure/evidence.entity.js';
import { EvidenceRepository } from '../../../evidence/infrastructure/evidence.repository.js';
import { MonitoringEventsService } from '../../../monitoring/application/monitoring-events.service.js';
import type { PipelineContext } from './pipeline-context.js';

const HOUR_MS = 3_600_000;

/** Adquisición de evidencia: capturas de cámaras instaladas y cargas manuales recientes. */
@Injectable()
export class CameraCaptureService {
  constructor(
    private readonly gateway: CameraGateway,
    private readonly devices: DevicesRepository,
    private readonly recorder: EvidenceRecorder,
    private readonly evidence: EvidenceRepository,
    private readonly events: MonitoringEventsService,
  ) {}

  cameraInstallations(ctx: PipelineContext) {
    return ctx.cameraInstallations.filter(
      (i) =>
        i.device &&
        CAMERA_DEVICE_TYPES.includes(i.device.type) &&
        i.device.status !== 'DECOMMISSIONED',
    );
  }

  async captureAll(ctx: PipelineContext): Promise<EvidenceEntity[]> {
    const captured: EvidenceEntity[] = [];
    for (const installation of this.cameraInstallations(ctx)) {
      const device = installation.device!;
      const frame = await this.gateway.capture({
        serialNumber: device.serialNumber,
        type: device.type,
        metadata: device.metadata,
      });
      if (!frame) {
        await this.devices.markSeen(device.id, 'OFFLINE');
        await this.events.record({
          organizationId: ctx.asset.organizationId,
          assetId: ctx.asset.id,
          verificationRunId: ctx.run.id,
          type: 'DEVICE_NO_SIGNAL',
          severity: 'WARNING',
          message: `Sin señal de ${installation.label} (${device.serialNumber})`,
          payload: { deviceId: device.id },
        });
        continue;
      }
      await this.devices.markSeen(device.id, 'ONLINE');
      const evidence = await this.recorder.record({
        organizationId: ctx.asset.organizationId,
        assetId: ctx.asset.id,
        establishmentId: ctx.asset.establishmentId,
        sourceCode: this.gateway.simulated
          ? EVIDENCE_SOURCE_CODES.CAMERA_SIMULATED
          : `CAMERA_${this.gateway.name.toUpperCase()}`,
        type: 'IMAGE',
        capturedAt: frame.capturedAt,
        location: installation.location,
        file: { bytes: frame.bytes, mimeType: frame.mimeType },
        deviceId: device.id,
        metadata: {
          ...frame.metadata,
          deviceSerial: device.serialNumber,
          installationLabel: installation.label,
          ...(frame.syntheticGroundTruth !== undefined
            ? { syntheticGroundTruth: frame.syntheticGroundTruth }
            : {}),
        },
      });
      captured.push(evidence);
    }
    if (captured.length > 0) {
      await this.events.record({
        organizationId: ctx.asset.organizationId,
        assetId: ctx.asset.id,
        verificationRunId: ctx.run.id,
        type: 'EVIDENCE_CAPTURED',
        message: `${captured.length} capturas recibidas de cámaras del establecimiento`,
        payload: { evidenceIds: captured.map((e) => e.id) },
      });
    }
    return captured;
  }

  /** Cargas manuales dentro de la ventana de vigencia + evidencias seleccionadas por el usuario. */
  async manualEvidence(ctx: PipelineContext): Promise<EvidenceEntity[]> {
    const maxAge = ctx.monitoring?.maxEvidenceAgeHours ?? ctx.run.inputSnapshot.maxEvidenceAgeHours;
    const since = new Date(ctx.now.getTime() - maxAge * HOUR_MS);
    const recent = await this.evidence.recentByKind(ctx.asset.id, 'MANUAL_UPLOAD', since);
    const requested = await this.evidence.findByIds(
      ctx.asset.organizationId,
      ctx.asset.id,
      ctx.run.inputSnapshot.requestedEvidenceIds ?? [],
    );
    const byId = new Map([...recent, ...requested].map((e) => [e.id, e]));
    return [...byId.values()].filter((e) => e.type === 'IMAGE');
  }
}
