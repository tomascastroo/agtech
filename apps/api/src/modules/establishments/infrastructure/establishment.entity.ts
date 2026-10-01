import { Column, DeleteDateColumn, Entity, OneToMany, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import type { EstablishmentType, Tenure } from '../domain/establishment.types.js';
import { EstablishmentLocationEntity } from './establishment-location.entity.js';

@Entity('establishments')
export class EstablishmentEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 160 })
  holderName: string;

  @Column({ type: 'varchar', length: 13 })
  holderTaxId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  renspa: string | null;

  @Column({ type: 'varchar', length: 24 })
  establishmentType: EstablishmentType;

  @Column({ type: 'varchar', length: 16, default: 'OWNED' })
  tenure: Tenure;

  @Column({ type: 'varchar', length: 80 })
  province: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  locality: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  totalAreaHa: number | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @OneToMany(() => EstablishmentLocationEntity, (location) => location.establishment)
  locations?: Relation<EstablishmentLocationEntity[]>;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
