import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EvidenceRecorder } from '../../evidence/application/evidence-recorder.js';
import { EVIDENCE_SOURCE_CODES } from '../../evidence/domain/evidence.types.js';
import type { EvidenceEntity } from '../../evidence/infrastructure/evidence.entity.js';
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
  previous: SatelliteObservationEntity | null;
}

/** Persiste escena, observación y evidencia satelital de forma trazable. */
@Injectable()
export class SatelliteIngestionService {
  constructor(
    @InjectRepository(SatelliteImageEntity)
    private readonly images: Repository<SatelliteImageEntity>,
    @InjectRepository(SatelliteObservationEntity)
    private readonly observations: Repository<SatelliteObservationEntity>,
    private readonly recorder: EvidenceRecorder,
    private readonly storage: ObjectStorage,
  ) {}

  latestObservation(assetId: string): Promise<SatelliteObservationEntity | null> {
    return this.observations.findOne({ where: { assetId }, order: { observedAt: 'DESC' } });
  }

  observationsForAsset(organizationId: string, assetId: string) {
    return this.observations.find({
      where: { organizationId, assetId },
      order: { observedAt: 'ASC' },
      take: 100,
    });
  }

  imagesByIds(ids: string[]): Promise<SatelliteImageEntity[]> {
    return ids.length ? this.images.findBy({ id: In(ids) }) : Promise.resolve([]);
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
      let previewKey: string | null = null;
      if (analysis.preview) {
        previewKey = storageKeys.satellitePreview(
          input.organizationId,
          `${scene.sceneId}_${input.assetId}`,
        );
        await this.storage.putObject({
          key: previewKey,
          body: analysis.preview.bytes,
          contentType: analysis.preview.mimeType,
        });
      }
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
          previewStorageKey: previewKey,
          isSimulated: scene.simulated,
          metadata: { assets: Object.keys(scene.assets) },
        }),
      );
    }

    const evidence = await this.recorder.record({
      organizationId: input.organizationId,
      assetId: input.assetId,
      establishmentId: input.establishmentId,
      sourceCode: scene.simulated
        ? EVIDENCE_SOURCE_CODES.SATELLITE_SIMULATED
        : EVIDENCE_SOURCE_CODES.SATELLITE_STAC,
      type: 'SATELLITE_SCENE',
      capturedAt: scene.acquiredAt,
      location: null,
      existingStorageKey: image.previewStorageKey ?? undefined,
      satelliteImageId: image.id,
      metadata: {
        sceneId: scene.sceneId,
        collection: scene.collection,
        cloudCoverPct: scene.cloudCoverPct,
        resolutionM: scene.resolutionM,
        ndviMean: analysis.ndviMean,
        vegetatedAreaHa: analysis.vegetatedAreaHa,
      },
    });

    const coverage =
      input.declaredAreaHa > 0 ? analysis.vegetatedAreaHa / input.declaredAreaHa : null;
    const change = input.previous?.vegetatedAreaHa
      ? ((analysis.vegetatedAreaHa - input.previous.vegetatedAreaHa) /
          input.previous.vegetatedAreaHa) *
        100
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
        vegetatedAreaHa: analysis.vegetatedAreaHa,
        declaredAreaHa: input.declaredAreaHa,
        coverageRatio: coverage === null ? null : Math.round(coverage * 10_000) / 10_000,
        changeVsPreviousPct: change === null ? null : Math.round(change * 100) / 100,
        metrics: { confidence: analysis.confidence, model: analysis.model },
      }),
    );
    return { evidence, observation };
  }
}
