import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module.js';
import { DevicesService } from './application/devices.service.js';
import { CameraGateway } from './domain/camera-gateway.js';
import { DeviceInstallationEntity } from './infrastructure/device-installation.entity.js';
import { DeviceEntity } from './infrastructure/device.entity.js';
import { DevicesRepository } from './infrastructure/devices.repository.js';
import { SimulatedCameraGateway } from './infrastructure/simulated-camera.gateway.js';
import { DevicesController } from './presentation/devices.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity, DeviceInstallationEntity]), AssetsModule],
  controllers: [DevicesController],
  providers: [
    DevicesService,
    DevicesRepository,
    // Único gateway disponible en el MVP (CAMERA_GATEWAY=simulated).
    { provide: CameraGateway, useClass: SimulatedCameraGateway },
  ],
  exports: [DevicesRepository, CameraGateway],
})
export class DevicesModule {}
