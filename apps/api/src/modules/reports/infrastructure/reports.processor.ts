import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES, type ReportJobData } from '../../../common/queues/queues.js';
import { ReportsService } from '../application/reports.service.js';

@Processor(QUEUES.REPORTS, { concurrency: 2 })
export class ReportsProcessor extends WorkerHost {
  constructor(private readonly reports: ReportsService) {
    super();
  }

  async process(job: Job<ReportJobData>): Promise<void> {
    const data = job.data;
    if (data.kind === 'create-for-run') {
      await this.reports.requestForRun(
        { kind: 'system', organizationId: data.organizationId, process: 'verification-worker' },
        data.runId,
      );
      return;
    }
    await this.reports.generate(data.organizationId, data.reportId);
  }
}
