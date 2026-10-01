import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';

export type InformationRequestKind = 'DOCUMENT' | 'EVIDENCE';

/**
 * Pedido de información adicional de la entidad o AgroGarantías al productor. Lo que el
 * productor aporta queda como evidencia/documentación nueva: la declaración no se modifica.
 */
@Entity('information_requests')
export class InformationRequestEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  guaranteeRequestId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: InformationRequestKind;

  @Column({ type: 'varchar', length: 32, nullable: true })
  documentType: string | null;

  @Column({ type: 'varchar', length: 500 })
  message: string;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status: 'OPEN' | 'RESPONDED';

  @Column({ type: 'uuid' })
  requestedBy: string;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;
}
