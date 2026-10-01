import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/app-config.js';
import { typeOrmOptions } from './typeorm-options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        ...typeOrmOptions(config.env),
        autoLoadEntities: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
