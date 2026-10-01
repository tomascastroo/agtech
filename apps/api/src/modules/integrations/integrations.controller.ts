import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { AiModelsService } from '../computer-vision/application/ai-models.service.js';
import { ComputerVisionProvider } from '../computer-vision/domain/computer-vision.provider.js';
import { CameraGateway } from '../devices/domain/camera-gateway.js';
import { ExternalDataService } from '../external-data/application/external-data.service.js';
import { SatelliteImageryProvider } from '../satellite/domain/satellite.provider.js';

/** Estado de los adapters de integración: indica explícitamente cuáles son simulados. */
@ApiTags('Integraciones')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly cv: ComputerVisionProvider,
    private readonly satellite: SatelliteImageryProvider,
    private readonly cameras: CameraGateway,
    private readonly externalData: ExternalDataService,
    private readonly models: AiModelsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Proveedores configurados y su estado' })
  async status() {
    const [cvHealth, models] = await Promise.all([this.cv.health(), this.models.list()]);
    const registry = this.externalData.providerInfo();
    return {
      providers: [
        {
          capability: 'COMPUTER_VISION',
          name: this.cv.name,
          simulated: this.cv.simulated,
          status: cvHealth.ok ? 'OPERATIVE' : 'UNAVAILABLE',
          detail: cvHealth.detail ?? null,
        },
        {
          capability: 'SATELLITE_IMAGERY',
          name: this.satellite.name,
          simulated: this.satellite.simulated,
          status: 'OPERATIVE',
          capabilities: this.satellite.capabilities,
        },
        {
          capability: 'CAMERA_GATEWAY',
          name: this.cameras.name,
          simulated: this.cameras.simulated,
          status: 'OPERATIVE',
        },
        {
          capability: 'LIVESTOCK_REGISTRY',
          name: registry.name,
          simulated: registry.simulated,
          status: 'OPERATIVE',
          source: registry.source,
        },
      ],
      models: models.map((m) => ({
        code: m.code,
        name: m.name,
        task: m.task,
        provider: m.provider,
        versions: (m.versions ?? []).map((v) => ({
          version: v.version,
          status: v.status,
          simulated: v.isSimulated,
          metrics: v.metrics,
        })),
      })),
    };
  }
}
