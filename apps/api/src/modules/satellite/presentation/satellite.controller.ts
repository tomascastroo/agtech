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
    const url = (key: unknown) =>
      typeof key === 'string' ? this.storage.signedDownloadUrl(key, { inline: true }) : null;
    return Promise.all(
      observations.map(async (o) => {
        const image = byId.get(o.satelliteImageId);
        const m = o.metrics;
        return {
          id: o.id,
          observedAt: o.observedAt,
          evidenceId: o.evidenceId,
          ndviMean: o.ndviMean,
          ndviStd: o.ndviStd,
          ndviMedian: m.ndviMedian ?? null,
          ndviMin: m.ndviMin ?? null,
          ndviMax: m.ndviMax ?? null,
          vegetationPct: m.vegetationPct ?? null,
          vegetatedAreaHa: o.vegetatedAreaHa,
          analyzedAreaHa: m.analyzedAreaHa ?? null,
          declaredAreaHa: o.declaredAreaHa,
          coverageRatio: o.coverageRatio,
          changeVsPreviousPct: o.changeVsPreviousPct,
          ndviChangePct: m.ndviChangePct ?? null,
          cloudCoverPct: m.cloudCoverPct ?? null,
          validFraction: m.validFraction ?? null,
          usable: m.usable !== false && o.ndviMean !== null,
          quality: m.quality ?? null,
          issues: m.issues ?? [],
          confidence: m.confidence ?? null,
          processingVersion: m.processingVersion ?? null,
          model: m.model ?? null,
          ndviPreviewUrl: await (url(m.ndviPreviewKey) ?? url(image?.previewStorageKey)),
          visualPreviewUrl: await url(m.visualPreviewKey),
          scene: image
            ? {
                sceneId: image.sceneId,
                provider: image.provider,
                platform: image.metadata.platform ?? null,
                tile: image.metadata.tile ?? null,
                catalog: image.metadata.catalog ?? null,
                acquiredAt: image.acquiredAt,
                cloudCoverPct: image.cloudCoverPct,
                resolutionM: image.resolutionM,
                simulated: image.isSimulated,
                previewUrl: await (url(m.ndviPreviewKey) ?? url(image.previewStorageKey)),
              }
            : null,
        };
      }),
    );
  }
}
