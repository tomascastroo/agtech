import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';

@Entity('audit_logs')
export class AuditLogEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 8 })
  actorType: 'USER' | 'SYSTEM';

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 48 })
  resourceType: string;

  @Column({ type: 'uuid', nullable: true })
  resourceId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId: string | null;
}
