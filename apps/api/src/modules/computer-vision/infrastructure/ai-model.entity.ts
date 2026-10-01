import { Column, CreateDateColumn, Entity, OneToMany, type Relation } from 'typeorm';
import { UuidEntity } from '../../../database/base.entity.js';
import { AiModelVersionEntity } from './ai-model-version.entity.js';

export type AiModelTask =
  | 'ANIMAL_COUNTING'
  | 'OBJECT_DETECTION'
  | 'CHANGE_DETECTION'
  | 'VEGETATION_INDEX'
  | 'IMAGE_QUALITY'
  | 'INDIVIDUAL_ID'
  | 'SCORING';

@Entity('ai_models')
export class AiModelEntity extends UuidEntity {
  @Column({ type: 'varchar', length: 64, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  task: AiModelTask;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => AiModelVersionEntity, (version) => version.model)
  versions?: Relation<AiModelVersionEntity[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
