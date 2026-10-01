import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { NotFoundError, ValidationFailedError } from '../../../common/domain/errors.js';
import { toMultiPolygon } from '../../../common/geo/geo-validation.js';
import { point, type GeoMultiPolygon } from '../../../common/geo/geojson.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { isValidCuit, type EstablishmentType, type Tenure } from '../domain/establishment.types.js';
import type { EstablishmentEntity } from '../infrastructure/establishment.entity.js';
import { EstablishmentsRepository } from '../infrastructure/establishments.repository.js';

export interface CreateEstablishmentCommand {
  name: string;
  holderName: string;
  holderTaxId: string;
  renspa?: string;
  establishmentType: EstablishmentType;
  tenure: Tenure;
  province: string;
  locality?: string;
  totalAreaHa?: number;
  location: { latitude: number; longitude: number };
  boundary?: unknown;
}

@Injectable()
export class EstablishmentsService {
  constructor(
    private readonly repository: EstablishmentsRepository,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  list(organizationId: string) {
    return this.repository.summaries(organizationId);
  }

  async get(organizationId: string, id: string): Promise<EstablishmentEntity> {
    const establishment = await this.repository.findById(organizationId, id);
    if (!establishment) throw new NotFoundError('Establecimiento', id);
    return establishment;
  }

  async create(
    user: AuthenticatedUser,
    command: CreateEstablishmentCommand,
    context: RequestContext,
  ): Promise<EstablishmentEntity> {
    if (!isValidCuit(command.holderTaxId)) {
      throw new ValidationFailedError('El CUIT del titular no es válido (dígito verificador)');
    }
    let boundary: GeoMultiPolygon | null = null;
    let totalAreaHa = command.totalAreaHa ?? null;
    if (command.boundary) {
      boundary = toMultiPolygon(command.boundary);
      if (!(await this.repository.isValidGeometry(boundary))) {
        throw new ValidationFailedError('El límite del establecimiento no es una geometría válida');
      }
      totalAreaHa ??= Math.round((await this.repository.areaHectares(boundary)) * 100) / 100;
    }

    const establishment = await this.dataSource.transaction(async (manager) => {
      const created = await this.repository.create(
        {
          organizationId: user.organizationId,
          name: command.name.trim(),
          holderName: command.holderName.trim(),
          holderTaxId: command.holderTaxId,
          renspa: command.renspa ?? null,
          establishmentType: command.establishmentType,
          tenure: command.tenure,
          province: command.province,
          locality: command.locality ?? null,
          totalAreaHa,
          createdBy: user.userId,
        },
        {
          name: 'Casco principal',
          point: point(command.location.longitude, command.location.latitude),
          boundary,
        },
        manager,
      );
      await this.audit.record(
        {
          actor: { kind: 'user', user },
          action: AUDIT_ACTIONS.ESTABLISHMENT_CREATED,
          resourceType: 'establishment',
          resourceId: created.id,
          metadata: { name: created.name, renspa: created.renspa },
          context,
        },
        manager,
      );
      return created;
    });
    return this.get(user.organizationId, establishment.id);
  }
}
