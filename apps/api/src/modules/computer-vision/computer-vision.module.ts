import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/app-config.js';
import { AiModelsService } from './application/ai-models.service.js';
import { ComputerVisionProvider } from './domain/computer-vision.provider.js';
import { AiModelVersionEntity } from './infrastructure/ai-model-version.entity.js';
import { AiModelEntity } from './infrastructure/ai-model.entity.js';
import { AiServiceComputerVisionProvider } from './infrastructure/ai-service-cv.provider.js';
import { MockComputerVisionProvider } from './infrastructure/mock-cv.provider.js';

@Module({
  imports: [TypeOrmModule.forFeature([AiModelEntity, AiModelVersionEntity])],
  providers: [
    AiModelsService,
    {
      provide: ComputerVisionProvider,
      inject: [AppConfig],
      useFactory: (config: AppConfig): ComputerVisionProvider =>
        config.env.CV_PROVIDER === 'mock'
          ? new MockComputerVisionProvider()
          : new AiServiceComputerVisionProvider(config),
    },
  ],
  exports: [ComputerVisionProvider, AiModelsService],
})
export class ComputerVisionModule {}
