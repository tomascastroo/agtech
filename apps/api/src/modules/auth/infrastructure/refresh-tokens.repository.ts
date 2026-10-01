import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, type EntityManager } from 'typeorm';
import { RefreshTokenEntity } from './refresh-token.entity.js';

@Injectable()
export class RefreshTokensRepository {
  constructor(
    @InjectRepository(RefreshTokenEntity) private readonly tokens: Repository<RefreshTokenEntity>,
  ) {}

  findByHash(tokenHash: string, manager?: EntityManager): Promise<RefreshTokenEntity | null> {
    const repo = manager?.getRepository(RefreshTokenEntity) ?? this.tokens;
    return repo.findOne({
      where: { tokenHash },
      lock: manager ? { mode: 'pessimistic_write' } : undefined,
    });
  }

  create(data: Partial<RefreshTokenEntity>, manager?: EntityManager): Promise<RefreshTokenEntity> {
    const repo = manager?.getRepository(RefreshTokenEntity) ?? this.tokens;
    return repo.save(repo.create(data));
  }

  async revoke(id: string, replacedById: string | null, manager?: EntityManager): Promise<void> {
    const repo = manager?.getRepository(RefreshTokenEntity) ?? this.tokens;
    await repo.update({ id, revokedAt: IsNull() }, { revokedAt: new Date(), replacedById });
  }

  async revokeFamily(familyId: string, manager?: EntityManager): Promise<void> {
    const repo = manager?.getRepository(RefreshTokenEntity) ?? this.tokens;
    await repo.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
