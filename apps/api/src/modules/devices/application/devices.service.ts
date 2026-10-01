import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { NotFoundError } from '../../../common/domain/errors.js';
import { point } from '../../../common/geo/geojson.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import { CameraGateway } from '../domain/camera-gateway.js';
import {
  CAMERA_DEVICE_TYPES,
  type Connectivity,
  type DeviceType,
  type KitSpec,
  type PowerSource,
} from '../domain/device.types.js';
import { DevicesRepository } from '../infrastructure/devices.repository.js';

export interface KitRequestCommand extends KitSpec {
  shippingAddress: string;
  contactName: string;
  contactPhone: string;
  notes?: string;
}

export interface RegisterDeviceCommand {
  type: DeviceType;
  serialNumber: string;
  model?: string;
  manufacturer?: string;
  connectivity: Connectivity;
  powerSource: PowerSource;
  label: string;
  latitude?: number;
  longitude?: number;
}

const CAPABILITIES: Record<DeviceType, string[]> = {
  FIXED_CAMERA: ['IMAGE_CAPTURE', 'ANIMAL_COUNTING'],
  SOLAR_CAMERA: ['IMAGE_CAPTURE', 'ANIMAL_COUNTING'],
  RFID_READER: ['RFID_READ'],
  SENSOR: ['TELEMETRY'],
  GATEWAY: ['CONNECTIVITY'],
};

@Injectable()
export class DevicesService {
  constructor(
    private readonly devices: DevicesRepository,
    private readonly assets: AssetsRepository,
    private readonly gateway: CameraGateway,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async forAsset(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    return this.devices.installationsForAsset(organizationId, assetId);
  }

  listForOrganization(organizationId: string) {
    return this.devices.listForOrganization(organizationId);
  }

  async requestKit(
    user: AuthenticatedUser,
    assetId: string,
    command: KitRequestCommand,
    context: RequestContext,
  ) {
    const asset = await this.requireAsset(user.organizationId, assetId);
    const installation = await this.devices.saveInstallation({
      organizationId: user.organizationId,
      establishmentId: asset.establishmentId,
      assetId: asset.id,
      requestType: 'KIT_REQUEST',
      status: 'REQUESTED',
      label: `Kit de monitoreo (${command.cameras} cámaras)`,
      kitSpec: {
        cameras: command.cameras,
        connectivity: command.connectivity,
        solarPower: command.solarPower,
        rfidReader: command.rfidReader,
      },
      shippingAddress: command.shippingAddress,
      contactName: command.contactName,
      contactPhone: command.contactPhone,
      notes: command.notes ?? null,
      requestedBy: user.userId,
    });
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.DEVICE_KIT_REQUESTED,
      resourceType: 'device_installation',
      resourceId: installation.id,
      metadata: { assetId, kit: installation.kitSpec },
      context,
    });
    return installation;
  }

  async registerInstalled(
    user: AuthenticatedUser,
    assetId: string,
    command: RegisterDeviceCommand,
    context: RequestContext,
  ) {
    const asset = await this.requireAsset(user.organizationId, assetId);
    const isCamera = CAMERA_DEVICE_TYPES.includes(command.type);
    const reachable = isCamera
      ? await this.gateway.status({
          serialNumber: command.serialNumber,
          type: command.type,
          metadata: {},
        })
      : 'OFFLINE';

    const installation = await this.dataSource.transaction(async (manager) => {
      const device = await this.devices.saveDevice(
        {
          organizationId: user.organizationId,
          type: command.type,
          serialNumber: command.serialNumber.trim().toUpperCase(),
          model: command.model ?? null,
          manufacturer: command.manufacturer ?? null,
          connectivity: command.connectivity,
          powerSource: command.powerSource,
          status: reachable === 'ONLINE' ? 'ONLINE' : 'PENDING',
          gateway: this.gateway.name,
          capabilities: CAPABILITIES[command.type],
          lastSeenAt: reachable === 'ONLINE' ? new Date() : null,
          metadata: {},
        },
        manager,
      );
      return this.devices.saveInstallation(
        {
          organizationId: user.organizationId,
          deviceId: device.id,
          establishmentId: asset.establishmentId,
          assetId: asset.id,
          requestType: 'SELF_INSTALLED',
          status: 'ACTIVE',
          label: command.label,
          location:
            command.latitude !== undefined && command.longitude !== undefined
              ? point(command.longitude, command.latitude)
              : asset.location,
          installedAt: new Date(),
          requestedBy: user.userId,
        },
        manager,
      );
    });
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.DEVICE_REGISTERED,
      resourceType: 'device_installation',
      resourceId: installation.id,
      metadata: { assetId, serialNumber: command.serialNumber, reachable },
      context,
    });
    return { installation, reachable };
  }

  private async requireAsset(organizationId: string, assetId: string) {
    const asset = await this.assets.findById(organizationId, assetId);
    if (!asset) throw new NotFoundError('Activo', assetId);
    return asset;
  }
}
