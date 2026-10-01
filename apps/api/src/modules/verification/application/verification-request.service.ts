import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DataSource, QueryFailedError } from 'typeorm';
import type { Actor } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { ConflictError, NotFoundError } from '../../../common/domain/errors.js';
import { QUEUES, type VerificationJobData } from '../../../common/queues/queues.js';
import { AssetEntity } from '../../assets/infrastructure/asset.entity.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { MonitoringConfigService } from '../../monitoring/application/monitoring-config.service.js';
import { MonitoringEventsService } from '../../monitoring/application/monitoring-events.service.js';
import {
  PIPELINE_VERSION,
  type VerificationInputSnapshot,
  type VerificationTrigger,
} from '../domain/verification.types.js';
import type { VerificationRunEntity } from '../infrastructure/verification-run.entity.js';
import { VerificationRepository } from '../infrastructure/verification.repository.js';

export interface RequestVerificationCommand {
  assetId: string;
  evidenceIds?: string[];
  note?: string;
  trigger: VerificationTrigger;
}

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Registra una verificación (PENDING) con una foto de los datos de entrada y la encola. La
 * request HTTP responde 202 de inmediato; el procesamiento ocurre en el worker.
 */
@Injectable()
export class VerificationRequestService {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly assets: AssetsRepository,
    private readonly monitoring: MonitoringConfigService,
    private readonly events: MonitoringEventsService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
    @InjectQueue(QUEUES.VERIFICATION) private readonly queue: Queue<VerificationJobData>,
  ) {}

  async request(
    actor: Actor,
    command: RequestVerificationCommand,
    context?: RequestContext,
  ): Promise<VerificationRunEntity> {
    const organizationId = actor.kind === 'user' ? actor.user.organizationId : actor.organizationId;
    const asset = await this.assets.findById(organizationId, command.assetId);
    if (!asset?.assetType || !asset.establishment)
      throw new NotFoundError('Activo', command.assetId);
    const [metadata, monitoring] = await Promise.all([
      this.assets.latestMetadata(asset.id),
      this.monitoring.forAsset(asset.id),
    ]);

    const snapshot: VerificationInputSnapshot & { previousAssetStatus: string } = {
      declaredQuantity: asset.declaredQuantity,
      unit: asset.unit,
      assetTypeCode: asset.assetType.code,
      verificationStrategy: asset.assetType.verificationStrategy,
      metadataVersion: metadata?.version ?? null,
      establishment: {
        id: asset.establishment.id,
        name: asset.establishment.name,
        renspa: asset.establishment.renspa,
        tenure: asset.establishment.tenure,
      },
      requestedEvidenceIds: command.evidenceIds ?? [],
      maxEvidenceAgeHours: monitoring?.maxEvidenceAgeHours ?? 72,
      note: command.note,
      previousAssetStatus: asset.status,
    };

    let run: VerificationRunEntity;
    try {
      run = await this.dataSource.transaction(async (manager) => {
        const created = await this.repository.createRun(
          {
            organizationId,
            assetId: asset.id,
            status: 'PENDING',
            trigger: command.trigger,
            requestedBy: actor.kind === 'user' ? actor.user.userId : null,
            requestedByProcess: actor.kind === 'system' ? actor.process : null,
            pipelineVersion: PIPELINE_VERSION,
            inputSnapshot: snapshot,
          },
          manager,
        );
        await manager
          .getRepository(AssetEntity)
          .update({ id: asset.id }, { status: 'PENDING_VERIFICATION' });
        await this.audit.record(
          {
            actor,
            action: AUDIT_ACTIONS.VERIFICATION_STARTED,
            resourceType: 'verification_run',
            resourceId: created.id,
            metadata: { assetId: asset.id, trigger: command.trigger },
            context,
          },
          manager,
        );
        await this.events.record(
          {
            organizationId,
            assetId: asset.id,
            verificationRunId: created.id,
            type: 'VERIFICATION_REQUESTED',
            message:
              command.trigger === 'SCHEDULED'
                ? 'Verificación programada por el monitoreo continuo'
                : 'Verificación solicitada',
          },
          manager,
        );
        return created;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictError('El activo ya tiene una verificación en curso');
      }
      throw error;
    }

    await this.queue.add(
      'verify',
      { runId: run.id, organizationId, requestId: context?.requestId ?? undefined },
      { jobId: run.id },
    );
    return run;
  }
}
