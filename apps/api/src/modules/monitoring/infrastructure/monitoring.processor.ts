import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Queue, type Job } from 'bullmq';
import { AppConfig } from '../../../config/app-config.js';
import { MONITORING_TICK_JOB, QUEUES } from '../../../common/queues/queues.js';
import { CollateralService } from '../../collateral/application/collateral.service.js';
import { MonitoringSchedulerService } from '../application/monitoring-scheduler.service.js';

/** Programa el ciclo de monitoreo como job repetitivo de BullMQ (un único scheduler global). */
@Processor(QUEUES.MONITORING, { concurrency: 1 })
export class MonitoringProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(MonitoringProcessor.name);

  constructor(
    private readonly scheduler: MonitoringSchedulerService,
    private readonly config: AppConfig,
    private readonly collateral: CollateralService,
    @InjectQueue(QUEUES.MONITORING) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const every = this.config.env.MONITORING_TICK_SECONDS * 1000;
    await this.queue.upsertJobScheduler(
      MONITORING_TICK_JOB,
      { every },
      { name: MONITORING_TICK_JOB },
    );
    this.logger.log(`Monitoreo programado cada ${this.config.env.MONITORING_TICK_SECONDS} s`);
  }

  async process(_job: Job): Promise<void> {
    await this.scheduler.tick();
    // Garantías bovinas: evidencia que envejece, próximas verificaciones vencidas.
    const evaluated = await this.collateral.sweep();
    if (evaluated) this.logger.log(`Garantías bovinas evaluadas: ${evaluated}`);
  }
}
