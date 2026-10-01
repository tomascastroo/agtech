import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import { DeviceInstallationEntity } from './device-installation.entity.js';
import { DeviceEntity } from './device.entity.js';

@Injectable()
export class DevicesRepository {
  constructor(
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    @InjectRepository(DeviceInstallationEntity)
    private readonly installations: Repository<DeviceInstallationEntity>,
  ) {}

  installationsForAsset(
    organizationId: string,
    assetId: string,
  ): Promise<DeviceInstallationEntity[]> {
    return this.installations.find({
      where: { organizationId, assetId },
      relations: { device: true },
      order: { createdAt: 'ASC' },
    });
  }

  /** Instalaciones activas con dispositivo asignado (fuentes de captura del activo). */
  activeInstallations(assetId: string): Promise<DeviceInstallationEntity[]> {
    return this.installations.find({
      where: { assetId, status: In(['INSTALLED', 'ACTIVE']) },
      relations: { device: true },
      order: { label: 'ASC' },
    });
  }

  listForOrganization(organizationId: string): Promise<DeviceEntity[]> {
    return this.devices.find({ where: { organizationId }, order: { serialNumber: 'ASC' } });
  }

  async saveDevice(data: Partial<DeviceEntity>, manager: EntityManager): Promise<DeviceEntity> {
    const repo = manager.getRepository(DeviceEntity);
    return repo.save(repo.create(data));
  }

  async saveInstallation(
    data: Partial<DeviceInstallationEntity>,
    manager?: EntityManager,
  ): Promise<DeviceInstallationEntity> {
    const repo = manager?.getRepository(DeviceInstallationEntity) ?? this.installations;
    return repo.save(repo.create(data));
  }

  async markSeen(deviceId: string, status: 'ONLINE' | 'OFFLINE'): Promise<void> {
    await this.devices.update(
      { id: deviceId },
      status === 'ONLINE' ? { status, lastSeenAt: new Date() } : { status },
    );
  }
}
