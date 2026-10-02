import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { NotFoundError } from '../../../common/domain/errors.js';
import { BovineIndividualEntity } from '../../animals/infrastructure/bovine-individual.entity.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { ChuteCaptureEntity } from '../infrastructure/chute-capture.entity.js';
import { ScanFrameEntity } from '../infrastructure/scan-frame.entity.js';
import { ScanSessionEntity } from '../infrastructure/scan-session.entity.js';

/**
 * Bovinos identificados por Manga + RFID (lectura de la entidad, siempre dentro de su
 * organización). La identidad es la caravana; las imágenes son respaldo de que había un único
 * bovino en la manga al momento de la lectura. No hay reconocimiento visual.
 */
@Injectable()
export class BovineIndividualsService {
  constructor(
    @InjectRepository(BovineIndividualEntity)
    private readonly individuals: Repository<BovineIndividualEntity>,
    @InjectRepository(ChuteCaptureEntity)
    private readonly captures: Repository<ChuteCaptureEntity>,
    @InjectRepository(ScanFrameEntity) private readonly frames: Repository<ScanFrameEntity>,
    @InjectRepository(ScanSessionEntity) private readonly sessions: Repository<ScanSessionEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: ObjectStorage,
  ) {}

  /** El activo tiene que ser de la organización (otra organización recibe 404, no una lista vacía). */
  private async assertAsset(organizationId: string, assetId: string) {
    const [asset] = (await this.dataSource.query(
      `SELECT id FROM assets WHERE id = $1 AND organization_id = $2`,
      [assetId, organizationId],
    )) as { id: string }[];
    if (!asset) throw new NotFoundError('Activo', assetId);
  }

  async listForAsset(organizationId: string, assetId: string) {
    await this.assertAsset(organizationId, assetId);
    const rows = await this.individuals.find({
      where: { organizationId, assetId },
      order: { firstIdentifiedAt: 'ASC' },
    });
    const evidenceImages = await this.imageCounts(rows.map((r) => r.id));
    return {
      total: rows.length,
      real: rows.filter((r) => !r.simulated).length,
      simulated: rows.filter((r) => r.simulated).length,
      items: rows.map((r) => ({
        ...this.summary(r),
        evidenceImages: evidenceImages.get(r.id) ?? 0,
      })),
    };
  }

  async detail(organizationId: string, id: string) {
    const individual = await this.individuals.findOneBy({ id, organizationId });
    if (!individual) throw new NotFoundError('Bovino', id);
    const captures = await this.captures.find({
      where: { organizationId, individualId: individual.id, status: 'CONFIRMED' },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const frameRows = await this.framesFor(captures);
    return {
      ...this.summary(individual),
      captures: await Promise.all(
        captures.map(async (c) => ({
          id: c.id,
          scanSessionId: c.scanSessionId,
          sequence: c.sequence,
          rfidSource: c.rfidSource,
          simulated: c.rfidSource === 'SIMULATED',
          electronicId: c.electronicId,
          evidenceId: c.evidenceId,
          processedAt: c.processedAt,
          trackId: c.trackId,
          matcher: c.decision?.matcher ?? null,
          metrics: c.decision?.metrics ?? null,
          bestFrames: await Promise.all(
            c.bestFrames.map(async (f) => {
              const row = frameRows.get(`${c.scanSessionId}:${f.index}`);
              return {
                ...f,
                url: row
                  ? await this.storage.signedDownloadUrl(row.storageKey, { inline: true })
                  : null,
              };
            }),
          ),
        })),
      ),
    };
  }

  /**
   * Dataset para investigación futura (Re-ID): una fila por cuadro elegido de cada captura
   * CONFIRMADA, con la caravana como etiqueta. Solo metadatos y hashes (sin URLs ni embeddings).
   */
  async dataset(organizationId: string, assetId: string) {
    await this.assertAsset(organizationId, assetId);
    const captures = await this.captures.find({
      where: { organizationId, assetId, status: 'CONFIRMED' },
      order: { createdAt: 'ASC' },
    });
    const header = {
      kind: 'agrogarantias.bovine-rfid-dataset',
      version: 1,
      note: 'Etiqueta = caravana RFID. Cuadros con caja, calidad y hash; sin embeddings ni reconocimiento visual.',
    };
    if (!captures.length) return { ...header, items: [] };
    const sessions = new Map(
      (
        await this.sessions.find({
          where: { organizationId, id: In([...new Set(captures.map((c) => c.scanSessionId))]) },
        })
      ).map((s) => [s.id, s]),
    );
    const individuals = new Map(
      (
        await this.individuals.find({
          where: { organizationId, id: In(captures.map((c) => c.individualId!)) },
        })
      ).map((i) => [i.id, i]),
    );
    const serverModel = (s: ScanSessionEntity | undefined) =>
      (s?.serverResult?.model as { code: string; version: string } | undefined) ?? null;
    return {
      ...header,
      items: captures.flatMap((c) => {
        const session = sessions.get(c.scanSessionId);
        const individual = individuals.get(c.individualId!);
        return c.bestFrames.map((f) => ({
          electronicId: c.electronicId,
          internalCode: individual?.internalCode ?? null,
          simulated: c.rfidSource === 'SIMULATED',
          captureId: c.id,
          scanSessionId: c.scanSessionId,
          evidenceId: c.evidenceId,
          frameIndex: f.index,
          sha256: f.sha256,
          timestamp: session ? new Date(session.startedAt.getTime() + f.capturedMs) : null,
          trackId: c.trackId,
          bbox: f.box,
          confidence: f.score,
          quality: { sharpness: f.sharpness, brightness: f.brightness },
          device: session?.device ?? null,
          establishmentId: c.establishmentId,
          assetId: c.assetId,
          model: serverModel(session),
          matcher: c.decision?.matcher ?? null,
        }));
      }),
    };
  }

  private summary(r: BovineIndividualEntity) {
    return {
      id: r.id,
      internalCode: r.internalCode,
      electronicId: r.electronicId,
      simulated: r.simulated,
      animalId: r.animalId,
      establishmentId: r.establishmentId,
      assetId: r.assetId,
      firstIdentifiedAt: r.firstIdentifiedAt,
      lastIdentifiedAt: r.lastIdentifiedAt,
      confirmations: r.confirmations,
    };
  }

  private async imageCounts(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = (await this.captures
      .createQueryBuilder('c')
      .select('c.individual_id', 'id')
      .addSelect('SUM(jsonb_array_length(c.best_frames))::int', 'images')
      .where('c.individual_id IN (:...ids)', { ids })
      .andWhere(`c.status = 'CONFIRMED'`)
      .groupBy('c.individual_id')
      .getRawMany()) as { id: string; images: number }[];
    return new Map(rows.map((r) => [r.id, Number(r.images)]));
  }

  private async framesFor(captures: ChuteCaptureEntity[]) {
    const map = new Map<string, ScanFrameEntity>();
    for (const c of captures) {
      if (!c.bestFrames.length) continue;
      const rows = await this.frames.find({
        where: {
          scanSessionId: c.scanSessionId,
          kind: 'SAMPLE',
          frameIndex: In(c.bestFrames.map((f) => f.index)),
        },
      });
      for (const r of rows) map.set(`${r.scanSessionId}:${r.frameIndex}`, r);
    }
    return map;
  }
}
