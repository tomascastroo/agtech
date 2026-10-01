import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import type {
  Connectivity,
  DeviceStatus,
  DeviceType,
  PowerSource,
} from '../domain/device.types.js';

@Entity('devices')
export class DeviceEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 16 })
  type: DeviceType;

  @Column({ type: 'varchar', length: 64 })
  serialNumber: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  manufacturer: string | null;

  @Column({ type: 'varchar', length: 16 })
  connectivity: Connectivity;

  @Column({ type: 'varchar', length: 16 })
  powerSource: PowerSource;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: DeviceStatus;

  /** Adapter de integración que gestiona el dispositivo (p. ej. "simulated"). */
  @Column({ type: 'varchar', length: 32, default: 'simulated' })
  gateway: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  capabilities: string[];

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}
