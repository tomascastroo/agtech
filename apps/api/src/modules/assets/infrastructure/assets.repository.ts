import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository, type EntityManager } from 'typeorm';
import {
  toSkip,
  type Paginated,
  type PaginationQueryDto,
} from '../../../common/pagination/pagination.js';
import type { AssetStatus } from '../domain/asset.types.js';
import { AssetMetadataEntity } from './asset-metadata.entity.js';
import { AssetTypeEntity } from './asset-type.entity.js';
import { AssetEntity } from './asset.entity.js';
import { GuaranteeEntity } from './guarantee.entity.js';

export interface AssetListFilters extends PaginationQueryDto {
  status?: AssetStatus;
  assetTypeCode?: string;
  establishmentId?: string;
  search?: string;
}

export interface AssetListRow {
  asset: AssetEntity;
  openAlerts: number;
  highestAlertSeverity: 'INFO' | 'WARNING' | 'CRITICAL' | null;
  guaranteeActive: boolean;
}

@Injectable()
export class AssetsRepository {
  constructor(
    @InjectRepository(AssetEntity) private readonly assets: Repository<AssetEntity>,
    @InjectRepository(AssetTypeEntity) private readonly types: Repository<AssetTypeEntity>,
    @InjectRepository(AssetMetadataEntity)
    private readonly metadata: Repository<AssetMetadataEntity>,
    @InjectRepository(GuaranteeEntity) private readonly guarantees: Repository<GuaranteeEntity>,
    private readonly dataSource: DataSource,
  ) {}

  activeTypes(): Promise<AssetTypeEntity[]> {
    return this.types.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
  }

  typeByCode(code: string): Promise<AssetTypeEntity | null> {
    return this.types.findOneBy({ code, isActive: true });
  }

  findById(
    organizationId: string,
    id: string,
    manager?: EntityManager,
  ): Promise<AssetEntity | null> {
    const repo = manager?.getRepository(AssetEntity) ?? this.assets;
    return repo.findOne({
      where: { id, organizationId },
      relations: { assetType: true, establishment: { locations: true } },
    });
  }

  async list(organizationId: string, filters: AssetListFilters): Promise<Paginated<AssetListRow>> {
    const qb = this.assets
      .createQueryBuilder('asset')
      .innerJoinAndSelect('asset.assetType', 'type')
      .innerJoinAndSelect('asset.establishment', 'establishment')
      .where('asset.organizationId = :organizationId', { organizationId })
      .orderBy('establishment.name', 'ASC')
      .addOrderBy('asset.name', 'ASC')
      .skip(toSkip(filters))
      .take(filters.pageSize);
    if (filters.status) qb.andWhere('asset.status = :status', { status: filters.status });
    if (filters.assetTypeCode) qb.andWhere('type.code = :code', { code: filters.assetTypeCode });
    if (filters.establishmentId) {
      qb.andWhere('asset.establishmentId = :eid', { eid: filters.establishmentId });
    }
    if (filters.search) {
      const term = `%${filters.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('asset.name ILIKE :term', { term }).orWhere('establishment.name ILIKE :term', {
            term,
          });
        }),
      );
    }
    const [assets, total] = await qb.getManyAndCount();
    const stats = await this.alertAndGuaranteeStats(assets.map((a) => a.id));
    return {
      items: assets.map((asset) => ({
        asset,
        openAlerts: stats.get(asset.id)?.openAlerts ?? 0,
        highestAlertSeverity: stats.get(asset.id)?.highest ?? null,
        guaranteeActive: stats.get(asset.id)?.guarantee ?? false,
      })),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  private async alertAndGuaranteeStats(assetIds: string[]) {
    const result = new Map<
      string,
      { openAlerts: number; highest: AssetListRow['highestAlertSeverity']; guarantee: boolean }
    >();
    if (assetIds.length === 0) return result;
    const rows: { id: string; open_alerts: number; highest: string | null; guarantee: boolean }[] =
      await this.dataSource.query(
        `SELECT a.id,
                (SELECT count(*) FROM alerts al WHERE al.asset_id = a.id AND al.status NOT IN ('RESOLVED','DISMISSED'))::int AS open_alerts,
                (SELECT al.severity FROM alerts al WHERE al.asset_id = a.id AND al.status NOT IN ('RESOLVED','DISMISSED')
                  ORDER BY CASE al.severity WHEN 'CRITICAL' THEN 3 WHEN 'WARNING' THEN 2 ELSE 1 END DESC LIMIT 1) AS highest,
                EXISTS (SELECT 1 FROM guarantees g WHERE g.asset_id = a.id AND g.status = 'ACTIVE') AS guarantee
           FROM assets a WHERE a.id = ANY($1::uuid[])`,
        [assetIds],
      );
    for (const row of rows) {
      result.set(row.id, {
        openAlerts: row.open_alerts,
        highest: row.highest as AssetListRow['highestAlertSeverity'],
        guarantee: row.guarantee,
      });
    }
    return result;
  }

  latestMetadata(assetId: string, manager?: EntityManager): Promise<AssetMetadataEntity | null> {
    const repo = manager?.getRepository(AssetMetadataEntity) ?? this.metadata;
    return repo.findOne({ where: { assetId }, order: { version: 'DESC' } });
  }

  async appendMetadata(
    asset: AssetEntity,
    data: Record<string, unknown>,
    userId: string | null,
    manager: EntityManager,
  ): Promise<AssetMetadataEntity> {
    const latest = await this.latestMetadata(asset.id, manager);
    const repo = manager.getRepository(AssetMetadataEntity);
    return repo.save(
      repo.create({
        organizationId: asset.organizationId,
        assetId: asset.id,
        version: (latest?.version ?? 0) + 1,
        data,
        createdBy: userId,
      }),
    );
  }

  activeGuarantee(assetId: string): Promise<GuaranteeEntity | null> {
    return this.guarantees.findOneBy({ assetId, status: 'ACTIVE' });
  }
}
