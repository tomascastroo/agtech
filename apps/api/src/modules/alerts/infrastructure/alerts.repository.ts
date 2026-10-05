import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository, type QueryDeepPartialEntity } from 'typeorm';
import {
  toSkip,
  type Paginated,
  type PaginationQueryDto,
} from '../../../common/pagination/pagination.js';
import type { AlertSeverity, AlertStatus } from '../domain/alert.types.js';
import { AlertRuleEntity } from './alert-rule.entity.js';
import { AlertEntity } from './alert.entity.js';

export interface AlertFilters extends PaginationQueryDto {
  status?: AlertStatus | 'ACTIVE';
  severity?: AlertSeverity;
  assetId?: string;
  bovineGuaranteeId?: string;
}

@Injectable()
export class AlertsRepository {
  constructor(
    @InjectRepository(AlertEntity) private readonly alerts: Repository<AlertEntity>,
    @InjectRepository(AlertRuleEntity) private readonly rules: Repository<AlertRuleEntity>,
  ) {}

  /** Reglas efectivas: las de la organización reemplazan a las del sistema con el mismo código. */
  async effectiveRules(organizationId: string): Promise<AlertRuleEntity[]> {
    const rules = await this.rules
      .createQueryBuilder('rule')
      .where('rule.organizationId = :organizationId OR rule.organizationId IS NULL', {
        organizationId,
      })
      .orderBy('rule.code')
      .getMany();
    const byCode = new Map<string, AlertRuleEntity>();
    for (const rule of rules) {
      const current = byCode.get(rule.code);
      if (!current || (current.organizationId === null && rule.organizationId !== null)) {
        byCode.set(rule.code, rule);
      }
    }
    return [...byCode.values()];
  }

  findRule(id: string, organizationId: string): Promise<AlertRuleEntity | null> {
    return this.rules
      .createQueryBuilder('rule')
      .where('rule.id = :id', { id })
      .andWhere('(rule.organizationId = :organizationId OR rule.organizationId IS NULL)', {
        organizationId,
      })
      .getOne();
  }

  saveRule(rule: Partial<AlertRuleEntity>): Promise<AlertRuleEntity> {
    return this.rules.save(this.rules.create(rule));
  }

  /** Inserta la alerta salvo que ya exista una abierta del mismo tipo para el activo. */
  async insertIfAbsent(alert: Partial<AlertEntity>): Promise<AlertEntity | null> {
    const result = await this.alerts
      .createQueryBuilder()
      .insert()
      .into(AlertEntity)
      .values(alert as QueryDeepPartialEntity<AlertEntity>)
      .orIgnore()
      .returning('*')
      .execute();
    const id = (result.identifiers[0] as { id?: string } | undefined)?.id;
    return id ? this.alerts.findOneBy({ id }) : null;
  }

  openForAsset(assetId: string): Promise<AlertEntity[]> {
    return this.alerts.find({ where: { assetId, status: Not(In(['RESOLVED', 'DISMISSED'])) } });
  }

  findById(organizationId: string, id: string): Promise<AlertEntity | null> {
    return this.alerts.findOne({
      where: { id, organizationId },
      relations: { asset: { establishment: true, assetType: true } },
    });
  }

  async list(organizationId: string, filters: AlertFilters): Promise<Paginated<AlertEntity>> {
    const qb = this.alerts
      .createQueryBuilder('alert')
      .innerJoinAndSelect('alert.asset', 'asset')
      .innerJoinAndSelect('asset.establishment', 'establishment')
      .innerJoinAndSelect('asset.assetType', 'type')
      .where('alert.organizationId = :organizationId', { organizationId })
      .orderBy(
        "CASE alert.status WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END",
        'ASC',
      )
      .addOrderBy(
        "CASE alert.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END",
        'ASC',
      )
      .addOrderBy('alert.createdAt', 'DESC')
      // Relaciones many-to-one: no multiplican filas, por eso alcanza con OFFSET/LIMIT.
      .offset(toSkip(filters))
      .limit(filters.pageSize);
    if (filters.status === 'ACTIVE') qb.andWhere("alert.status NOT IN ('RESOLVED','DISMISSED')");
    else if (filters.status) qb.andWhere('alert.status = :status', { status: filters.status });
    if (filters.severity) qb.andWhere('alert.severity = :severity', { severity: filters.severity });
    if (filters.assetId) qb.andWhere('alert.assetId = :assetId', { assetId: filters.assetId });
    if (filters.bovineGuaranteeId)
      qb.andWhere('alert.bovineGuaranteeId = :bg', { bg: filters.bovineGuaranteeId });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }

  async update(
    id: string,
    patch: Partial<
      Pick<
        AlertEntity,
        | 'status'
        | 'acknowledgedAt'
        | 'acknowledgedBy'
        | 'resolvedAt'
        | 'resolvedBy'
        | 'resolutionNote'
        | 'ownerUserId'
        | 'dismissedAt'
        | 'dismissedBy'
      >
    >,
  ) {
    await this.alerts.update({ id }, patch);
  }

  countOpenBySeverity(organizationId: string) {
    return this.alerts
      .createQueryBuilder('alert')
      .select('alert.severity', 'severity')
      .addSelect('count(*)::int', 'count')
      .where('alert.organizationId = :organizationId', { organizationId })
      .andWhere("alert.status NOT IN ('RESOLVED','DISMISSED')")
      .groupBy('alert.severity')
      .getRawMany<{ severity: AlertSeverity; count: number }>();
  }
}
