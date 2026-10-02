import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DomainError } from '../../../common/domain/errors.js';
import { QUEUES, type ScanJobData } from '../../../common/queues/queues.js';
import { ScanProcessingService } from '../application/scan-processing.service.js';

/** Worker BullMQ del conteo oficial de escaneos (reintentos con backoff). */
@Processor(QUEUES.SCANS, { concurrency: 1 })
export class ScansProcessor extends WorkerHost {
  private readonly logger = new Logger(ScansProcessor.name);

  constructor(private readonly processing: ScanProcessingService) {
    super();
  }

  async process(job: Job<ScanJobData>): Promise<void> {
    try {
      await this.processing.process(job.data.scanId);
    } catch (error) {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.warn(
        { scanId: job.data.scanId, finalAttempt, err: error },
        'Error procesando escaneo',
      );
      if (finalAttempt) {
        const message = error instanceof Error ? error.message : String(error);
        await this.processing.fail(
          job.data.scanId,
          error instanceof DomainError ? message : `Error interno del procesamiento (${message})`,
        );
      }
      throw error;
    }
  }
}
