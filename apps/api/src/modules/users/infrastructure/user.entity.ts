import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { OrganizationEntity } from '../../organizations/infrastructure/organization.entity.js';
import { RoleEntity } from './role.entity.js';

export type UserStatus = 'ACTIVE' | 'DISABLED';

@Entity('users')
export class UserEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organization_id' })
  organization?: Relation<OrganizationEntity>;

  @Column({ type: 'uuid' })
  roleId: string;

  @ManyToOne(() => RoleEntity)
  @JoinColumn({ name: 'role_id' })
  role?: Relation<RoleEntity>;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 160 })
  fullName: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: UserStatus;

  @Column({ type: 'integer', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
