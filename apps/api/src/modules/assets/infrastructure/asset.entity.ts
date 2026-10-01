import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { numericTransformer } from '../../../database/transformers.js';
import type { GeoMultiPolygon, GeoPoint } from '../../../common/geo/geojson.js';
import { EstablishmentEntity } from '../../establishments/infrastructure/establishment.entity.js';
import type { AssetStatus, Currency, QuantityUnit } from '../domain/asset.types.js';
import { AssetTypeEntity } from './asset-type.entity.js';

@Entity('assets')
export class AssetEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  establishmentId: string;

  @ManyToOne(() => EstablishmentEntity)
  @JoinColumn({ name: 'establishment_id' })
  establishment?: Relation<EstablishmentEntity>;

  @Column({ type: 'uuid' })
  assetTypeId: string;

  @ManyToOne(() => AssetTypeEntity)
  @JoinColumn({ name: 'asset_type_id' })
  assetType?: Relation<AssetTypeEntity>;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 24, default: 'DRAFT' })
  status: AssetStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  declaredQuantity: number;

  @Column({ type: 'varchar', length: 16 })
  unit: QuantityUnit;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  declaredValue: number | null;

  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: Currency;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  location: GeoPoint;

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326, nullable: true })
  area: GeoMultiPolygon | null;

  @Column({ type: 'uuid', nullable: true })
  lastVerificationRunId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastVerifiedAt: Date | null;

  @Column({ type: 'smallint', nullable: true })
  lastScore: number | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  lastDetectedQuantity: number | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
