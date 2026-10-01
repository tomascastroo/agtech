import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import type { Actor } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import {
  toSkip,
  type Paginated,
  type PaginationQueryDto,
} from '../../../common/pagination/pagination.js';
import { AuditLogEntity } from '../infrastructure/audit-log.entity.js';
import type { AuditAction } from './audit.types.js';

export interface AuditEntry {
  actor: Actor | { kind: 'anonymous'; organizationId: string | null };
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  context?: RequestContext;
}

/** Registro de auditoría append-only (la tabla rechaza UPDATE/DELETE). */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity) private readonly logs: Repository<AuditLogEntity>,
  ) {}

  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager?.getRepository(AuditLogEntity) ?? this.logs;
    const { actor } = entry;
    await repo.insert({
      organizationId: actor.kind === 'user' ? actor.user.organizationId : actor.organizationId,
      userId: actor.kind === 'user' ? actor.user.userId : null,
      actorType: actor.kind === 'user' ? 'USER' : 'SYSTEM',
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      metadata: {
        ...(actor.kind === 'system' ? { process: actor.process } : {}),
        ...entry.metadata,
      },
      ip: entry.context?.ip ?? null,
      userAgent: entry.context?.userAgent ?? null,
      requestId: entry.context?.requestId ?? null,
    });
  }

  async list(
    organizationId: string,
    query: PaginationQueryDto & { resourceType?: string; resourceId?: string },
  ): Promise<Paginated<AuditLogEntity>> {
    const qb = this.logs
      .createQueryBuilder('log')
      .where('log.organizationId = :organizationId', { organizationId })
      .orderBy('log.createdAt', 'DESC')
      .skip(toSkip(query))
      .take(query.pageSize);
    if (query.resourceType) qb.andWhere('log.resourceType = :rt', { rt: query.resourceType });
    if (query.resourceId) qb.andWhere('log.resourceId = :rid', { rid: query.resourceId });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
