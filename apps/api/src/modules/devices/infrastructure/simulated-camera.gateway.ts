import { Injectable } from '@nestjs/common';
import { ObjectStorage } from '../../storage/object-storage.js';
import { storageKeys } from '../../storage/storage-keys.js';
import {
  CameraGateway,
  type CameraDeviceRef,
  type CapturedFrame,
} from '../domain/camera-gateway.js';

/**
 * Gateway SIMULADO: devuelve el cuadro sintético asociado al número de serie desde la
 * biblioteca de señales simuladas del almacenamiento. Si no existe, la cámara se reporta
 * sin señal, como ocurriría con un equipo real desconectado.
 */
@Injectable()
export class SimulatedCameraGateway extends CameraGateway {
  readonly name = 'simulated';
  readonly simulated = true;

  constructor(private readonly storage: ObjectStorage) {
    super();
  }

  async capture(device: CameraDeviceRef): Promise<CapturedFrame | null> {
    const key = storageKeys.simulatedCameraFeed(device.serialNumber);
    if (!(await this.storage.objectExists(key))) return null;
    const simulation = (device.metadata.simulation ?? {}) as { groundTruthAnimals?: number };
    return {
      bytes: await this.storage.getObject(key),
      mimeType: 'image/jpeg',
      capturedAt: new Date(),
      metadata: { gateway: this.name, feedKey: key, synthetic: true },
      syntheticGroundTruth: simulation.groundTruthAnimals,
    };
  }

  async status(device: CameraDeviceRef): Promise<'ONLINE' | 'OFFLINE'> {
    return (await this.storage.objectExists(storageKeys.simulatedCameraFeed(device.serialNumber)))
      ? 'ONLINE'
      : 'OFFLINE';
  }
}
