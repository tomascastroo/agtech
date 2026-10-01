import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { NotFoundError } from '../../../common/domain/errors.js';
import { QUEUES, type VerificationJobData } from '../../../common/queues/queues.js';
import { ExternalDataService } from '../../external-data/application/external-data.service.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { isPipelineProgress, type PipelineProgress } from '../domain/verification.types.js';
import {
  VerificationRepository,
  type VerificationFilters,
} from '../infrastructure/verification.repository.js';

@Injectable()
export class VerificationQueryService {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly externalData: ExternalDataService,
    private readonly storage: ObjectStorage,
    @InjectQueue(QUEUES.VERIFICATION) private readonly queue: Queue<VerificationJobData>,
  ) {}

  list(organizationId: string, filters: VerificationFilters) {
    return this.repository.list(organizationId, filters);
  }

  async get(organizationId: string, id: string) {
    const run = await this.repository.findForOrganization(organizationId, id);
    if (!run) throw new NotFoundError('Verificación', id);
    const [metrics, snapshots, history] = await Promise.all([
      this.repository.metricsForRun(id),
      this.externalData.forRun(organizationId, id),
      this.repository.previousResults(run.assetId, run.completedAt ?? new Date(), 365),
    ]);
    const progress = run.status === 'PROCESSING' ? await this.progress(id) : null;
    return { run, metrics, snapshots, history, progress };
  }

  /** Etapa en curso, publicada por el worker como progreso del job (jobId = id de la corrida). */
  private async progress(runId: string): Promise<PipelineProgress | null> {
    try {
      const job = await this.queue.getJob(runId);
      return job && isPipelineProgress(job.progress) ? job.progress : null;
    } catch {
      return null;
    }
  }

  async evidence(organizationId: string, id: string) {
    const run = await this.repository.findForOrganization(organizationId, id);
    if (!run) throw new NotFoundError('Verificación', id);
    const links = await this.repository.evidenceLinks(id);
    return Promise.all(
      links.map(async (link) => ({
        link,
        url: link.evidence?.storageKey
          ? await this.storage.signedDownloadUrl(link.evidence.storageKey, { inline: true })
          : null,
      })),
    );
  }
}
