import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  as,
  login,
  resetAndSeed,
  startTestApp,
  USERS,
  waitFor,
  type Session,
  type TestContext,
} from './helpers/test-environment.js';

const CAMERA = (n: number) =>
  join(import.meta.dirname, `../../../infra/seed-assets/cameras/CAM-LE-0${n}.jpg`);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const EID_1 = '032000000000001';
const EID_2 = '032000000000002';
const EID_3 = '032000000000003';
const FRAMES_PER_CAPTURE = 12;
const FRAME_STEP_MS = 125;

/**
 * Manga + RFID: registro individual. La identidad la da la caravana; el servidor re-detecta y
 * re-sigue los cuadros de cada captura (visión SIMULADA en tests: un bovino centrado) y solo asocia
 * cuando hay exactamente un bovino estable y una sola lectura válida dentro de la ventana. Lo que
 * dice el celular es preliminar.
 */
describe('Manga + RFID (registro individual)', () => {
  let ctx: TestContext;
  let maria: Session;
  let producer: Session;
  let requestId: string;
  let assetId: string;
  const scanId = randomUUID();
  const frames: Buffer[] = [];
  const base = () => `/api/producer/me/requests/${requestId}`;
  const captureIds = Array.from({ length: 5 }, () => randomUUID());
  let uploaded = 0;
  let done: {
    official: { count: number; lowerBound: boolean; chute: Record<string, unknown> };
    captures: {
      id: string;
      sequence: number;
      status: string;
      reason: string;
      electronicId: string | null;
      internalCode: string | null;
      simulated: boolean;
      bestFrames: number;
      evidenceId: string | null;
      clientStatus: string | null;
    }[];
    evidenceId: string;
  };

  /** Sube los cuadros de la ventana de una captura (índices globales) y devuelve sus índices. */
  async function uploadWindow(startMs: number): Promise<number[]> {
    const indices: number[] = [];
    for (let i = 0; i < FRAMES_PER_CAPTURE; i++) {
      const index = uploaded++;
      const body = frames[index % frames.length]!;
      await as(ctx, producer)
        .post(`${base()}/scans/${scanId}/frames`)
        .field('kind', 'SAMPLE')
        .field('index', String(index))
        .field('capturedMs', String(startMs + i * FRAME_STEP_MS))
        .field('sha256', sha(body))
        .attach('file', body, { filename: `${index}.jpg`, contentType: 'image/jpeg' })
        .expect(201);
      indices.push(index);
    }
    return indices;
  }

  const capture = (body: Record<string, unknown>) =>
    as(ctx, producer).post(`${base()}/scans/${scanId}/captures`).send(body);

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: true });
    maria = await login(ctx, USERS.maria);
    const created = await as(ctx, maria)
      .post('/api/guarantee-requests')
      .send({
        producerName: 'Estancia La Manga S.A.',
        producerTaxId: '30-71548963-1',
        assetTypeCode: 'BOVINOS',
      })
      .expect(201);
    requestId = created.body.id;
    const token = String(created.body.invitation.url).split('/solicitud/')[1]!;
    await ctx
      .http()
      .post(`/api/producer/requests/${token}/accept`)
      .send({ email: 'manga@lamanga.com.ar', password: 'Manga-2026-seguro' })
      .expect(201);
    producer = await login(ctx, 'manga@lamanga.com.ar', 'Manga-2026-seguro');
    await as(ctx, producer)
      .post(`${base()}/establishment`)
      .send({
        name: 'La Manga',
        holderName: 'Estancia La Manga S.A.',
        holderTaxId: '30-71548963-1',
        renspa: '06.687.0.01542/00',
        establishmentType: 'CRIA',
        tenure: 'OWNED',
        province: 'Buenos Aires',
        location: { latitude: -36.7905, longitude: -59.153 },
      })
      .expect(201);
    const asset = await as(ctx, producer)
      .post(`${base()}/asset`)
      .send({
        name: 'Rodeo de cría — manga RFID',
        declaredQuantity: 3,
        metadata: { sistema_productivo: 'Cría', raza_predominante: 'Hereford' },
      })
      .expect(201);
    assetId = asset.body.asset.id;
    for (let n = 1; n <= 6; n++) frames.push(await readFile(CAMERA(n)));
  });
  afterAll(() => ctx.close());

  it('crea la sesión de manga con zona de captura; rechaza una zona inválida', async () => {
    const body = {
      id: scanId,
      mode: 'CHUTE',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      sampledFps: 8,
      frameWidth: 640,
      frameHeight: 480,
      line: { orientation: 'vertical', position: 0.5 },
      captureZone: { x1: 0.1, y1: 0.05, x2: 0.9, y2: 0.98 },
      device: { backend: 'wasm', model: 'yolox_nano', rfidReader: 'SIMULATED' },
    };
    await as(ctx, producer)
      .post(`${base()}/scans`)
      .send({ ...body, id: randomUUID(), captureZone: { x1: 0.5, y1: 0.5, x2: 0.55, y2: 0.6 } })
      .expect(422);
    const created = await as(ctx, producer).post(`${base()}/scans`).send(body).expect(201);
    expect(created.body).toMatchObject({
      id: scanId,
      mode: 'CHUTE',
      modeLabel: 'Manga + RFID (individual)',
      captures: [],
    });
  });

  it('registra capturas (idempotentes); lectura "real" exige un lector registrado', async () => {
    // 1 y 2: dos bovinos consecutivos, una lectura cada uno.
    const w1 = await uploadWindow(1000);
    const w2 = await uploadWindow(6000);
    // 3: dos caravanas distintas para el mismo animal; el celular dice CONFIRMED (no es oficial).
    const w3 = await uploadWindow(11000);
    // 4: lectura fuera de la ventana de cuadros.
    const w4 = await uploadWindow(16000);
    // 5: lectura ilegible / dudosa.
    const w5 = await uploadWindow(21000);
    const first = {
      id: captureIds[0],
      sequence: 1,
      rfidSource: 'SIMULATED',
      reads: [{ electronicId: EID_1, atMs: 2000 }],
      frameIndices: w1,
      clientTrackId: 1,
      clientResult: { status: 'CONFIRMED', reason: 'ONE_STABLE_ANIMAL' },
    };
    const sent = await capture(first).expect(201);
    expect(sent.body).toMatchObject({ sequence: 1, status: 'PENDING', simulated: true });
    expect(sent.body.electronicId).toBeNull(); // sin confirmar no se informa la asociación
    await capture(first).expect(201); // reenvío: no duplica
    await capture({ ...first, reads: [{ electronicId: EID_2, atMs: 2000 }] }).expect(409);
    await capture({ ...first, id: randomUUID() }).expect(409); // mismo número de orden
    await capture({
      ...first,
      id: randomUUID(),
      sequence: 9,
      rfidSource: 'READER_BRIDGE',
    }).expect(422);

    await capture({
      id: captureIds[1],
      sequence: 2,
      rfidSource: 'SIMULATED',
      reads: [{ electronicId: EID_2, atMs: 7000 }],
      frameIndices: w2,
      clientTrackId: 2,
      clientResult: { status: 'CONFIRMED' },
    }).expect(201);
    await capture({
      id: captureIds[2],
      sequence: 3,
      rfidSource: 'SIMULATED',
      reads: [
        { electronicId: EID_3, atMs: 12000 },
        { electronicId: '032000000000004', atMs: 12200 },
      ],
      frameIndices: w3,
      clientTrackId: 3,
      clientResult: { status: 'CONFIRMED' },
    }).expect(201);
    await capture({
      id: captureIds[3],
      sequence: 4,
      rfidSource: 'SIMULATED',
      reads: [{ electronicId: '032000000000005', atMs: 40000 }],
      frameIndices: w4,
      clientTrackId: 4,
      clientResult: { status: 'CONFIRMED' },
    }).expect(201);
    await capture({
      id: captureIds[4],
      sequence: 5,
      rfidSource: 'SIMULATED',
      reads: [{ electronicId: '9X?', atMs: 22000 }],
      frameIndices: w5,
      clientTrackId: 5,
    }).expect(201);
  });

  it('no finaliza sin declarar las capturas ni con cuadros faltantes', async () => {
    const finalize = {
      endedAt: new Date().toISOString(),
      durationS: 30,
      expectedFrames: uploaded,
      expectedKeyFrames: 0,
      clientResult: { netCount: 5, preliminary: true },
    };
    await as(ctx, producer).post(`${base()}/scans/${scanId}/finalize`).send(finalize).expect(409);
    await as(ctx, producer)
      .post(`${base()}/scans/${scanId}/finalize`)
      .send({ ...finalize, expectedCaptures: 4 })
      .expect(409);
    const sent = await as(ctx, producer)
      .post(`${base()}/scans/${scanId}/finalize`)
      .send({ ...finalize, expectedCaptures: 5 })
      .expect(201);
    expect(['PROCESSING', 'COMPLETED']).toContain(sent.body.status);
    // Ya enviada: no admite capturas nuevas.
    await capture({
      id: randomUUID(),
      sequence: 6,
      rfidSource: 'SIMULATED',
      reads: [],
      frameIndices: [0],
    }).expect(409);
  });

  it('el servidor decide: confirma solo 1 bovino + 1 RFID en ventana; nunca asocia ante la duda', async () => {
    done = await waitFor(async () => {
      const r = await as(ctx, producer).get(`${base()}/scans/${scanId}`).expect(200);
      return r.body.status === 'COMPLETED' ? r.body : null;
    });
    const byOrder = Object.fromEntries(done.captures.map((c) => [c.sequence, c]));
    // Dos bovinos consecutivos con dos caravanas → dos asociaciones correctas.
    expect(byOrder[1]).toMatchObject({
      status: 'CONFIRMED',
      electronicId: EID_1,
      internalCode: 'BOV-00001',
    });
    expect(byOrder[2]).toMatchObject({
      status: 'CONFIRMED',
      electronicId: EID_2,
      internalCode: 'BOV-00002',
    });
    expect(byOrder[1]!.bestFrames).toBeGreaterThanOrEqual(1);
    expect(byOrder[1]!.bestFrames).toBeLessThanOrEqual(8);
    // El celular dijo CONFIRMED; el servidor ve dos caravanas → AMBIGUO (no oficial sin servidor).
    expect(byOrder[3]).toMatchObject({
      status: 'AMBIGUOUS',
      reason: 'MULTIPLE_RFID',
      clientStatus: 'CONFIRMED',
      electronicId: null,
    });
    expect(byOrder[4]).toMatchObject({
      status: 'INSUFFICIENT_EVIDENCE',
      reason: 'RFID_OUT_OF_WINDOW',
      electronicId: null,
    });
    expect(byOrder[5]).toMatchObject({ status: 'INSUFFICIENT_EVIDENCE', reason: 'INVALID_RFID' });
    // Conteo de la sesión: caravanas distintas confirmadas; SIMULADO → cota inferior.
    expect(done.official.count).toBe(2);
    expect(done.official.lowerBound).toBe(true);
    expect(done.official.chute).toMatchObject({
      confirmed: 2,
      ambiguous: 1,
      insufficient: 2,
      identified: 2,
      rfidSimulated: true,
    });
  });

  it('registra lecturas SIMULADAS, individuos marcados y evidencia inmutable con hashes', async () => {
    const individuals = await ctx.dataSource.query(
      `SELECT internal_code, electronic_id, simulated, confirmations FROM bovine_individuals
        WHERE asset_id = $1 ORDER BY internal_code`,
      [assetId],
    );
    expect(individuals).toEqual([
      { internal_code: 'BOV-00001', electronic_id: EID_1, simulated: true, confirmations: 1 },
      { internal_code: 'BOV-00002', electronic_id: EID_2, simulated: true, confirmations: 1 },
    ]);
    const observations = await ctx.dataSource.query(
      `SELECT DISTINCT source FROM rfid_observations WHERE raw_payload->>'scanSessionId' = $1`,
      [scanId],
    );
    expect(observations).toEqual([{ source: 'SIMULATED' }]);

    const confirmed = done.captures.find((c) => c.sequence === 1)!;
    const [evidence] = await ctx.dataSource.query(
      `SELECT type, sha256, metadata FROM evidence WHERE id = $1`,
      [confirmed.evidenceId],
    );
    expect(evidence.type).toBe('RFID_READ');
    expect(evidence.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.metadata).toMatchObject({
      electronicId: EID_1,
      internalCode: 'BOV-00001',
      rfidSimulated: true,
      associationStatus: 'CONFIRMED',
    });
    const [session] = await ctx.dataSource.query(`SELECT metadata FROM evidence WHERE id = $1`, [
      done.evidenceId,
    ]);
    expect(session.metadata).toMatchObject({
      mode: 'CHUTE',
      officialCount: 2,
      lowerBound: true,
      rfidSimulated: true,
      simulated: true,
    });

    // Una captura resuelta no se modifica ni se borra en silencio (ni siquiera con SQL directo).
    await expect(
      ctx.dataSource.query(`UPDATE chute_captures SET electronic_id = $2 WHERE id = $1`, [
        confirmed.id,
        EID_3,
      ]),
    ).rejects.toThrow(/inmutable/);
    await expect(
      ctx.dataSource.query(`DELETE FROM chute_captures WHERE id = $1`, [confirmed.id]),
    ).rejects.toThrow();
    await expect(
      ctx.dataSource.query(`UPDATE evidence SET sha256 = repeat('0', 64) WHERE id = $1`, [
        confirmed.evidenceId,
      ]),
    ).rejects.toThrow();

    const [audit] = await ctx.dataSource.query(
      `SELECT count(*) FILTER (WHERE action = 'BOVINE_RFID_ASSOCIATED')::int AS ok,
              count(*) FILTER (WHERE action = 'BOVINE_RFID_NOT_ASSOCIATED')::int AS not_ok,
              count(*) FILTER (WHERE action = 'CHUTE_CAPTURES_SUBMITTED')::int AS submitted
         FROM audit_logs WHERE resource_id = ANY($1) OR resource_id = $2`,
      [captureIds, scanId],
    );
    expect(audit).toEqual({ ok: 2, not_ok: 3, submitted: 5 });
  });

  it('la entidad ve los bovinos identificados (SIMULADO) y su respaldo; otra organización no', async () => {
    const list = await as(ctx, maria).get(`/api/assets/${assetId}/bovine-individuals`).expect(200);
    expect(list.body).toMatchObject({ total: 2, real: 0, simulated: 2 });
    expect(list.body.items[0]).toMatchObject({ internalCode: 'BOV-00001', simulated: true });
    expect(list.body.items[0].evidenceImages).toBeGreaterThanOrEqual(1);

    const detail = await as(ctx, maria)
      .get(`/api/bovine-individuals/${list.body.items[0].id}`)
      .expect(200);
    expect(detail.body.captures[0]).toMatchObject({ electronicId: EID_1, simulated: true });
    expect(detail.body.captures[0].bestFrames[0].url).toMatch(/^http/);
    expect(detail.body.captures[0].bestFrames[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.body.captures[0].bestFrames[0].box).toBeDefined();

    const dataset = await as(ctx, maria)
      .get(`/api/assets/${assetId}/bovine-individuals/dataset`)
      .expect(200);
    expect(dataset.body.items.length).toBeGreaterThanOrEqual(2);
    expect(dataset.body.items[0]).toMatchObject({
      electronicId: EID_1,
      scanSessionId: scanId,
      simulated: true,
    });
    expect(dataset.body.items[0]).not.toHaveProperty('embedding');
    expect(dataset.body.items[0]).not.toHaveProperty('url');

    const request = await as(ctx, maria).get(`/api/guarantee-requests/${requestId}`).expect(200);
    expect(request.body.scans[0]).toMatchObject({ id: scanId, mode: 'CHUTE', lowerBound: true });

    const other = await login(ctx, USERS.otherOrg);
    await as(ctx, other).get(`/api/assets/${assetId}/bovine-individuals`).expect(404);
    await as(ctx, other).get(`/api/assets/${assetId}/bovine-individuals/dataset`).expect(404);
    await as(ctx, other).get(`/api/bovine-individuals/${list.body.items[0].id}`).expect(404);
    await as(ctx, other).get(`/api/scans/${scanId}`).expect(404);
    // El productor no accede a la vista de la entidad.
    await as(ctx, producer).get(`/api/assets/${assetId}/bovine-individuals`).expect(403);
  });

  it('las capturas son solo del modo manga', async () => {
    const other = randomUUID();
    await as(ctx, producer)
      .post(`${base()}/scans`)
      .send({
        id: other,
        mode: 'FIXED',
        startedAt: new Date().toISOString(),
        sampledFps: 6,
        frameWidth: 640,
        frameHeight: 480,
        line: { orientation: 'vertical', position: 0.5 },
      })
      .expect(201);
    await as(ctx, producer)
      .post(`${base()}/scans/${other}/captures`)
      .send({
        id: randomUUID(),
        sequence: 1,
        rfidSource: 'SIMULATED',
        reads: [{ electronicId: EID_1, atMs: 100 }],
        frameIndices: [0],
      })
      .expect(422);
  });
});
