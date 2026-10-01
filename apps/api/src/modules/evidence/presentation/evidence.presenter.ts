import type { EvidenceEntity } from '../infrastructure/evidence.entity.js';

export function presentEvidence(evidence: EvidenceEntity, url: string | null) {
  return {
    id: evidence.id,
    assetId: evidence.assetId,
    type: evidence.type,
    source: evidence.source
      ? {
          code: evidence.source.code,
          name: evidence.source.name,
          kind: evidence.source.kind,
          provider: evidence.source.provider,
          simulated: evidence.source.isSimulated,
        }
      : null,
    deviceId: evidence.deviceId,
    satelliteImageId: evidence.satelliteImageId,
    capturedAt: evidence.capturedAt,
    receivedAt: evidence.receivedAt,
    location: evidence.location,
    mimeType: evidence.mimeType,
    sizeBytes: evidence.sizeBytes,
    sha256: evidence.sha256,
    metadata: evidence.metadata,
    url,
  };
}
