import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { RequestContext } from '../../../common/auth/decorators.js';
import { NotFoundError, ValidationFailedError } from '../../../common/domain/errors.js';
import { point } from '../../../common/geo/geojson.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import { classifyReading, formatEid, normalizeEid, type RfidSource } from '../domain/rfid.js';
import { RfidObservationEntity } from '../infrastructure/rfid-observation.entity.js';

export interface RfidReadingInput {
  electronicId: string;
  observedAt: string;
  latitude?: number;
  longitude?: number;
  confidence?: number;
  rawPayload?: Record<string, unknown>;
}

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Ingesta de lecturas RFID enviadas por el puente del lector (app móvil/Android). Cada lectura se
 * guarda cruda y se asocia, si el EID es conocido, al animal y su establecimiento. La API no
 * habla con el lector: no hay Web Bluetooth ni drivers en el navegador.
 */
@Injectable()
export class RfidService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly assets: AssetsRepository,
    private readonly audit: AuditService,
  ) {}

  async ingest(
    user: AuthenticatedUser,
    assetId: string,
    input: { readerDeviceId?: string; readings: RfidReadingInput[] },
    context: RequestContext,
    source: RfidSource = 'READER_BRIDGE',
  ) {
    const asset = await this.assets.findById(user.organizationId, assetId);
    if (!asset) throw new NotFoundError('Activo', assetId);
    if (input.readerDeviceId) {
      const [reader] = (await this.dataSource.query(
        `SELECT id FROM devices WHERE id = $1 AND organization_id = $2 AND type = 'RFID_READER'`,
        [input.readerDeviceId, user.organizationId],
      )) as { id: string }[];
      if (!reader)
        throw new ValidationFailedError('El lector indicado no es un lector RFID registrado');
    }

    const rows = await this.record(
      user.organizationId,
      asset,
      input.readings,
      source,
      input.readerDeviceId ?? null,
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.RFID_OBSERVATIONS_INGESTED,
      resourceType: 'asset',
      resourceId: asset.id,
      metadata: { count: rows.length, source, readerDeviceId: input.readerDeviceId ?? null },
      context,
    });
    return {
      received: rows.length,
      identified: rows.filter((r) => r.status === 'IDENTIFIED').length,
      unknown: rows.filter((r) => r.status === 'UNKNOWN_TAG').length,
      otherEstablishment: rows.filter((r) => r.status === 'OTHER_ESTABLISHMENT').length,
    };
  }

  /**
   * Valida, clasifica y guarda lecturas (append-only). La usan la ingesta del puente del lector
   * y el procesamiento de Manga + RFID, para que ambas apliquen las mismas reglas.
   */
  async record(
    organizationId: string,
    asset: { id: string; establishmentId: string },
    readings: RfidReadingInput[],
    source: RfidSource,
    readerDeviceId: string | null,
    manager?: EntityManager,
  ): Promise<RfidObservationEntity[]> {
    const rows: Partial<RfidObservationEntity>[] = [];
    for (const reading of readings) {
      const eid = normalizeEid(reading.electronicId);
      if (!eid)
        throw new ValidationFailedError(`EID inválido: ${reading.electronicId.slice(0, 40)}`);
      const observedAt = new Date(reading.observedAt);
      if (
        Number.isNaN(observedAt.getTime()) ||
        observedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS
      )
        throw new ValidationFailedError('Fecha de lectura inválida');
      const animal = await this.animalByEid(organizationId, eid);
      rows.push({
        organizationId,
        electronicId: eid,
        readerDeviceId,
        establishmentId: asset.establishmentId,
        assetId: asset.id,
        animalId: animal?.id ?? null,
        observedAt,
        location:
          reading.latitude !== undefined && reading.longitude !== undefined
            ? point(reading.longitude, reading.latitude)
            : null,
        source,
        rawPayload: reading.rawPayload ?? {},
        confidence: reading.confidence ?? null,
        status: classifyReading(animal, asset.establishmentId),
      });
    }
    const repo = (manager ?? this.dataSource.manager).getRepository(RfidObservationEntity);
    return repo.save(rows.map((r) => repo.create(r)));
  }

  /**
   * Simulación para la demo: genera lecturas SIMULADAS de caravanas registradas del activo (y una
   * desconocida) como si llegaran del puente. Quedan marcadas source=SIMULATED.
   */
  async simulate(user: AuthenticatedUser, assetId: string, context: RequestContext) {
    const tags = (await this.dataSource.query(
      `SELECT ai.identifier FROM animal_identifications ai JOIN animals a ON a.id = ai.animal_id
        WHERE a.organization_id = $1 AND a.asset_id = $2 AND ai.method = 'RFID'
        ORDER BY random() LIMIT 8`,
      [user.organizationId, assetId],
    )) as { identifier: string }[];
    const now = Date.now();
    const unknown = `032 0000 9${String(now % 1000).padStart(3, '0')} ${String(now % 10_000).padStart(4, '0')}`;
    const readings = [...tags.map((t) => t.identifier), unknown].map((electronicId, i) => ({
      electronicId,
      observedAt: new Date(now - i * 45_000).toISOString(),
      confidence: 1,
      rawPayload: { simulated: true, generator: 'agrogarantias-demo', raw: electronicId },
    }));
    return this.ingest(user, assetId, { readings }, context, 'SIMULATED');
  }

  async latest(organizationId: string, assetId: string, limit = 20) {
    const [rows, [summary]] = await Promise.all([
      this.dataSource.query(
        `SELECT o.id, o.electronic_id AS "electronicId", o.observed_at AS "observedAt",
                o.status, o.source, o.confidence::float AS confidence,
                e.name AS "establishmentName", a.official_tag AS "officialTag",
                d.serial_number AS "readerSerial",
                ST_AsGeoJSON(o.location)::json AS location
           FROM rfid_observations o
           JOIN establishments e ON e.id = o.establishment_id
           LEFT JOIN animals a ON a.id = o.animal_id
           LEFT JOIN devices d ON d.id = o.reader_device_id
          WHERE o.organization_id = $1 AND o.asset_id = $2
          ORDER BY o.observed_at DESC LIMIT $3`,
        [organizationId, assetId, limit],
      ) as Promise<Record<string, unknown>[]>,
      this.dataSource.query(
        `SELECT count(DISTINCT electronic_id)::int AS "uniqueTags",
                count(DISTINCT electronic_id) FILTER (WHERE status = 'IDENTIFIED')::int AS "identifiedTags",
                count(*)::int AS readings,
                bool_or(source = 'SIMULATED') AS "anySimulated",
                max(observed_at) AS "lastReadingAt"
           FROM rfid_observations
          WHERE organization_id = $1 AND asset_id = $2 AND observed_at > now() - interval '30 days'`,
        [organizationId, assetId],
      ) as Promise<Record<string, unknown>[]>,
    ]);
    return {
      readings: rows.map((r) => ({ ...r, electronicId: formatEid(String(r.electronicId)) })),
      last30Days: summary,
    };
  }

  /** Animal registrado con esa caravana en la organización (null si no está registrado). */
  async animalByEid(organizationId: string, eid: string) {
    const [row] = (await this.dataSource.query(
      `SELECT a.id, a.establishment_id AS "establishmentId"
         FROM animal_identifications ai JOIN animals a ON a.id = ai.animal_id
        WHERE ai.organization_id = $1 AND ai.method = 'RFID'
          AND regexp_replace(ai.identifier, '[^0-9]', '', 'g') = $2
        LIMIT 1`,
      [organizationId, eid],
    )) as { id: string; establishmentId: string }[];
    return row ?? null;
  }
}
