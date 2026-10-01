import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ModelRef } from '../domain/computer-vision.provider.js';
import { AiModelVersionEntity } from '../infrastructure/ai-model-version.entity.js';
import { AiModelEntity, type AiModelTask } from '../infrastructure/ai-model.entity.js';

/**
 * Registro de modelos: cada resultado se vincula a la versión exacta del modelo que lo
 * produjo. Si el servicio reporta una versión desconocida, se registra automáticamente.
 */
@Injectable()
export class AiModelsService {
  private readonly cache = new Map<string, string>();

  constructor(
    @InjectRepository(AiModelEntity) private readonly models: Repository<AiModelEntity>,
    @InjectRepository(AiModelVersionEntity)
    private readonly versions: Repository<AiModelVersionEntity>,
  ) {}

  async resolveVersionId(model: ModelRef, task: AiModelTask, provider: string): Promise<string> {
    const key = `${model.code}@${model.version}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    await this.models
      .createQueryBuilder()
      .insert()
      .values({ code: model.code, name: model.code, task, provider })
      .orIgnore()
      .execute();
    const entity = await this.models.findOneByOrFail({ code: model.code });
    await this.versions
      .createQueryBuilder()
      .insert()
      .values({
        modelId: entity.id,
        version: model.version,
        isSimulated: model.simulated,
        status: 'ACTIVE',
        releasedAt: new Date(),
      })
      .orIgnore()
      .execute();
    const version = await this.versions.findOneByOrFail({
      modelId: entity.id,
      version: model.version,
    });
    this.cache.set(key, version.id);
    return version.id;
  }

  list() {
    return this.models.find({ relations: { versions: true }, order: { code: 'ASC' } });
  }
}
