import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';

/**
 * Identidad individual por caravana electrónica (RFID) dentro de la organización. La crea una
 * captura CONFIRMADA de Manga + RFID. La identidad es la caravana: no hay reconocimiento visual.
 * Lecturas SIMULADAS y REALES no se mezclan (registros distintos, marcados).
 */
@Entity('bovine_individuals')
export class BovineIndividualEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;

  @Column({ type: 'varchar', length: 16 })
  internalCode: string;

  @Column({ type: 'varchar', length: 32 })
  electronicId: string;

  @Column({ type: 'uuid', nullable: true })
  animalId: string | null;

  @Column({ type: 'boolean' })
  simulated: boolean;

  @Column({ type: 'timestamptz' })
  firstIdentifiedAt: Date;

  @Column({ type: 'timestamptz' })
  lastIdentifiedAt: Date;

  @Column({ type: 'integer', default: 1 })
  confirmations: number;
}
