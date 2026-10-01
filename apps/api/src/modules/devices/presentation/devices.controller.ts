import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { DevicesService } from '../application/devices.service.js';
import {
  CONNECTIVITY_TYPES,
  DEVICE_TYPES,
  POWER_SOURCES,
  type Connectivity,
  type DeviceType,
  type PowerSource,
} from '../domain/device.types.js';
import type { DeviceInstallationEntity } from '../infrastructure/device-installation.entity.js';
import type { DeviceEntity } from '../infrastructure/device.entity.js';

class KitRequestDto {
  @ApiProperty({ minimum: 1, maximum: 20 }) @IsInt() @Min(1) @Max(20) cameras: number;
  @ApiProperty({ enum: CONNECTIVITY_TYPES }) @IsIn(CONNECTIVITY_TYPES) connectivity: Connectivity;
  @ApiProperty() @IsBoolean() solarPower: boolean;
  @ApiProperty() @IsBoolean() rfidReader: boolean;
  @ApiProperty() @IsString() @Length(5, 255) shippingAddress: string;
  @ApiProperty() @IsString() @Length(3, 120) contactName: string;
  @ApiProperty() @Matches(/^[0-9 +()-]{6,40}$/) contactPhone: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class RegisterDeviceDto {
  @ApiProperty({ enum: DEVICE_TYPES }) @IsIn(DEVICE_TYPES) type: DeviceType;
  @ApiProperty({ example: 'CAM-LE-07' }) @Matches(/^[A-Za-z0-9-]{4,64}$/) serialNumber: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) manufacturer?: string;
  @ApiProperty({ enum: CONNECTIVITY_TYPES }) @IsIn(CONNECTIVITY_TYPES) connectivity: Connectivity;
  @ApiProperty({ enum: POWER_SOURCES }) @IsIn(POWER_SOURCES) powerSource: PowerSource;
  @ApiProperty({ example: 'Aguada Norte' }) @IsString() @Length(2, 120) label: string;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() longitude?: number;
}

function presentDevice(device: DeviceEntity) {
  return {
    id: device.id,
    type: device.type,
    serialNumber: device.serialNumber,
    model: device.model,
    manufacturer: device.manufacturer,
    connectivity: device.connectivity,
    powerSource: device.powerSource,
    status: device.status,
    gateway: device.gateway,
    capabilities: device.capabilities,
    lastSeenAt: device.lastSeenAt,
  };
}

function presentInstallation(installation: DeviceInstallationEntity) {
  return {
    id: installation.id,
    requestType: installation.requestType,
    status: installation.status,
    label: installation.label,
    location: installation.location,
    kitSpec: installation.kitSpec,
    shippingAddress: installation.shippingAddress,
    installedAt: installation.installedAt,
    createdAt: installation.createdAt,
    device: installation.device ? presentDevice(installation.device) : null,
  };
}

@ApiTags('Dispositivos')
@Controller()
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get('devices')
  @RequirePermissions(PERMISSIONS.DEVICES_READ)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return (await this.devices.listForOrganization(user.organizationId)).map(presentDevice);
  }

  @Get('assets/:assetId/devices')
  @RequirePermissions(PERMISSIONS.DEVICES_READ)
  @ApiOperation({ summary: 'Instalaciones y dispositivos del activo' })
  async forAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return (await this.devices.forAsset(user.organizationId, assetId)).map(presentInstallation);
  }

  @Post('assets/:assetId/devices/kit-request')
  @RequirePermissions(PERMISSIONS.DEVICES_WRITE)
  @ApiOperation({
    summary: 'Solicita el envío del kit de monitoreo (cámaras, conectividad, RFID opcional)',
  })
  async requestKit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() dto: KitRequestDto,
    @ReqContext() context: RequestContext,
  ) {
    return presentInstallation(await this.devices.requestKit(user, assetId, dto, context));
  }

  @Post('assets/:assetId/devices')
  @RequirePermissions(PERMISSIONS.DEVICES_WRITE)
  @ApiOperation({ summary: 'Registra un dispositivo ya instalado y verifica su conexión' })
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() dto: RegisterDeviceDto,
    @ReqContext() context: RequestContext,
  ) {
    const { installation, reachable } = await this.devices.registerInstalled(
      user,
      assetId,
      dto,
      context,
    );
    return { ...presentInstallation(installation), connection: reachable };
  }
}
