import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { QUEUE_PREFIX, QUEUES, redisConnection } from './queues.js';

/** Conexión a Redis y registro de colas BullMQ, compartidos por API y worker. */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        return {
          prefix: QUEUE_PREFIX,
          connection: redisConnection(config.env.REDIS_URL),
          defaultJobOptions: {
            attempts: config.env.VERIFICATION_JOB_ATTEMPTS,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.VERIFICATION },
      { name: QUEUES.REPORTS },
      { name: QUEUES.MONITORING },
      { name: QUEUES.SCANS },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
