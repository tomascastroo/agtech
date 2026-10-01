import { Column, Entity } from 'typeorm';
import { CreatedOnlyEntity } from '../../../database/base.entity.js';

/** Metadata específica por tipo de activo, versionada (cada cambio inserta una versión). */
@Entity('asset_metadata')
export class AssetMetadataEntity extends CreatedOnlyEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}
