import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { sha256Hex } from '../../../common/crypto/hashing.js';
import { detectFileKind } from '../../../common/files/file-signature.js';
import type { GeoPoint } from '../../../common/geo/geojson.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { storageKeys } from '../../storage/storage-keys.js';
import type { EvidenceType } from '../domain/evidence.types.js';
import type { EvidenceEntity } from '../infrastructure/evidence.entity.js';
import { EvidenceRepository } from '../infrastructure/evidence.repository.js';

export interface RecordEvidenceInput {
  organizationId: string;
  assetId: string;
  establishmentId: string;
  sourceCode: string;
  type: EvidenceType;
  capturedAt: Date;
  location: GeoPoint | null;
  file?: { bytes: Buffer; mimeType: string };
  existingStorageKey?: string;
  deviceId?: string | null;
  satelliteImageId?: string | null;
  uploadedBy?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Registra evidencia de forma inmutable: el archivo va al almacenamiento de objetos con su
 * hash SHA-256 y los metadatos a PostgreSQL. La integridad puede verificarse en cualquier
 * momento recalculando el hash.
 */
@Injectable()
export class EvidenceRecorder {
  constructor(
    private readonly evidence: EvidenceRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async record(input: RecordEvidenceInput, manager?: EntityManager): Promise<EvidenceEntity> {
    const source = await this.evidence.sourceByCode(input.sourceCode);
    let storageKey = input.existingStorageKey ?? null;
    let sha256: string | null = null;
    let mimeType: string | null = null;
    let sizeBytes: number | null = null;

    if (input.file) {
      const kind = detectFileKind(input.file.bytes);
      mimeType = kind?.mime ?? input.file.mimeType;
      const extension =
        kind?.extensions[0] ?? (input.file.mimeType === 'application/json' ? 'json' : 'bin');
      sha256 = sha256Hex(input.file.bytes);
      sizeBytes = input.file.bytes.length;
      storageKey = storageKeys.evidence(input.organizationId, input.assetId, extension);
      await this.storage.putObject({
        key: storageKey,
        body: input.file.bytes,
        contentType: mimeType,
        metadata: { sha256, source: source.code },
      });
    }

    return this.evidence.create(
      {
        organizationId: input.organizationId,
        assetId: input.assetId,
        establishmentId: input.establishmentId,
        sourceId: source.id,
        deviceId: input.deviceId ?? null,
        satelliteImageId: input.satelliteImageId ?? null,
        type: input.type,
        storageKey,
        mimeType,
        sizeBytes,
        sha256,
        capturedAt: input.capturedAt,
        location: input.location,
        metadata: { ...input.metadata, simulatedSource: source.isSimulated },
        uploadedBy: input.uploadedBy ?? null,
      },
      manager,
    );
  }
}
