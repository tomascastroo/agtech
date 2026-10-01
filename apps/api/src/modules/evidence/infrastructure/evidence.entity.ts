import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';
import type { GeoPoint } from '../../../common/geo/geojson.js';
import type { EvidenceType } from '../domain/evidence.types.js';
import { EvidenceSourceEntity } from './evidence-source.entity.js';

/** Evidencia: registro inmutable (append-only, protegido por trigger en la base). */
@Entity('evidence')
export class EvidenceEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @Column({ type: 'uuid' })
  sourceId: string;

  @ManyToOne(() => EvidenceSourceEntity)
  @JoinColumn({ name: 'source_id' })
  source?: Relation<EvidenceSourceEntity>;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  satelliteImageId: string | null;

  @Column({ type: 'varchar', length: 24 })
  type: EvidenceType;

  @Column({ type: 'varchar', length: 512, nullable: true })
  storageKey: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType: string | null;

  @Column({
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  sizeBytes: number | null;

  @Column({ type: 'char', length: 64, nullable: true })
  sha256: string | null;

  @Column({ type: 'timestamptz' })
  capturedAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: GeoPoint | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy: string | null;
}
