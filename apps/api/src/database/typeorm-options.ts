import type { DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env.schema.js';
import { ENTITIES } from './entities.js';
import { InitialSchema1790000000000 } from './migrations/1790000000000-initial-schema.js';
import { GuaranteeRequests1792000000000 } from './migrations/1792000000000-guarantee-requests.js';
import { RealVerificationSignals1791000000000 } from './migrations/1791000000000-real-verification-signals.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

export const MIGRATIONS = [
  InitialSchema1790000000000,
  RealVerificationSignals1791000000000,
  GuaranteeRequests1792000000000,
];

export function typeOrmOptions(env: Env): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'each',
    logging:
      env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace' ? ['query', 'error'] : ['error'],
    extra: { max: env.DATABASE_POOL_MAX, application_name: 'agrogarantias-api' },
  };
}
