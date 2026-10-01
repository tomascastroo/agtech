import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import type { GeoMultiPolygon, GeoPoint } from '../../../common/geo/geojson.js';
import type { LocationKind } from '../domain/establishment.types.js';
import { EstablishmentEntity } from './establishment.entity.js';

@Entity('establishment_locations')
export class EstablishmentLocationEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @ManyToOne(() => EstablishmentEntity, (establishment) => establishment.locations)
  @JoinColumn({ name: 'establishment_id' })
  establishment?: Relation<EstablishmentEntity>;

  @Column({ type: 'varchar', length: 16 })
  kind: LocationKind;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  point: GeoPoint;

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326, nullable: true })
  boundary: GeoMultiPolygon | null;
}
