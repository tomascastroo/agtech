import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { SatelliteIngestionService } from '../application/satellite-ingestion.service.js';

@ApiTags('Satelital')
@Controller()
export class SatelliteController {
  constructor(
    private readonly satellite: SatelliteIngestionService,
    private readonly storage: ObjectStorage,
  ) {}

  @Get('assets/:assetId/satellite')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  @ApiOperation({ summary: 'Serie temporal de observaciones satelitales del activo' })
  async observations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    const observations = await this.satellite.observationsForAsset(user.organizationId, assetId);
    const images = await this.satellite.imagesByIds([
      ...new Set(observations.map((o) => o.satelliteImageId)),
    ]);
    const byId = new Map(images.map((i) => [i.id, i]));
    return Promise.all(
      observations.map(async (o) => {
        const image = byId.get(o.satelliteImageId);
        return {
          id: o.id,
          observedAt: o.observedAt,
          ndviMean: o.ndviMean,
          vegetatedAreaHa: o.vegetatedAreaHa,
          declaredAreaHa: o.declaredAreaHa,
          coverageRatio: o.coverageRatio,
          changeVsPreviousPct: o.changeVsPreviousPct,
          scene: image
            ? {
                sceneId: image.sceneId,
                provider: image.provider,
                cloudCoverPct: image.cloudCoverPct,
                resolutionM: image.resolutionM,
                simulated: image.isSimulated,
                previewUrl: image.previewStorageKey
                  ? await this.storage.signedDownloadUrl(image.previewStorageKey, { inline: true })
                  : null,
              }
            : null,
        };
      }),
    );
  }
}
