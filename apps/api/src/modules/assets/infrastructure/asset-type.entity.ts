import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import type {
  AssetCategory,
  Mobility,
  QuantityUnit,
  VerificationStrategyCode,
} from '../domain/asset.types.js';

/**
 * Tipo de activo. Agregar un tipo nuevo es una fila más: el esquema JSON de metadata, la
 * estrategia de verificación y los documentos requeridos son datos, no código.
 */
@Entity('asset_types')
export class AssetTypeEntity extends TimestampedEntity {
  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 24 })
  category: AssetCategory;

  @Column({ type: 'varchar', length: 16 })
  defaultUnit: QuantityUnit;

  @Column({ type: 'varchar', length: 32 })
  verificationStrategy: VerificationStrategyCode;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  evidenceSources: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  requiredDocuments: string[];

  @Column({ type: 'jsonb', default: {} })
  metadataSchema: Record<string, unknown>;

  @Column({ type: 'varchar', length: 8, default: 'LOW' })
  mobility: Mobility;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;
}
