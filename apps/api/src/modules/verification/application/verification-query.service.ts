import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../common/domain/errors.js';
import { ExternalDataService } from '../../external-data/application/external-data.service.js';
import { ObjectStorage } from '../../storage/object-storage.js';
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
    return { run, metrics, snapshots, history };
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
