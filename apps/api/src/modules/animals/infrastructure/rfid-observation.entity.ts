import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { GeoPoint } from '../../../common/geo/geojson.js';
import { numericTransformer } from '../../../database/transformers.js';
import type { RfidSource, RfidStatus } from '../domain/rfid.js';

/** Lectura RFID cruda tal como llegó del lector (append-only). */
@Entity('rfid_observations')
export class RfidObservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 32 })
  electronicId: string;

  @Column({ type: 'uuid', nullable: true })
  readerDeviceId: string | null;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  animalId: string | null;

  @Column({ type: 'timestamptz' })
  observedAt: Date;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: GeoPoint | null;

  @Column({ type: 'varchar', length: 16 })
  source: RfidSource;

  @Column({ type: 'jsonb', default: {} })
  rawPayload: Record<string, unknown>;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  confidence: number | null;

  @Column({ type: 'varchar', length: 24 })
  status: RfidStatus;

  @Column({ type: 'timestamptz', insert: false, update: false, default: () => 'now()' })
  receivedAt: Date;
}
