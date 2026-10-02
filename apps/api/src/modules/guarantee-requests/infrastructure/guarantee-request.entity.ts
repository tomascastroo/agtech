import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';

/**
 * Estado de la solicitud desde la perspectiva del productor. El resultado de la verificación
 * no se duplica aquí: se lee de verification_runs/verification_results del activo.
 */
export type GuaranteeRequestStatus = 'INVITED' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION';

/** Solicitud de garantía creada por la entidad financiera y completada por el productor. */
@Entity('guarantee_requests')
export class GuaranteeRequestEntity extends TimestampedEntity {
  /** Organización solicitante (banco / aseguradora): dueña de los datos (multi-tenancy). */
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 160 })
  producerName: string;

  @Column({ type: 'varchar', length: 13 })
  producerTaxId: string;

  @Column({ type: 'varchar', length: 254, nullable: true })
  producerEmail: string | null;

  /** Usuario del productor (rol PRODUCER, sin contraseña): accede solo mediante el link. */
  @Column({ type: 'uuid' })
  producerUserId: string;

  @Column({ type: 'varchar', length: 32 })
  assetTypeCode: string;

  @Column({
    type: 'numeric',
    precision: 16,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  requestedAmount: number | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 24, default: 'INVITED' })
  status: GuaranteeRequestStatus;

  /** SHA-256 del token del link (el token en claro solo se muestra al generarlo). */
  @Column({ type: 'char', length: 64, select: false })
  inviteTokenHash: string;

  @Column({ type: 'timestamptz' })
  inviteExpiresAt: Date;

  @Column({ type: 'uuid', nullable: true })
  establishmentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  verificationRunId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /** Invitación aceptada: el productor creó su acceso y el link deja de servir como credencial. */
  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  /** Producto de crédito elegido por la entidad (define el checklist documental). */
  @Column({ type: 'varchar', length: 48, nullable: true })
  creditProductCode: string | null;

  /** REAL o DEMO ("Simular solicitud": datos ficticios, mismos modelos y servicios). */
  @Column({ type: 'varchar', length: 8, default: 'REAL' })
  dataSource: 'REAL' | 'DEMO';

  @Column({ type: 'varchar', length: 32, nullable: true })
  demoScenario: string | null;
}
