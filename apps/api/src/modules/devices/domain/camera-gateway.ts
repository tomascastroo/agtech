export interface CapturedFrame {
  bytes: Buffer;
  mimeType: string;
  capturedAt: Date;
  metadata: Record<string, unknown>;
  /** Conteo real conocido, solo disponible en fuentes simuladas. */
  syntheticGroundTruth?: number;
}

export interface CameraDeviceRef {
  serialNumber: string;
  type: string;
  metadata: Record<string, unknown>;
}

/**
 * Puerto hacia la red de cámaras (gateway del fabricante, VPN, MQTT, etc.). El MVP incluye un
 * gateway simulado; un gateway real implementa la misma interfaz sin cambios en el dominio.
 */
export abstract class CameraGateway {
  abstract readonly name: string;
  abstract readonly simulated: boolean;
  abstract capture(device: CameraDeviceRef): Promise<CapturedFrame | null>;
  abstract status(device: CameraDeviceRef): Promise<'ONLINE' | 'OFFLINE'>;
}
