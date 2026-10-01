import { Column, Entity } from 'typeorm';
import { UuidEntity } from '../../../database/base.entity.js';

@Entity('permissions')
export class PermissionEntity extends UuidEntity {
  @Column({ type: 'varchar', length: 64, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;
}
