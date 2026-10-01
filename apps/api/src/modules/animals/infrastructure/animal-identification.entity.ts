import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import { AnimalEntity } from './animal.entity.js';

export type IdentificationMethod = 'RFID' | 'VISUAL' | 'TAG_OCR' | 'MANUAL';

@Entity('animal_identifications')
export class AnimalIdentificationEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  animalId: string;

  @ManyToOne(() => AnimalEntity, (animal) => animal.identifications)
  @JoinColumn({ name: 'animal_id' })
  animal?: Relation<AnimalEntity>;

  @Column({ type: 'varchar', length: 16 })
  method: IdentificationMethod;

  @Column({ type: 'varchar', length: 128 })
  identifier: string;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  confidence: number | null;

  @Column({ type: 'uuid', nullable: true })
  evidenceId: string | null;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;
}
