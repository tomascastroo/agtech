import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository, type EntityManager } from 'typeorm';
import { EvidenceSourceEntity } from './evidence-source.entity.js';
import { EvidenceEntity } from './evidence.entity.js';

@Injectable()
export class EvidenceRepository {
  private readonly sourceCache = new Map<string, EvidenceSourceEntity>();

  constructor(
    @InjectRepository(EvidenceEntity) private readonly evidence: Repository<EvidenceEntity>,
    @InjectRepository(EvidenceSourceEntity)
    private readonly sources: Repository<EvidenceSourceEntity>,
  ) {}

  async sourceByCode(code: string): Promise<EvidenceSourceEntity> {
    const cached = this.sourceCache.get(code);
    if (cached) return cached;
    const source = await this.sources.findOneByOrFail({ code });
    this.sourceCache.set(code, source);
    return source;
  }

  async create(data: Partial<EvidenceEntity>, manager?: EntityManager): Promise<EvidenceEntity> {
    const repo = manager?.getRepository(EvidenceEntity) ?? this.evidence;
    return repo.save(repo.create(data));
  }

  findById(organizationId: string, id: string): Promise<EvidenceEntity | null> {
    return this.evidence.findOne({ where: { id, organizationId }, relations: { source: true } });
  }

  findByIds(organizationId: string, assetId: string, ids: string[]): Promise<EvidenceEntity[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.evidence
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.source', 'source')
      .where('e.organizationId = :organizationId AND e.assetId = :assetId', {
        organizationId,
        assetId,
      })
      .andWhere('e.id IN (:...ids)', { ids })
      .getMany();
  }

  listForAsset(organizationId: string, assetId: string, limit: number): Promise<EvidenceEntity[]> {
    return this.evidence.find({
      where: { organizationId, assetId },
      relations: { source: true },
      order: { capturedAt: 'DESC' },
      take: limit,
    });
  }

  /** Cargas manuales recientes, candidatas a ser analizadas en la próxima verificación. */
  recentByKind(assetId: string, sourceKind: string, since: Date): Promise<EvidenceEntity[]> {
    return this.evidence.find({
      where: { assetId, capturedAt: MoreThanOrEqual(since), source: { kind: sourceKind as never } },
      relations: { source: true },
      order: { capturedAt: 'DESC' },
      take: 50,
    });
  }

  async newestCapturedAt(assetId: string): Promise<Date | null> {
    const row = await this.evidence
      .createQueryBuilder('e')
      .select('max(e.capturedAt)', 'newest')
      .where('e.assetId = :assetId', { assetId })
      .getRawOne<{ newest: Date | null }>();
    return row?.newest ?? null;
  }
}
