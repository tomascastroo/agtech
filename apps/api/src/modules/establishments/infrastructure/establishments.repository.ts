import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type EntityManager } from 'typeorm';
import type { GeoPoint } from '../../../common/geo/geojson.js';
import { EstablishmentLocationEntity } from './establishment-location.entity.js';
import { EstablishmentEntity } from './establishment.entity.js';

export interface EstablishmentSummaryRow {
  id: string;
  name: string;
  holderName: string;
  province: string;
  locality: string | null;
  establishmentType: string;
  renspa: string | null;
  totalAreaHa: number | null;
  point: GeoPoint | null;
  boundary: unknown;
  assetCount: number;
  openAlerts: number;
  criticalAlerts: number;
  lastVerifiedAt: Date | null;
  averageScore: number | null;
}

export interface GeofenceCheck {
  inside: boolean;
  distanceM: number;
}

@Injectable()
export class EstablishmentsRepository {
  constructor(
    @InjectRepository(EstablishmentEntity)
    private readonly establishments: Repository<EstablishmentEntity>,
    @InjectRepository(EstablishmentLocationEntity)
    private readonly locations: Repository<EstablishmentLocationEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findById(organizationId: string, id: string): Promise<EstablishmentEntity | null> {
    return this.establishments.findOne({
      where: { id, organizationId },
      relations: { locations: true },
    });
  }

  async mainLocation(establishmentId: string): Promise<EstablishmentLocationEntity | null> {
    return this.locations.findOne({ where: { establishmentId, kind: 'MAIN' } });
  }

  async summaries(organizationId: string): Promise<EstablishmentSummaryRow[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT e.id, e.name, e.holder_name, e.province, e.locality, e.establishment_type, e.renspa,
              e.total_area_ha,
              ST_AsGeoJSON(l.point)::json AS point,
              ST_AsGeoJSON(l.boundary)::json AS boundary,
              (SELECT count(*) FROM assets a WHERE a.establishment_id = e.id AND a.deleted_at IS NULL)::int AS asset_count,
              (SELECT count(*) FROM alerts al JOIN assets a ON a.id = al.asset_id
                 WHERE a.establishment_id = e.id AND al.status NOT IN ('RESOLVED','DISMISSED'))::int AS open_alerts,
              (SELECT count(*) FROM alerts al JOIN assets a ON a.id = al.asset_id
                 WHERE a.establishment_id = e.id AND al.status NOT IN ('RESOLVED','DISMISSED') AND al.severity = 'CRITICAL')::int AS critical_alerts,
              (SELECT max(a.last_verified_at) FROM assets a WHERE a.establishment_id = e.id AND a.deleted_at IS NULL) AS last_verified_at,
              (SELECT round(avg(a.last_score)) FROM assets a WHERE a.establishment_id = e.id AND a.deleted_at IS NULL)::int AS average_score
         FROM establishments e
         LEFT JOIN establishment_locations l ON l.establishment_id = e.id AND l.kind = 'MAIN'
        WHERE e.organization_id = $1 AND e.deleted_at IS NULL
        ORDER BY e.name`,
      [organizationId],
    );
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      holderName: r.holder_name as string,
      province: r.province as string,
      locality: (r.locality as string | null) ?? null,
      establishmentType: r.establishment_type as string,
      renspa: (r.renspa as string | null) ?? null,
      totalAreaHa: r.total_area_ha === null ? null : Number(r.total_area_ha),
      point: (r.point as GeoPoint | null) ?? null,
      boundary: r.boundary ?? null,
      assetCount: r.asset_count as number,
      openAlerts: r.open_alerts as number,
      criticalAlerts: r.critical_alerts as number,
      lastVerifiedAt: (r.last_verified_at as Date | null) ?? null,
      averageScore: (r.average_score as number | null) ?? null,
    }));
  }

  async create(
    establishment: Partial<EstablishmentEntity>,
    mainLocation: Partial<EstablishmentLocationEntity>,
    manager: EntityManager,
  ): Promise<EstablishmentEntity> {
    const saved = await manager
      .getRepository(EstablishmentEntity)
      .save(manager.getRepository(EstablishmentEntity).create(establishment));
    await manager.getRepository(EstablishmentLocationEntity).save(
      manager.getRepository(EstablishmentLocationEntity).create({
        ...mainLocation,
        organizationId: saved.organizationId,
        establishmentId: saved.id,
        kind: 'MAIN',
      }),
    );
    return saved;
  }

  /**
   * Existencias ganaderas declaradas en el establecimiento (todas sus hacienda vigentes): es la
   * base comparable con el registro oficial, que informa existencias por RENSPA y no por activo.
   */
  async livestockDeclaredTotal(establishmentId: string): Promise<number> {
    const [row] = (await this.dataSource.query(
      `SELECT COALESCE(SUM(a.declared_quantity), 0)::float AS total
         FROM assets a
         JOIN asset_types t ON t.id = a.asset_type_id
        WHERE a.establishment_id = $1
          AND t.category = 'LIVESTOCK'
          AND a.status <> 'REJECTED'
          AND a.deleted_at IS NULL`,
      [establishmentId],
    )) as { total: number }[];
    return row?.total ?? 0;
  }

  async isValidGeometry(geoJson: unknown): Promise<boolean> {
    const [row] = await this.dataSource.query(
      `SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS valid`,
      [JSON.stringify(geoJson)],
    );
    return Boolean(row?.valid);
  }

  /** Área geodésica en hectáreas de una geometría GeoJSON. */
  async areaHectares(geoJson: unknown): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) / 10000 AS ha`,
      [JSON.stringify(geoJson)],
    );
    return Number(row?.ha ?? 0);
  }

  /**
   * Geofencing: verifica si un punto cae dentro del límite del establecimiento (con tolerancia)
   * o, si no hay límite cargado, a una distancia razonable del punto principal.
   */
  async checkPoint(
    establishmentId: string,
    point: GeoPoint,
    toleranceM: number,
    fallbackRadiusM: number,
  ): Promise<GeofenceCheck | null> {
    const [row] = await this.dataSource.query(
      `SELECT
         CASE WHEN l.boundary IS NOT NULL
              THEN ST_DWithin(l.boundary::geography, p.geom::geography, $3)
              ELSE ST_DWithin(l.point::geography, p.geom::geography, $4) END AS inside,
         CASE WHEN l.boundary IS NOT NULL
              THEN ST_Distance(l.boundary::geography, p.geom::geography)
              ELSE ST_Distance(l.point::geography, p.geom::geography) END AS distance
       FROM establishment_locations l,
            (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS geom) p
       WHERE l.establishment_id = $1 AND l.kind = 'MAIN'`,
      [establishmentId, JSON.stringify(point), toleranceM, fallbackRadiusM],
    );
    if (!row) return null;
    return { inside: Boolean(row.inside), distanceM: Number(row.distance) };
  }

  /** Geocerca de superficie: el polígono declarado del activo debe estar dentro del establecimiento. */
  async checkArea(
    establishmentId: string,
    area: unknown,
    toleranceM: number,
  ): Promise<GeofenceCheck | null> {
    const [row] = await this.dataSource.query(
      `SELECT ST_Within(a.geom, ST_Buffer(l.boundary::geography, $3)::geometry) AS inside,
              ST_Distance(ST_Centroid(a.geom)::geography, l.boundary::geography) AS distance
         FROM establishment_locations l,
              (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS geom) a
        WHERE l.establishment_id = $1 AND l.kind = 'MAIN' AND l.boundary IS NOT NULL`,
      [establishmentId, JSON.stringify(area), toleranceM],
    );
    if (!row) return null;
    return { inside: Boolean(row.inside), distanceM: row.inside ? 0 : Number(row.distance) };
  }
}
