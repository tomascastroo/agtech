import type { AssetMetadataEntity } from '../infrastructure/asset-metadata.entity.js';
import type { AssetTypeEntity } from '../infrastructure/asset-type.entity.js';
import type { AssetEntity } from '../infrastructure/asset.entity.js';
import type { GuaranteeEntity } from '../infrastructure/guarantee.entity.js';

export function presentAssetType(type: AssetTypeEntity) {
  return {
    id: type.id,
    code: type.code,
    name: type.name,
    category: type.category,
    defaultUnit: type.defaultUnit,
    verificationStrategy: type.verificationStrategy,
    evidenceSources: type.evidenceSources,
    requiredDocuments: type.requiredDocuments,
    metadataSchema: type.metadataSchema,
    mobility: type.mobility,
  };
}

export function presentAssetSummary(asset: AssetEntity) {
  return {
    id: asset.id,
    name: asset.name,
    status: asset.status,
    dataSource: asset.dataSource,
    declaredQuantity: asset.declaredQuantity,
    unit: asset.unit,
    declaredValue: asset.declaredValue,
    currency: asset.currency,
    location: asset.location,
    lastVerificationRunId: asset.lastVerificationRunId,
    lastVerifiedAt: asset.lastVerifiedAt,
    lastScore: asset.lastScore,
    lastDetectedQuantity: asset.lastDetectedQuantity,
    assetType: asset.assetType
      ? {
          code: asset.assetType.code,
          name: asset.assetType.name,
          category: asset.assetType.category,
        }
      : null,
    establishment: asset.establishment
      ? {
          id: asset.establishment.id,
          name: asset.establishment.name,
          province: asset.establishment.province,
          locality: asset.establishment.locality,
        }
      : null,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

export function presentAssetDetail(
  asset: AssetEntity,
  metadata: AssetMetadataEntity | null,
  guarantee: GuaranteeEntity | null,
) {
  const establishment = asset.establishment;
  const main = establishment?.locations?.find((l) => l.kind === 'MAIN');
  return {
    ...presentAssetSummary(asset),
    area: asset.area,
    assetType: asset.assetType ? presentAssetType(asset.assetType) : null,
    establishment: establishment
      ? {
          id: establishment.id,
          name: establishment.name,
          holderName: establishment.holderName,
          holderTaxId: establishment.holderTaxId,
          renspa: establishment.renspa,
          establishmentType: establishment.establishmentType,
          tenure: establishment.tenure,
          province: establishment.province,
          locality: establishment.locality,
          totalAreaHa: establishment.totalAreaHa,
          point: main?.point ?? null,
          boundary: main?.boundary ?? null,
        }
      : null,
    metadata: metadata
      ? { version: metadata.version, data: metadata.data, updatedAt: metadata.createdAt }
      : null,
    guarantee: guarantee
      ? {
          id: guarantee.id,
          status: guarantee.status,
          coveredQuantity: guarantee.coveredQuantity,
          valuation: guarantee.valuation,
          currency: guarantee.currency,
          confirmedAt: guarantee.confirmedAt,
          verificationRunId: guarantee.verificationRunId,
        }
      : null,
  };
}
