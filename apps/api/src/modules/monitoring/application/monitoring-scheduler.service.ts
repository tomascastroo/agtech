import { Injectable, Logger } from '@nestjs/common';
import { AlertEngineService } from '../../alerts/application/alert-engine.service.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import { ConflictError } from '../../../common/domain/errors.js';
import { DocumentsRepository } from '../../documents/infrastructure/documents.repository.js';
import { EvidenceRepository } from '../../evidence/infrastructure/evidence.repository.js';
import { unitLabel } from '../../verification/application/pipeline/summary.js';
import { VerificationRequestService } from '../../verification/application/verification-request.service.js';
import { MonitoringConfigService } from './monitoring-config.service.js';

const BATCH = 200;

/**
 * Monitoreo continuo: en cada ciclo dispara las verificaciones programadas que vencieron y
 * evalúa las reglas de monitoreo (documentación por vencer, evidencia desactualizada,
 * activos sin verificación reciente).
 */
@Injectable()
export class MonitoringSchedulerService {
  private readonly logger = new Logger(MonitoringSchedulerService.name);

  constructor(
    private readonly configs: MonitoringConfigService,
    private readonly requests: VerificationRequestService,
    private readonly assets: AssetsRepository,
    private readonly documents: DocumentsRepository,
    private readonly evidence: EvidenceRepository,
    private readonly alerts: AlertEngineService,
  ) {}

  async tick(now = new Date()): Promise<{ dispatched: number; evaluated: number }> {
    let dispatched = 0;
    for (const config of await this.configs.due(now, BATCH)) {
      try {
        await this.requests.request(
          {
            kind: 'system',
            organizationId: config.organizationId,
            process: 'monitoring-scheduler',
          },
          { assetId: config.assetId, trigger: 'SCHEDULED' },
        );
        dispatched += 1;
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          this.logger.warn(
            { err: error, assetId: config.assetId },
            'No se pudo programar la verificación',
          );
        }
      }
      await this.configs.markDispatched(config.id, now, config.intervalHours);
    }

    let evaluated = 0;
    for (const config of await this.configs.enabledForOrganizations(BATCH * 5)) {
      const asset = await this.assets.findById(config.organizationId, config.assetId);
      if (!asset?.assetType || !asset.establishment) continue;
      const [documents, newestEvidenceAt] = await Promise.all([
        this.documents.forAsset(asset.organizationId, asset.id, asset.establishmentId),
        this.evidence.newestCapturedAt(asset.id),
      ]);
      await this.alerts.evaluate(asset.organizationId, {
        phase: 'MONITORING',
        now,
        asset: {
          id: asset.id,
          name: asset.name,
          assetTypeCode: asset.assetType.code,
          declaredQuantity: asset.declaredQuantity,
          unitLabel: unitLabel(asset.unit, asset.declaredQuantity),
          establishmentName: asset.establishment.name,
        },
        newestEvidenceAt,
        maxEvidenceAgeHours: config.maxEvidenceAgeHours,
        lastVerifiedAt: asset.lastVerifiedAt,
        documents: documents.map((d) => ({
          id: d.id,
          title: d.title,
          expiresAt: d.expiresAt,
          status: d.status,
        })),
      });
      evaluated += 1;
    }
    this.logger.log({ dispatched, evaluated }, 'Ciclo de monitoreo ejecutado');
    return { dispatched, evaluated };
  }
}
