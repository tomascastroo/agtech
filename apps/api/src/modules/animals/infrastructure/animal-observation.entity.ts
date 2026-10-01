import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import type { GeoPoint } from '../../../common/geo/geojson.js';
import type { IdentificationMethod } from './animal-identification.entity.js';

@Entity('animal_observations')
export class AnimalObservationEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  animalId: string;

  @Column({ type: 'uuid', nullable: true })
  evidenceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 16 })
  method: IdentificationMethod;

  @Column({ type: 'timestamptz' })
  observedAt: Date;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: GeoPoint | null;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  confidence: number | null;

  @Column({ type: 'jsonb', default: {} })
  attributes: Record<string, unknown>;
}
