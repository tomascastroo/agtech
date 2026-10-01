import { z } from 'zod';

const DEV_SECRET_MARKERS = ['dev-only', 'change-me', 'insecure'];

const bool = z.stringbool({ truthy: ['true', '1', 'yes'], falsy: ['false', '0', 'no', ''] });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    S3_ENDPOINT: z.url().optional(),
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,62}$/),
    S3_ACCESS_KEY: z.string().min(3),
    S3_SECRET_KEY: z.string().min(8),
    S3_FORCE_PATH_STYLE: bool.default(true),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    COOKIE_SECURE: bool.default(false),
    WEB_ORIGIN: z.url(),

    AI_SERVICE_URL: z.url().default('http://localhost:8000'),
    AI_SERVICE_TOKEN: z.string().default(''),
    AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),

    CV_PROVIDER: z.enum(['ai-service', 'mock']).default('ai-service'),
    SATELLITE_PROVIDER: z.enum(['mock', 'stac']).default('mock'),
    STAC_API_URL: z.url().default('https://earth-search.aws.element84.com/v1'),
    CAMERA_GATEWAY: z.enum(['simulated']).default('simulated'),
    REGISTRY_PROVIDER: z.enum(['mock']).default('mock'),

    MONITORING_TICK_SECONDS: z.coerce.number().int().min(30).max(86400).default(300),
    VERIFICATION_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),

    SEED_DEMO_PASSWORD: z.string().min(8).optional(),
    SEED_ASSETS_DIR: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const secrets = {
      JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
      S3_SECRET_KEY: env.S3_SECRET_KEY,
      AI_SERVICE_TOKEN: env.AI_SERVICE_TOKEN,
    };
    for (const [key, value] of Object.entries(secrets)) {
      if (!value || DEV_SECRET_MARKERS.some((marker) => value.includes(marker))) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Secreto de desarrollo en producción',
        });
      }
    }
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Debe ser true en producción',
      });
    }
    if (env.CV_PROVIDER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['CV_PROVIDER'],
        message: 'Proveedor mock no permitido en producción',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${issues}`);
  }
  return result.data;
}
