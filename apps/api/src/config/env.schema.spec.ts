import { parseEnv } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_BUCKET: 'agrogarantias',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'a-very-strong-secret-value',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('Configuración', () => {
  it('aplica valores por defecto en desarrollo', () => {
    const env = parseEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.CV_PROVIDER).toBe('ai-service');
  });

  it('exige un secreto JWT de al menos 32 caracteres', () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'corto' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('impide arrancar en producción con secretos de desarrollo, cookies inseguras o proveedores simulados', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'dev-only-insecure-jwt-secret-change-me-0001',
        AI_SERVICE_TOKEN: 'dev-only-ai-service-token',
        CV_PROVIDER: 'mock',
      }),
    ).toThrow(/JWT_ACCESS_SECRET[\s\S]*COOKIE_SECURE[\s\S]*CV_PROVIDER/);
  });

  it('trata SEED_DEMO_PASSWORD vacío como "sin datos demo"', () => {
    expect(parseEnv({ ...base, SEED_DEMO_PASSWORD: '' }).SEED_DEMO_PASSWORD).toBeUndefined();
    expect(() => parseEnv({ ...base, SEED_DEMO_PASSWORD: 'corta' })).toThrow(/SEED_DEMO_PASSWORD/);
  });
});
