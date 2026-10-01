import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ErrorReporter } from '../../../common/observability/error-reporter.js';
import { QUEUES, type ReportJobData } from '../../../common/queues/queues.js';
import { ReportsService } from '../application/reports.service.js';

@Processor(QUEUES.REPORTS, { concurrency: 2 })
export class ReportsProcessor extends WorkerHost {
  constructor(
    private readonly reports: ReportsService,
    private readonly reporter: ErrorReporter,
  ) {
    super();
  }

  async process(job: Job<ReportJobData>): Promise<void> {
    try {
      await this.handle(job.data);
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        this.reporter.capture(error, {
          component: 'reports-worker',
          organizationId: job.data.organizationId,
          extra: { job: job.name, data: job.data },
        });
      }
      throw error;
    }
  }

  private async handle(data: ReportJobData): Promise<void> {
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
