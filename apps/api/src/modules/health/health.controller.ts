import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import type { Queue } from 'bullmq';
import { Public } from '../../common/auth/decorators.js';
import { QUEUES } from '../../common/queues/queues.js';
import { ObjectStorage } from '../storage/object-storage.js';

/** Liveness (el proceso responde) y readiness (dependencias disponibles). */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly indicators: HealthIndicatorService,
    private readonly storage: ObjectStorage,
    @InjectQueue(QUEUES.VERIFICATION) private readonly queue: Queue,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      async () => {
        const indicator = this.indicators.check('redis');
        try {
          // Ida y vuelta real contra Redis a través de la cola, con timeout.
          await Promise.race([
            this.queue.getJobCounts('waiting'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);
          return indicator.up();
        } catch (error) {
          return indicator.down({ message: (error as Error).message });
        }
      },
      async () => {
        const indicator = this.indicators.check('storage');
        try {
          await this.storage.ping();
          return indicator.up();
        } catch (error) {
          return indicator.down({ message: (error as Error).message });
        }
      },
    ]);
  }
}
