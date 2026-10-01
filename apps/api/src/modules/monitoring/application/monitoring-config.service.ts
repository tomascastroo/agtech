import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository, type EntityManager } from 'typeorm';
import { MonitoringConfigurationEntity } from '../infrastructure/monitoring-configuration.entity.js';

const HOUR_MS = 3_600_000;
export const DEFAULT_MONITORING: { intervalHours: number; maxEvidenceAgeHours: number } = {
  intervalHours: 24,
  maxEvidenceAgeHours: 72,
};

/** Configuración de monitoreo recurrente por activo. */
@Injectable()
export class MonitoringConfigService {
  constructor(
    @InjectRepository(MonitoringConfigurationEntity)
    private readonly configs: Repository<MonitoringConfigurationEntity>,
  ) {}

  forAsset(assetId: string): Promise<MonitoringConfigurationEntity | null> {
    return this.configs.findOneBy({ assetId });
  }

  async createDefault(
    organizationId: string,
    assetId: string,
    manager?: EntityManager,
    overrides: Partial<typeof DEFAULT_MONITORING> = {},
  ): Promise<void> {
    const repo = manager?.getRepository(MonitoringConfigurationEntity) ?? this.configs;
    await repo
      .createQueryBuilder()
      .insert()
      .values({ organizationId, assetId, enabled: true, ...DEFAULT_MONITORING, ...overrides })
      .orIgnore()
      .execute();
  }

  /** Programa la próxima verificación automática a partir de la última completada. */
  async scheduleNext(
    organizationId: string,
    assetId: string,
    completedAt: Date,
    manager: EntityManager,
  ) {
    await this.createDefault(organizationId, assetId, manager);
    const repo = manager.getRepository(MonitoringConfigurationEntity);
    const config = await repo.findOneByOrFail({ assetId });
    await repo.update(
      { id: config.id },
      {
        lastRunAt: completedAt,
        nextRunAt: new Date(completedAt.getTime() + config.intervalHours * HOUR_MS),
      },
    );
  }

  due(now: Date, limit: number): Promise<MonitoringConfigurationEntity[]> {
    return this.configs.find({
      where: { enabled: true, nextRunAt: LessThanOrEqual(now) },
      order: { nextRunAt: 'ASC' },
      take: limit,
    });
  }

  enabledForOrganizations(limit: number): Promise<MonitoringConfigurationEntity[]> {
    return this.configs.find({ where: { enabled: true }, order: { assetId: 'ASC' }, take: limit });
  }

  async markDispatched(id: string, now: Date, intervalHours: number): Promise<void> {
    await this.configs.update(
      { id },
      { nextRunAt: new Date(now.getTime() + intervalHours * HOUR_MS) },
    );
  }

  async update(
    organizationId: string,
    assetId: string,
    patch: Partial<
      Pick<MonitoringConfigurationEntity, 'enabled' | 'intervalHours' | 'maxEvidenceAgeHours'>
    >,
  ): Promise<MonitoringConfigurationEntity> {
    await this.createDefault(organizationId, assetId);
    const config = await this.configs.findOneByOrFail({ assetId, organizationId });
    Object.assign(config, patch);
    if (patch.intervalHours && config.lastRunAt) {
      config.nextRunAt = new Date(config.lastRunAt.getTime() + patch.intervalHours * HOUR_MS);
    }
    return this.configs.save(config);
  }
}
