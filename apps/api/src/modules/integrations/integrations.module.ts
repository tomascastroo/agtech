import { Module } from '@nestjs/common';
import { ComputerVisionModule } from '../computer-vision/computer-vision.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { ExternalDataModule } from '../external-data/external-data.module.js';
import { SatelliteModule } from '../satellite/satellite.module.js';
import { IntegrationsController } from './integrations.controller.js';

@Module({
  imports: [ComputerVisionModule, SatelliteModule, DevicesModule, ExternalDataModule],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
