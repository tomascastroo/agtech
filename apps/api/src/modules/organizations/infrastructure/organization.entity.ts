import { Column, DeleteDateColumn, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';

export type OrganizationKind = 'BANK' | 'INSURER' | 'WARRANT_COMPANY' | 'PRODUCER' | 'OTHER';

export interface OrganizationSettings {
  scoring?: { weights?: Record<string, number> };
}

@Entity('organizations')
export class OrganizationEntity extends TimestampedEntity {
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  legalName: string | null;

  @Column({ type: 'varchar', length: 13, nullable: true })
  taxId: string | null;

  @Column({ type: 'varchar', length: 24 })
  kind: OrganizationKind;

  @Column({ type: 'jsonb', default: {} })
  settings: OrganizationSettings;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
