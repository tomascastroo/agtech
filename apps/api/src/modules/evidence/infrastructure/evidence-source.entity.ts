import { Column, CreateDateColumn, Entity } from 'typeorm';
import { UuidEntity } from '../../../database/base.entity.js';
import type { EvidenceSourceKind } from '../domain/evidence.types.js';

@Entity('evidence_sources')
export class EvidenceSourceEntity extends UuidEntity {
  @Column({ type: 'varchar', length: 48, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 16 })
  kind: EvidenceSourceKind;

  @Column({ type: 'varchar', length: 80 })
  provider: string;

  @Column({ type: 'boolean', default: false })
  isSimulated: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
