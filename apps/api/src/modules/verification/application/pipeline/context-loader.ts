import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { AlertsRepository } from '../../../alerts/infrastructure/alerts.repository.js';
import { AssetsRepository } from '../../../assets/infrastructure/assets.repository.js';
import { DevicesRepository } from '../../../devices/infrastructure/devices.repository.js';
import { DocumentsRepository } from '../../../documents/infrastructure/documents.repository.js';
import { MonitoringConfigService } from '../../../monitoring/application/monitoring-config.service.js';
import type { VerificationRunEntity } from '../../infrastructure/verification-run.entity.js';
import { VerificationRepository } from '../../infrastructure/verification.repository.js';
import type { PipelineContext } from './pipeline-context.js';

const HISTORY_DAYS = 180;

/** Reúne, en un único objeto inmutable por ejecución, todo lo que necesita el pipeline. */
@Injectable()
export class ContextLoader {
  constructor(
    private readonly assets: AssetsRepository,
    private readonly documents: DocumentsRepository,
    private readonly verification: VerificationRepository,
    private readonly alerts: AlertsRepository,
    private readonly devices: DevicesRepository,
    private readonly monitoring: MonitoringConfigService,
  ) {}

  async load(run: VerificationRunEntity, requestId?: string): Promise<PipelineContext> {
    const asset = await this.assets.findById(run.organizationId, run.assetId);
    if (!asset || !asset.assetType || !asset.establishment) {
      throw new UnrecoverableError('El activo de la verificación no existe o fue dado de baja');
    }
    const now = new Date();
    const [documents, history, openAlerts, installations, monitoring, metadata] = await Promise.all(
      [
        this.documents.forAsset(asset.organizationId, asset.id, asset.establishmentId),
        this.verification.previousResults(asset.id, run.queuedAt, HISTORY_DAYS),
        this.alerts.openForAsset(asset.id),
        this.devices.activeInstallations(asset.id),
        this.monitoring.forAsset(asset.id),
        this.assets.latestMetadata(asset.id),
      ],
    );
    return {
      now,
      run,
      asset,
      assetType: asset.assetType,
      establishment: asset.establishment,
      metadata: metadata?.data ?? {},
      documents,
      history,
      openAlerts,
      cameraInstallations: installations,
      monitoring: monitoring
        ? {
            enabled: monitoring.enabled,
            intervalHours: monitoring.intervalHours,
            maxEvidenceAgeHours: monitoring.maxEvidenceAgeHours,
          }
        : null,
      requestId,
    };
  }
}
