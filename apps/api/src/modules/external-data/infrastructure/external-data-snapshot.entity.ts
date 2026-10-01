import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';

export type SnapshotStatus = 'OK' | 'NOT_FOUND' | 'ERROR';

/** Copia inmutable de lo que respondió una fuente externa en el momento de la consulta. */
@Entity('external_data_snapshots')
export class ExternalDataSnapshotEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 48 })
  source: string;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ type: 'varchar', length: 32 })
  subjectType: string;

  @Column({ type: 'varchar', length: 128 })
  subjectRef: string;

  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  establishmentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  verificationRunId: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: SnapshotStatus;

  @Column({ type: 'boolean', default: false })
  isSimulated: boolean;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fetchedAt: Date;
}
