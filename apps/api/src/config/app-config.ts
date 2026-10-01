import { Global, Module } from '@nestjs/common';
import { parseEnv, type Env } from './env.schema.js';

/**
 * Configuración tipada de la aplicación. Se valida una única vez al iniciar el proceso:
 * si falta una variable o un valor es inválido, el proceso no arranca.
 */
export class AppConfig {
  constructor(readonly env: Env) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }
}

let cached: AppConfig | undefined;

export function loadAppConfig(): AppConfig {
  cached ??= new AppConfig(parseEnv(process.env));
  return cached;
}

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: loadAppConfig }],
  exports: [AppConfig],
})
export class AppConfigModule {}
