import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import { AiModelEntity } from './ai-model.entity.js';

@Entity('ai_model_versions')
export class AiModelVersionEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  modelId: string;

  @ManyToOne(() => AiModelEntity, (model) => model.versions)
  @JoinColumn({ name: 'model_id' })
  model?: Relation<AiModelEntity>;

  @Column({ type: 'varchar', length: 32 })
  version: string;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: 'ACTIVE' | 'DEPRECATED' | 'EXPERIMENTAL';

  @Column({ type: 'boolean', default: false })
  isSimulated: boolean;

  @Column({ type: 'jsonb', default: {} })
  metrics: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  parameters: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;
}
