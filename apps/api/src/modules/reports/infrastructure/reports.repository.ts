import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  toSkip,
  type Paginated,
  type PaginationQueryDto,
} from '../../../common/pagination/pagination.js';
import type { ReportFormat, ReportStatus } from '../domain/report.types.js';
import { ReportDocumentEntity } from './report-document.entity.js';
import { ReportEntity } from './report.entity.js';

@Injectable()
export class ReportsRepository {
  constructor(
    @InjectRepository(ReportEntity) private readonly reports: Repository<ReportEntity>,
    @InjectRepository(ReportDocumentEntity)
    private readonly documents: Repository<ReportDocumentEntity>,
  ) {}

  findById(organizationId: string, id: string): Promise<ReportEntity | null> {
    return this.reports.findOne({
      where: { id, organizationId },
      relations: { documents: true, asset: { establishment: true, assetType: true } },
    });
  }

  findByRun(runId: string): Promise<ReportEntity | null> {
    return this.reports.findOneBy({ verificationRunId: runId });
  }

  create(data: Partial<ReportEntity>): Promise<ReportEntity> {
    return this.reports.save(this.reports.create(data));
  }

  async setStatus(
    id: string,
    status: ReportStatus,
    extra: Partial<Pick<ReportEntity, 'generatedAt' | 'failureReason'>> = {},
  ) {
    await this.reports.update({ id }, { status, ...extra });
  }

  async nextVersion(reportId: string): Promise<number> {
    const row = await this.documents
      .createQueryBuilder('d')
      .select('COALESCE(max(d.version), 0)', 'max')
      .where('d.reportId = :reportId', { reportId })
      .getRawOne<{ max: number }>();
    return Number(row?.max ?? 0) + 1;
  }

  saveDocument(data: Partial<ReportDocumentEntity>): Promise<ReportDocumentEntity> {
    return this.documents.save(this.documents.create(data));
  }

  latestDocument(reportId: string, format: ReportFormat): Promise<ReportDocumentEntity | null> {
    return this.documents.findOne({ where: { reportId, format }, order: { version: 'DESC' } });
  }

  async list(
    organizationId: string,
    filters: PaginationQueryDto & { assetId?: string },
  ): Promise<Paginated<ReportEntity>> {
    const qb = this.reports
      .createQueryBuilder('report')
      .innerJoinAndSelect('report.asset', 'asset')
      .innerJoinAndSelect('asset.establishment', 'establishment')
      .innerJoinAndSelect('asset.assetType', 'type')
      .leftJoinAndSelect('report.documents', 'documents')
      .where('report.organizationId = :organizationId', { organizationId })
      .orderBy('report.createdAt', 'DESC')
      .skip(toSkip(filters))
      .take(filters.pageSize);
    if (filters.assetId) qb.andWhere('report.assetId = :assetId', { assetId: filters.assetId });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }
}
