import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';

@Entity('refresh_tokens')
export class RefreshTokenEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedById: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;
}
