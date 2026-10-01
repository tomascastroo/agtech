import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { NotFoundError, ValidationFailedError } from '../../../common/domain/errors.js';
import { EVIDENCE_UPLOAD_POLICY } from '../../../common/files/file-signature.js';
import { point } from '../../../common/geo/geojson.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import { MonitoringEventsService } from '../../monitoring/application/monitoring-events.service.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { EVIDENCE_SOURCE_CODES } from '../domain/evidence.types.js';
import type { EvidenceEntity } from '../infrastructure/evidence.entity.js';
import { EvidenceRepository } from '../infrastructure/evidence.repository.js';
import { readExifGps } from '../../../common/files/exif-gps.js';
import { resolveCaptureLocation, type LocationSource } from '../domain/capture-location.js';
import { EvidenceRecorder } from './evidence-recorder.js';

export interface UploadEvidenceCommand {
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
  /** Precisión informada por el dispositivo (metros). */
  accuracyM?: number;
  locationSource?: LocationSource;
  description?: string;
}

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

@Injectable()
export class EvidenceService {
  constructor(
    private readonly evidence: EvidenceRepository,
    private readonly recorder: EvidenceRecorder,
    private readonly assets: AssetsRepository,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
    private readonly events: MonitoringEventsService,
    private readonly dataSource: DataSource,
  ) {}

  async uploadManual(
    user: AuthenticatedUser,
    assetId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    command: UploadEvidenceCommand,
    context: RequestContext,
  ): Promise<EvidenceEntity> {
    const asset = await this.assets.findById(user.organizationId, assetId);
    if (!asset) throw new NotFoundError('Activo', assetId);
    if (!file) throw new ValidationFailedError('Debe adjuntar una imagen');
    const check = EVIDENCE_UPLOAD_POLICY.validate(file);
    if (!check.ok) throw new ValidationFailedError(check.reason);

    const exif = readExifGps(file.buffer);
    const location = resolveCaptureLocation(command, exif);
    // Fecha: la informada por el dispositivo; si no hay, la fecha original EXIF; si no, la carga.
    const exifDate = exif.capturedAt ? new Date(`${exif.capturedAt}${exif.offset ?? 'Z'}`) : null;
    const capturedAtSource = command.capturedAt
      ? 'CLIENT'
      : exifDate && !Number.isNaN(exifDate.getTime())
        ? 'EXIF'
        : 'UPLOAD';
    const capturedAt = command.capturedAt
      ? new Date(command.capturedAt)
      : capturedAtSource === 'EXIF'
        ? exifDate!
        : new Date();
    if (
      Number.isNaN(capturedAt.getTime()) ||
      capturedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS
    ) {
      throw new ValidationFailedError('Fecha de captura inválida');
    }

    return this.dataSource.transaction(async (manager) => {
      const evidence = await this.recorder.record(
        {
          organizationId: user.organizationId,
          assetId: asset.id,
          establishmentId: asset.establishmentId,
          sourceCode: EVIDENCE_SOURCE_CODES.MANUAL_UPLOAD,
          type: 'IMAGE',
          capturedAt,
          location: location.capture
            ? point(location.capture.longitude, location.capture.latitude)
            : null,
          file: { bytes: file.buffer, mimeType: check.kind.mime },
          uploadedBy: user.userId,
          metadata: {
            description: command.description ?? null,
            originalFileName: file.originalname.slice(0, 200),
            locationSource: location.source,
            locationAccuracyM: location.accuracyM,
            contextLocation: location.context,
            capturedAtSource,
            exifTimezoneAssumed: capturedAtSource === 'EXIF' && !exif.offset ? 'UTC' : null,
          },
        },
        manager,
      );
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.EVIDENCE_UPLOADED,
          resourceType: 'evidence',
          resourceId: evidence.id,
          metadata: { assetId: asset.id, sha256: evidence.sha256 },
          context,
        },
        manager,
      );
      await this.events.record(
        {
          organizationId: user.organizationId,
          assetId: asset.id,
          type: 'EVIDENCE_UPLOADED',
          message: 'Imagen cargada manualmente para verificación',
          payload: { evidenceId: evidence.id },
        },
        manager,
      );
      return evidence;
    });
  }

  async listForAsset(organizationId: string, assetId: string) {
    const asset = await this.assets.findById(organizationId, assetId);
    if (!asset) throw new NotFoundError('Activo', assetId);
    const items = await this.evidence.listForAsset(organizationId, assetId, 60);
    return Promise.all(items.map((item) => this.withUrl(item)));
  }

  async get(organizationId: string, id: string) {
    const item = await this.evidence.findById(organizationId, id);
    if (!item) throw new NotFoundError('Evidencia', id);
    return this.withUrl(item);
  }

  async withUrl(item: EvidenceEntity) {
    return {
      evidence: item,
      url: item.storageKey
        ? await this.storage.signedDownloadUrl(item.storageKey, { inline: true })
        : null,
    };
  }
}
