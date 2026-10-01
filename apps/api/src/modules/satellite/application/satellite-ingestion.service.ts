import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { canonicalJson, sha256Hex } from '../../../common/crypto/hashing.js';
import type { GeoMultiPolygon, GeoPoint } from '../../../common/geo/geojson.js';
import { point } from '../../../common/geo/geojson.js';
import { EvidenceRecorder } from '../../evidence/application/evidence-recorder.js';
import { EVIDENCE_SOURCE_CODES } from '../../evidence/domain/evidence.types.js';
import type { EvidenceEntity } from '../../evidence/infrastructure/evidence.entity.js';
import { EvidenceRepository } from '../../evidence/infrastructure/evidence.repository.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { storageKeys } from '../../storage/storage-keys.js';
import type { SatelliteScene, VegetationAnalysis } from '../domain/satellite.provider.js';
import { SatelliteImageEntity } from '../infrastructure/satellite-image.entity.js';
import { SatelliteObservationEntity } from '../infrastructure/satellite-observation.entity.js';

export interface IngestSceneInput {
  organizationId: string;
  assetId: string;
  establishmentId: string;
  scene: SatelliteScene;
  analysis: VegetationAnalysis;
  declaredAreaHa: number;
  /** Última observación utilizable anterior (base del cambio). */
  previous: SatelliteObservationEntity | null;
  area?: GeoMultiPolygon | null;
}

/** Observación utilizable: con NDVI y sin marca de baja calidad (nubes o cobertura). */
export const isUsableObservation = (o: SatelliteObservationEntity): boolean =>
  o.ndviMean !== null && o.metrics.usable !== false;

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Centroide simple (promedio de vértices del anillo exterior) para ubicar la evidencia. */
function centroid(area: GeoMultiPolygon): GeoPoint {
  const ring = area.coordinates[0]?.[0] ?? [];
  const lon = ring.reduce((a, p) => a + p[0]!, 0) / Math.max(ring.length, 1);
  const lat = ring.reduce((a, p) => a + p[1]!, 0) / Math.max(ring.length, 1);
  return point(round(lon, 6), round(lat, 6));
}

/**
 * Persiste escena, observación y evidencia satelital de forma trazable: la vista NDVI recortada
 * al lote es el archivo de la evidencia (hash SHA-256) y las estadísticas quedan en la
 * observación y en los metadatos de la evidencia junto con su propio hash.
 */
@Injectable()
export class SatelliteIngestionService {
  constructor(
    @InjectRepository(SatelliteImageEntity)
    private readonly images: Repository<SatelliteImageEntity>,
    @InjectRepository(SatelliteObservationEntity)
    private readonly observations: Repository<SatelliteObservationEntity>,
    private readonly recorder: EvidenceRecorder,
    private readonly evidence: EvidenceRepository,
    private readonly storage: ObjectStorage,
  ) {}

  latestObservation(assetId: string): Promise<SatelliteObservationEntity | null> {
    return this.observations.findOne({ where: { assetId }, order: { observedAt: 'DESC' } });
  }

  /** Observaciones utilizables del activo desde una fecha (para línea base y serie). */
  usableObservationsSince(assetId: string, since: Date): Promise<SatelliteObservationEntity[]> {
    return this.observations
      .createQueryBuilder('o')
      .where('o.assetId = :assetId', { assetId })
      .andWhere('o.observedAt >= :since', { since })
      .andWhere('o.ndviMean IS NOT NULL')
      .andWhere("(o.metrics->>'usable') IS DISTINCT FROM 'false'")
      .orderBy('o.observedAt', 'ASC')
      .getMany();
  }

  observationsForAsset(organizationId: string, assetId: string) {
    return this.observations.find({
      where: { organizationId, assetId },
      order: { observedAt: 'ASC' },
      take: 200,
    });
  }

  imagesByIds(ids: string[]): Promise<SatelliteImageEntity[]> {
    return ids.length ? this.images.findBy({ id: In(ids) }) : Promise.resolve([]);
  }

  /** Observación ya registrada para la escena y el activo (evita duplicar la serie). */
  async existing(
    organizationId: string,
    assetId: string,
    scene: SatelliteScene,
  ): Promise<{ evidence: EvidenceEntity; observation: SatelliteObservationEntity } | null> {
    const image = await this.images.findOneBy({
      organizationId,
      provider: scene.provider,
      sceneId: scene.sceneId,
    });
    if (!image) return null;
    const observation = await this.observations.findOneBy({
      assetId,
      satelliteImageId: image.id,
    });
    if (!observation?.evidenceId) return null;
    const evidence = await this.evidence.findById(organizationId, observation.evidenceId);
    return evidence ? { evidence, observation } : null;
  }

  async ingest(
    input: IngestSceneInput,
  ): Promise<{ evidence: EvidenceEntity; observation: SatelliteObservationEntity }> {
    const { scene, analysis } = input;
    let image = await this.images.findOneBy({
      organizationId: input.organizationId,
      provider: scene.provider,
      sceneId: scene.sceneId,
    });
    if (!image) {
      image = await this.images.save(
        this.images.create({
          organizationId: input.organizationId,
          provider: scene.provider,
          collection: scene.collection,
          sceneId: scene.sceneId,
          acquiredAt: scene.acquiredAt,
          cloudCoverPct: scene.cloudCoverPct,
          resolutionM: scene.resolutionM,
          footprint: scene.footprint,
          bands: scene.bands,
          previewStorageKey: null,
          isSimulated: scene.simulated,
          metadata: {
            platform: scene.platform ?? null,
            tile: scene.tile ?? null,
            catalog: scene.catalog ?? null,
            processingBaseline: scene.processingBaseline ?? null,
            assets: Object.keys(scene.assets),
          },
        }),
      );
    }

    let visualKey: string | null = null;
    if (analysis.visualPreview) {
      visualKey = storageKeys.satellitePreview(
        input.organizationId,
        `${scene.sceneId}_${input.assetId}_visual`,
        'png',
      );
      await this.storage.putObject({
        key: visualKey,
        body: analysis.visualPreview.bytes,
        contentType: analysis.visualPreview.mimeType,
      });
    }

    const stats = {
      ndviMean: analysis.ndviMean,
      ndviMedian: analysis.ndviMedian ?? null,
      ndviMin: analysis.ndviMin ?? null,
      ndviMax: analysis.ndviMax ?? null,
      ndviP10: analysis.ndviP10 ?? null,
      ndviP90: analysis.ndviP90 ?? null,
      ndviStd: analysis.ndviStd,
      vegetationPct: analysis.vegetationPct ?? null,
      vegetatedAreaHa: analysis.vegetatedAreaHa,
      vegetatedAreaObservedHa: analysis.vegetatedAreaObservedHa ?? null,
      analyzedAreaHa: analysis.analyzedAreaHa,
      cloudCoverPct: analysis.cloudCoverPct,
      sceneCloudCoverPct: analysis.sceneCloudCoverPct ?? scene.cloudCoverPct,
      validFraction: analysis.validFraction ?? null,
      usable: analysis.usable ?? true,
      quality: analysis.quality ?? null,
      issues: analysis.issues ?? [],
      vegetationThreshold: analysis.vegetationThreshold ?? null,
      confidence: analysis.confidence,
    };
    const resultSha256 = sha256Hex(canonicalJson({ sceneId: scene.sceneId, ...stats }));

    const evidence = await this.recorder.record({
      organizationId: input.organizationId,
      assetId: input.assetId,
      establishmentId: input.establishmentId,
      sourceCode: scene.simulated
        ? EVIDENCE_SOURCE_CODES.SATELLITE_SIMULATED
        : EVIDENCE_SOURCE_CODES.SATELLITE_STAC,
      type: 'SATELLITE_SCENE',
      capturedAt: scene.acquiredAt,
      location: input.area ? centroid(input.area) : null,
      file: analysis.preview ?? undefined,
      satelliteImageId: image.id,
      metadata: {
        provider: scene.provider,
        satellite: scene.platform ?? 'sentinel-2',
        sceneId: scene.sceneId,
        tile: scene.tile ?? null,
        catalog: scene.catalog ?? null,
        collection: scene.collection,
        acquisitionDate: scene.acquiredAt.toISOString(),
        resolutionM: scene.resolutionM,
        bands: analysis.bands ?? scene.bands,
        processingVersion: analysis.processingVersion ?? analysis.model.version,
        model: analysis.model.code,
        modelVersion: analysis.model.version,
        visualPreviewKey: visualKey,
        resultSha256,
        ...stats,
      },
    });

    const vegetated = analysis.vegetatedAreaHa;
    const coverage =
      vegetated !== null && input.declaredAreaHa > 0 ? vegetated / input.declaredAreaHa : null;
    const change =
      vegetated !== null && input.previous?.vegetatedAreaHa
        ? ((vegetated - input.previous.vegetatedAreaHa) / input.previous.vegetatedAreaHa) * 100
        : null;
    const ndviChange =
      analysis.ndviMean !== null && input.previous?.ndviMean
        ? ((analysis.ndviMean - input.previous.ndviMean) / Math.abs(input.previous.ndviMean)) * 100
        : null;
    const observation = await this.observations.save(
      this.observations.create({
        organizationId: input.organizationId,
        assetId: input.assetId,
        satelliteImageId: image.id,
        evidenceId: evidence.id,
        observedAt: scene.acquiredAt,
        ndviMean: analysis.ndviMean,
        ndviStd: analysis.ndviStd,
        vegetatedAreaHa: vegetated,
        declaredAreaHa: input.declaredAreaHa,
        coverageRatio: coverage === null ? null : round(Math.min(coverage, 99), 4),
        changeVsPreviousPct: change === null ? null : round(change, 2),
        metrics: {
          ...stats,
          ndviChangePct: ndviChange === null ? null : round(ndviChange, 2),
          previousObservationId: input.previous?.id ?? null,
          sceneId: scene.sceneId,
          provider: scene.provider,
          simulated: scene.simulated,
          processingVersion: analysis.processingVersion ?? null,
          ndviPreviewKey: evidence.storageKey,
          visualPreviewKey: visualKey,
          model: analysis.model,
        },
      }),
    );
    return { evidence, observation };
  }
}
