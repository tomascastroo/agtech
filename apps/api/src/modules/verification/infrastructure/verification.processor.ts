import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';
import { DomainError } from '../../../common/domain/errors.js';
import { QUEUES, type VerificationJobData } from '../../../common/queues/queues.js';
import { VerificationPipeline } from '../application/pipeline/verification-pipeline.js';

/** Worker BullMQ de verificaciones: reintentos con backoff exponencial. */
@Processor(QUEUES.VERIFICATION, { concurrency: 2 })
export class VerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(VerificationProcessor.name);

  constructor(private readonly pipeline: VerificationPipeline) {
    super();
  }

  async process(job: Job<VerificationJobData>): Promise<void> {
    const { runId, requestId } = job.data;
    try {
      await this.pipeline.execute(runId, requestId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finalAttempt =
        error instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.warn(
        { runId, attempt: job.attemptsMade + 1, finalAttempt, err: error },
        'Error procesando verificación',
      );
      if (finalAttempt) {
        const reason =
          error instanceof DomainError || error instanceof UnrecoverableError
            ? message
            : `Error interno del procesamiento (${message})`;
        await this.pipeline.fail(runId, reason);
      }
      throw error;
    }
  }
}
