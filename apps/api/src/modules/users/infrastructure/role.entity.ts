import { Column, CreateDateColumn, Entity, JoinTable, ManyToMany, type Relation } from 'typeorm';
import { UuidEntity } from '../../../database/base.entity.js';
import { PermissionEntity } from './permission.entity.js';

@Entity('roles')
export class RoleEntity extends UuidEntity {
  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @ManyToMany(() => PermissionEntity)
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'permission_id' },
  })
  permissions: Relation<PermissionEntity[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
