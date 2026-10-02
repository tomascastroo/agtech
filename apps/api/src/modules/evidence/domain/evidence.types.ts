export type EvidenceSourceKind =
  | 'CAMERA'
  | 'SATELLITE'
  | 'MANUAL_UPLOAD'
  | 'RFID'
  | 'SENSOR'
  | 'REGISTRY'
  | 'DRONE'
  | 'SCANNER';

export type EvidenceType = 'IMAGE' | 'SATELLITE_SCENE' | 'RFID_READ' | 'SENSOR_READING' | 'SCAN';

/** Códigos de fuentes de evidencia registradas en la tabla evidence_sources. */
export const EVIDENCE_SOURCE_CODES = {
  CAMERA_SIMULATED: 'CAMERA_SIMULATED',
  MANUAL_UPLOAD: 'MANUAL_UPLOAD',
  SATELLITE_SIMULATED: 'SATELLITE_SENTINEL2_SIMULATED',
  SATELLITE_STAC: 'SATELLITE_SENTINEL2_STAC',
  RFID_SIMULATED: 'RFID_SIMULATED',
  BOVINE_SCANNER: 'BOVINE_SCANNER',
} as const;
