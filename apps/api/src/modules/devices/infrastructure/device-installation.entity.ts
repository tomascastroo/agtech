import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import type { GeoPoint } from '../../../common/geo/geojson.js';
import type {
  InstallationRequestType,
  InstallationStatus,
  KitSpec,
} from '../domain/device.types.js';
import { DeviceEntity } from './device.entity.js';

@Entity('device_installations')
export class DeviceInstallationEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @ManyToOne(() => DeviceEntity)
  @JoinColumn({ name: 'device_id' })
  device?: Relation<DeviceEntity> | null;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;

  @Column({ type: 'varchar', length: 16 })
  requestType: InstallationRequestType;

  @Column({ type: 'varchar', length: 16 })
  status: InstallationStatus;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: GeoPoint | null;

  @Column({ type: 'jsonb', nullable: true })
  kitSpec: KitSpec | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shippingAddress: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  contactPhone: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  installedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  removedAt: Date | null;
}
