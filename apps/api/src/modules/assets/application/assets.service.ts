import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import {
  ForbiddenActionError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain/errors.js';
import { toMultiPolygon } from '../../../common/geo/geo-validation.js';
import { point, type GeoMultiPolygon } from '../../../common/geo/geojson.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { EstablishmentsRepository } from '../../establishments/infrastructure/establishments.repository.js';
import { MonitoringConfigService } from '../../monitoring/application/monitoring-config.service.js';
import { defaultMaxEvidenceAgeHours } from '../domain/asset-status.js';
import type { Currency, QuantityUnit } from '../domain/asset.types.js';
import { MetadataValidator } from '../domain/metadata-validator.js';
import type { AssetTypeEntity } from '../infrastructure/asset-type.entity.js';
import { AssetEntity } from '../infrastructure/asset.entity.js';
import { AssetsRepository, type AssetListFilters } from '../infrastructure/assets.repository.js';

export interface CreateAssetCommand {
  establishmentId: string;
  assetTypeCode: string;
  name: string;
  declaredQuantity: number;
  declaredValue?: number;
  currency?: Currency;
  location?: { latitude: number; longitude: number };
  area?: unknown;
  metadata?: Record<string, unknown>;
}

export interface UpdateAssetCommand {
  name?: string;
  declaredQuantity?: number;
  declaredValue?: number | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AssetsService {
  private readonly validator = new MetadataValidator();

  constructor(
    private readonly assets: AssetsRepository,
    private readonly establishments: EstablishmentsRepository,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly monitoring: MonitoringConfigService,
  ) {}

  types(): Promise<AssetTypeEntity[]> {
    return this.assets.activeTypes();
  }

  list(organizationId: string, filters: AssetListFilters) {
    return this.assets.list(organizationId, filters);
  }

  async get(organizationId: string, id: string) {
    const asset = await this.assets.findById(organizationId, id);
    if (!asset) throw new NotFoundError('Activo', id);
    const [metadata, guarantee] = await Promise.all([
      this.assets.latestMetadata(asset.id),
      this.assets.activeGuarantee(asset.id),
    ]);
    return { asset, metadata, guarantee };
  }

  async create(user: AuthenticatedUser, command: CreateAssetCommand, context: RequestContext) {
    const establishment = await this.establishments.findById(
      user.organizationId,
      command.establishmentId,
    );
    if (!establishment) throw new NotFoundError('Establecimiento', command.establishmentId);
    const type = await this.assets.typeByCode(command.assetTypeCode);
    if (!type)
      throw new ValidationFailedError('Tipo de activo inexistente', {
        code: command.assetTypeCode,
      });

    const metadata = command.metadata ?? {};
    this.assertMetadata(type, metadata);

    const main = establishment.locations?.find((l) => l.kind === 'MAIN');
    const location = command.location
      ? point(command.location.longitude, command.location.latitude)
      : main?.point;
    if (!location) throw new ValidationFailedError('El activo requiere una ubicación');

    let area: GeoMultiPolygon | null = null;
    if (command.area) {
      area = toMultiPolygon(command.area);
      if (!(await this.establishments.isValidGeometry(area))) {
        throw new ValidationFailedError('El polígono del activo no es una geometría válida');
      }
    }
    if (type.verificationStrategy === 'VEGETATION_AREA' && !area) {
      throw new ValidationFailedError(
        'Este tipo de activo requiere delimitar la superficie en el mapa',
      );
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AssetEntity);
      const asset = await repo.save(
        repo.create({
          organizationId: user.organizationId,
          establishmentId: establishment.id,
          assetTypeId: type.id,
          name: command.name.trim(),
          status: 'DRAFT',
          declaredQuantity: command.declaredQuantity,
          unit: type.defaultUnit as QuantityUnit,
          declaredValue: command.declaredValue ?? null,
          currency: command.currency ?? 'USD',
          location,
          area,
          createdBy: user.userId,
        }),
      );
      await this.assets.appendMetadata(asset, metadata, user.userId, manager);
      await this.monitoring.createDefault(user.organizationId, asset.id, manager, {
        maxEvidenceAgeHours: defaultMaxEvidenceAgeHours(type.verificationStrategy),
      });
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.ASSET_CREATED,
          resourceType: 'asset',
          resourceId: asset.id,
          metadata: { type: type.code, declaredQuantity: asset.declaredQuantity, unit: asset.unit },
          context,
        },
        manager,
      );
      return asset;
    });
    return this.get(user.organizationId, created.id);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    command: UpdateAssetCommand,
    context: RequestContext,
  ) {
    const asset = await this.assets.findById(user.organizationId, id);
    if (!asset || !asset.assetType) throw new NotFoundError('Activo', id);
    // La declaración del productor (solicitud de garantía) no puede editarla la entidad.
    const [declared] = (await this.dataSource.query(
      'SELECT 1 FROM guarantee_requests WHERE asset_id = $1 LIMIT 1',
      [asset.id],
    )) as unknown[];
    if (declared) {
      throw new ForbiddenActionError(
        'El activo fue declarado por el productor en una solicitud de garantía: no puede editarse',
      );
    }
    if (command.metadata) this.assertMetadata(asset.assetType, command.metadata);

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AssetEntity);
      const patch: Partial<Pick<AssetEntity, 'name' | 'declaredQuantity' | 'declaredValue'>> = {};
      if (command.name !== undefined && command.name.trim() !== asset.name) {
        changes.name = { from: asset.name, to: command.name.trim() };
        patch.name = command.name.trim();
      }
      if (
        command.declaredQuantity !== undefined &&
        command.declaredQuantity !== asset.declaredQuantity
      ) {
        changes.declaredQuantity = { from: asset.declaredQuantity, to: command.declaredQuantity };
        patch.declaredQuantity = command.declaredQuantity;
      }
      if (command.declaredValue !== undefined && command.declaredValue !== asset.declaredValue) {
        changes.declaredValue = { from: asset.declaredValue, to: command.declaredValue };
        patch.declaredValue = command.declaredValue;
      }
      if (Object.keys(patch).length > 0) await repo.update({ id: asset.id }, patch);
      if (command.metadata) {
        const version = await this.assets.appendMetadata(
          asset,
          command.metadata,
          user.userId,
          manager,
        );
        changes.metadataVersion = { from: version.version - 1, to: version.version };
      }
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            actor: { kind: 'user', user },
            action: AUDIT_ACTIONS.ASSET_UPDATED,
            resourceType: 'asset',
            resourceId: asset.id,
            metadata: { changes },
            context,
          },
          manager,
        );
      }
    });
    return this.get(user.organizationId, id);
  }

  private assertMetadata(type: AssetTypeEntity, metadata: Record<string, unknown>): void {
    const result = this.validator.validate(
      `${type.id}:${type.updatedAt.getTime()}`,
      type.metadataSchema,
      metadata,
    );
    if (!result.valid) {
      throw new ValidationFailedError('La información del activo es inválida', {
        fields: result.errors,
      });
    }
  }
}
