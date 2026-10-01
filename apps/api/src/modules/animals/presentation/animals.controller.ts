import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { AnimalObservationEntity } from '../infrastructure/animal-observation.entity.js';
import { AnimalEntity } from '../infrastructure/animal.entity.js';

/**
 * Identidad individual de animales (capacidad de fase 4). Asocia múltiples evidencias
 * (RFID, rasgos visuales, caravana) a un mismo animal. El MVP no depende de esta capacidad.
 */
@ApiTags('Identificación individual')
@Controller()
export class AnimalsController {
  constructor(
    @InjectRepository(AnimalEntity) private readonly animals: Repository<AnimalEntity>,
    @InjectRepository(AnimalObservationEntity)
    private readonly observations: Repository<AnimalObservationEntity>,
  ) {}

  @Get('assets/:assetId/animals')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiOperation({ summary: 'Animales identificados individualmente para el activo' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    const animals = await this.animals.find({
      where: { organizationId: user.organizationId, assetId },
      relations: { identifications: true },
      order: { officialTag: 'ASC' },
      take: 200,
    });
    const observations = animals.length
      ? await this.observations.find({
          where: { animalId: In(animals.map((a) => a.id)) },
          order: { observedAt: 'DESC' },
        })
      : [];
    const latest = new Map<string, AnimalObservationEntity>();
    for (const o of observations) if (!latest.has(o.animalId)) latest.set(o.animalId, o);
    return animals.map((a) => ({
      id: a.id,
      officialTag: a.officialTag,
      species: a.species,
      category: a.category,
      breed: a.breed,
      sex: a.sex,
      birthDate: a.birthDate,
      status: a.status,
      identifications: (a.identifications ?? []).map((i) => ({
        method: i.method,
        identifier: i.identifier,
        confidence: i.confidence,
        isPrimary: i.isPrimary,
      })),
      lastObservation: latest.get(a.id)
        ? {
            observedAt: latest.get(a.id)!.observedAt,
            method: latest.get(a.id)!.method,
            confidence: latest.get(a.id)!.confidence,
            location: latest.get(a.id)!.location,
          }
        : null,
    }));
  }
}
