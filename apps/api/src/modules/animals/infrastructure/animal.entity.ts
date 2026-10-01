import { Column, Entity, OneToMany, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { AnimalIdentificationEntity } from './animal-identification.entity.js';

export type AnimalCategory =
  | 'VACA'
  | 'VAQUILLONA'
  | 'TERNERO'
  | 'TERNERA'
  | 'NOVILLO'
  | 'NOVILLITO'
  | 'TORO';

/** Identidad individual del animal (capacidad de fase 4; el MVP no depende de ella). */
@Entity('animals')
export class AnimalEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;

  @Column({ type: 'varchar', length: 32 })
  officialTag: string;

  @Column({ type: 'varchar', length: 16, default: 'BOVINE' })
  species: 'BOVINE' | 'OVINE' | 'PORCINE' | 'EQUINE';

  @Column({ type: 'varchar', length: 24 })
  category: AnimalCategory;

  @Column({ type: 'varchar', length: 48, nullable: true })
  breed: string | null;

  @Column({ type: 'char', length: 1 })
  sex: 'M' | 'H';

  @Column({ type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: 'ACTIVE' | 'SOLD' | 'DEAD' | 'MISSING';

  @OneToMany(() => AnimalIdentificationEntity, (identification) => identification.animal)
  identifications?: Relation<AnimalIdentificationEntity[]>;
}
