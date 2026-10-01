import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import type { EventSeverity, MonitoringEventType } from '../domain/monitoring.types.js';
import { MonitoringEventEntity } from '../infrastructure/monitoring-event.entity.js';

export interface MonitoringEventInput {
  organizationId: string;
  assetId: string;
  type: MonitoringEventType;
  message: string;
  severity?: EventSeverity;
  verificationRunId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/** Línea de tiempo de monitoreo por activo (lo que pasó, cuándo y por qué). */
@Injectable()
export class MonitoringEventsService {
  constructor(
    @InjectRepository(MonitoringEventEntity)
    private readonly events: Repository<MonitoringEventEntity>,
  ) {}

  async record(input: MonitoringEventInput, manager?: EntityManager): Promise<void> {
    const repo = manager?.getRepository(MonitoringEventEntity) ?? this.events;
    await repo.save(
      repo.create({
        organizationId: input.organizationId,
        assetId: input.assetId,
        type: input.type,
        message: input.message.slice(0, 255),
        severity: input.severity ?? 'INFO',
        verificationRunId: input.verificationRunId ?? null,
        payload: input.payload ?? {},
        occurredAt: input.occurredAt ?? new Date(),
      }),
    );
  }

  list(organizationId: string, filters: { assetId?: string; limit: number }) {
    const qb = this.events
      .createQueryBuilder('event')
      .where('event.organizationId = :organizationId', { organizationId })
      .orderBy('event.occurredAt', 'DESC')
      .take(filters.limit);
    if (filters.assetId) qb.andWhere('event.assetId = :assetId', { assetId: filters.assetId });
    return qb.getMany();
  }
}
