/**
 * Entorno de integración: usa la infraestructura local (docker compose) con recursos
 * aislados (base agrogarantias_test, Redis DB 5, bucket propio) y el proveedor de visión
 * simulado para no depender del servicio Python.
 */
const env: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://agro:agro_dev_password@localhost:5432/agrogarantias_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/5',
  S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000',
  S3_PUBLIC_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000',
  S3_BUCKET: 'agrogarantias-test',
  S3_ACCESS_KEY: process.env.TEST_S3_ACCESS_KEY ?? 'agro_minio',
  S3_SECRET_KEY: process.env.TEST_S3_SECRET_KEY ?? 'agro_minio_dev_secret',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-enough-length-000000',
  WEB_ORIGIN: 'http://localhost:3000',
  CV_PROVIDER: 'mock',
  SATELLITE_PROVIDER: 'mock',
  MONITORING_TICK_SECONDS: '86400',
  VERIFICATION_JOB_ATTEMPTS: '2',
  SEED_DEMO_PASSWORD: 'test-only-demo-password-2026',
  RATE_LIMIT_LOGIN_PER_MINUTE: '40',
  RATE_LIMIT_PER_MINUTE: '5000',
};
for (const [key, value] of Object.entries(env)) process.env[key] = value;
