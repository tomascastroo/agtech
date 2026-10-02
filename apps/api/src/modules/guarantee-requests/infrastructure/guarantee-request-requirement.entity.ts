import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import type { Obligation } from '../../documents/domain/document-requirements.js';

/**
 * Requisito documental de una solicitud, copiado del producto de crédito al crearla. La entidad
 * puede marcarlo como NO APLICA (queda registrado quién y por qué). El estado (pendiente,
 * consistente, etc.) no se guarda: se calcula de los documentos y su análisis.
 */
@Entity('guarantee_request_requirements')
export class GuaranteeRequestRequirementEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  guaranteeRequestId: string;

  @Column({ type: 'varchar', length: 48 })
  requirementCode: string;

  @Column({ type: 'varchar', length: 16 })
  obligation: Obligation;

  @Column({ type: 'varchar', length: 200, nullable: true })
  condition: string | null;

  @Column({ type: 'boolean', default: false })
  notApplicable: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;
}
