export const QUEUES = {
  VERIFICATION: 'verification',
  REPORTS: 'reports',
  MONITORING: 'monitoring',
  SCANS: 'scans',
} as const;

export interface ScanJobData {
  scanId: string;
  organizationId: string;
}

export interface VerificationJobData {
  runId: string;
  organizationId: string;
  requestId?: string;
}

export type ReportJobData =
  | { kind: 'create-for-run'; runId: string; organizationId: string; requestedBy: string | null }
  | { kind: 'generate'; reportId: string; organizationId: string };

export const MONITORING_TICK_JOB = 'monitoring-tick';

export const QUEUE_PREFIX = 'agrogarantias';

/** Opciones de conexión Redis (BullMQ/ioredis) a partir de REDIS_URL. */
export function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
