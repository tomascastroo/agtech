import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import type { GeoPolygon } from '../../../common/geo/geojson.js';

@Entity('satellite_images')
export class SatelliteImageEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 48 })
  provider: string;

  @Column({ type: 'varchar', length: 64 })
  collection: string;

  @Column({ type: 'varchar', length: 160 })
  sceneId: string;

  @Column({ type: 'timestamptz' })
  acquiredAt: Date;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  cloudCoverPct: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, transformer: numericTransformer })
  resolutionM: number;

  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326, nullable: true })
  footprint: GeoPolygon | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  bands: string[];

  @Column({ type: 'varchar', length: 512, nullable: true })
  previewStorageKey: string | null;

  @Column({ type: 'boolean', default: false })
  isSimulated: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}
