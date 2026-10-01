import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type EntityManager } from 'typeorm';
import {
  toSkip,
  type Paginated,
  type PaginationQueryDto,
} from '../../../common/pagination/pagination.js';
import type { VerificationStatus } from '../domain/verification.types.js';
import { VerificationEvidenceEntity } from './verification-evidence.entity.js';
import { VerificationMetricEntity } from './verification-metric.entity.js';
import { VerificationResultEntity } from './verification-result.entity.js';
import { VerificationRunEntity } from './verification-run.entity.js';

export interface VerificationFilters extends PaginationQueryDto {
  assetId?: string;
  status?: VerificationStatus;
}

export interface HistoricalResultRow {
  runId: string;
  completedAt: Date;
  declaredQuantity: number;
  detectedQuantity: number | null;
  finalScore: number;
  outcome: string;
}

@Injectable()
export class VerificationRepository {
  constructor(
    @InjectRepository(VerificationRunEntity)
    private readonly runs: Repository<VerificationRunEntity>,
    @InjectRepository(VerificationResultEntity)
    private readonly results: Repository<VerificationResultEntity>,
    @InjectRepository(VerificationMetricEntity)
    private readonly metrics: Repository<VerificationMetricEntity>,
    @InjectRepository(VerificationEvidenceEntity)
    private readonly links: Repository<VerificationEvidenceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  createRun(
    data: Partial<VerificationRunEntity>,
    manager?: EntityManager,
  ): Promise<VerificationRunEntity> {
    const repo = manager?.getRepository(VerificationRunEntity) ?? this.runs;
    return repo.save(repo.create(data));
  }

  findRun(id: string): Promise<VerificationRunEntity | null> {
    return this.runs.findOneBy({ id });
  }

  findForOrganization(organizationId: string, id: string): Promise<VerificationRunEntity | null> {
    return this.runs.findOne({
      where: { id, organizationId },
      relations: { result: true, asset: { assetType: true, establishment: { locations: true } } },
    });
  }

  async markProcessing(id: string): Promise<boolean> {
    const result = await this.runs
      .createQueryBuilder()
      .update()
      .set({
        status: 'PROCESSING',
        attempts: () => 'attempts + 1',
        startedAt: () => 'COALESCE(started_at, now())',
      })
      .where('id = :id AND status IN (:...statuses)', { id, statuses: ['PENDING', 'PROCESSING'] })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markFailed(id: string, reason: string): Promise<boolean> {
    const result = await this.runs
      .createQueryBuilder()
      .update()
      .set({ status: 'FAILED', failureReason: reason.slice(0, 2000), completedAt: () => 'now()' })
      .where('id = :id AND status IN (:...statuses)', { id, statuses: ['PENDING', 'PROCESSING'] })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markCompleted(id: string, manager: EntityManager): Promise<void> {
    await manager
      .getRepository(VerificationRunEntity)
      .update({ id, status: 'PROCESSING' }, { status: 'COMPLETED', completedAt: new Date() });
  }

  evidenceLinks(runId: string): Promise<VerificationEvidenceEntity[]> {
    return this.links.find({
      where: { verificationRunId: runId },
      relations: { evidence: { source: true } },
      order: { createdAt: 'ASC' },
    });
  }

  async linkEvidence(rows: Partial<VerificationEvidenceEntity>[]): Promise<void> {
    if (rows.length === 0) return;
    await this.links.save(rows.map((row) => this.links.create(row)));
  }

  async updateLink(
    runId: string,
    evidenceId: string,
    patch: Pick<
      VerificationEvidenceEntity,
      'role' | 'detectedCount' | 'confidence' | 'analysis' | 'exclusionReason' | 'aiModelVersionId'
    >,
  ): Promise<void> {
    await this.links.save(this.links.create({ verificationRunId: runId, evidenceId, ...patch }));
  }

  /** Resultados previos completados del activo, para el componente de historial. */
  async previousResults(
    assetId: string,
    before: Date,
    sinceDays: number,
  ): Promise<HistoricalResultRow[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT r.verification_run_id AS run_id, vr.completed_at, r.declared_quantity, r.detected_quantity,
              r.final_score, r.outcome
         FROM verification_results r
         JOIN verification_runs vr ON vr.id = r.verification_run_id
        WHERE r.asset_id = $1 AND vr.completed_at < $2 AND vr.completed_at >= $2::timestamptz - make_interval(days => $3)
        ORDER BY vr.completed_at ASC`,
      [assetId, before, sinceDays],
    );
    return rows.map((r) => ({
      runId: r.run_id as string,
      completedAt: r.completed_at as Date,
      declaredQuantity: Number(r.declared_quantity),
      detectedQuantity: r.detected_quantity === null ? null : Number(r.detected_quantity),
      finalScore: Number(r.final_score),
      outcome: r.outcome as string,
    }));
  }

  async saveResult(
    result: Partial<VerificationResultEntity>,
    metrics: Partial<VerificationMetricEntity>[],
    manager: EntityManager,
  ): Promise<VerificationResultEntity> {
    const resultRepo = manager.getRepository(VerificationResultEntity);
    const saved = await resultRepo.save(resultRepo.create(result));
    const metricRepo = manager.getRepository(VerificationMetricEntity);
    if (metrics.length) await metricRepo.save(metrics.map((m) => metricRepo.create(m)));
    return saved;
  }

  metricsForRun(runId: string): Promise<VerificationMetricEntity[]> {
    return this.metrics.find({ where: { verificationRunId: runId }, order: { key: 'ASC' } });
  }

  resultForRun(runId: string): Promise<VerificationResultEntity | null> {
    return this.results.findOneBy({ verificationRunId: runId });
  }

  async list(
    organizationId: string,
    filters: VerificationFilters,
  ): Promise<Paginated<VerificationRunEntity>> {
    const qb = this.runs
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.result', 'result')
      .innerJoinAndSelect('run.asset', 'asset')
      .innerJoinAndSelect('asset.assetType', 'type')
      .innerJoinAndSelect('asset.establishment', 'establishment')
      .where('run.organizationId = :organizationId', { organizationId })
      .orderBy('run.createdAt', 'DESC')
      .skip(toSkip(filters))
      .take(filters.pageSize);
    if (filters.assetId) qb.andWhere('run.assetId = :assetId', { assetId: filters.assetId });
    if (filters.status) qb.andWhere('run.status = :status', { status: filters.status });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }
}
