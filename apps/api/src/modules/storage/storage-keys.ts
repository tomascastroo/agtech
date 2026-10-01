import { randomUUID } from 'node:crypto';

/**
 * Las claves de almacenamiento se generan en el servidor: nunca incluyen el nombre de archivo
 * provisto por el usuario y siempre están particionadas por organización.
 */
export const storageKeys = {
  document: (orgId: string, extension: string) =>
    `org/${orgId}/documents/${randomUUID()}.${extension}`,
  evidence: (orgId: string, assetId: string, extension: string) =>
    `org/${orgId}/assets/${assetId}/evidence/${randomUUID()}.${extension}`,
  report: (orgId: string, reportId: string, version: number, extension: string) =>
    `org/${orgId}/reports/${reportId}/v${version}.${extension}`,
  satellitePreview: (orgId: string, name: string, extension = 'jpg') =>
    `org/${orgId}/satellite/${name.replace(/[^A-Za-z0-9_.-]/g, '_')}.${extension}`,
  /** Biblioteca de señales simuladas (cámaras y escenas) usada por los adapters de desarrollo. */
  simulatedCameraFeed: (serial: string) => `simulated-feeds/cameras/${serial}.jpg`,
  simulatedSatelliteFeed: (assetId: string) => `simulated-feeds/satellite/${assetId}.jpg`,
};
