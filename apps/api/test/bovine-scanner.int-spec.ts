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

/**
 * Escáner de Bovinos: sesión idempotente, subida reanudable de cuadros con hash, conteo oficial
 * en el worker (proveedor de visión SIMULADO en tests), evidencia SCAN inmutable, vista de la
 * entidad, aislamiento entre organizaciones y uso del escaneo en la verificación.
 */
describe('Escáner de Bovinos', () => {
  let ctx: TestContext;
  let maria: Session;
  let producer: Session;
  let requestId: string;
  let assetId: string;
  const scanId = randomUUID();
  const frames: Buffer[] = [];
  const base = () => `/api/producer/me/requests/${requestId}`;

  const upload = (index: number, kind: 'SAMPLE' | 'KEY', body: Buffer, hash = sha(body)) =>
    as(ctx, producer)
      .post(`${base()}/scans/${scanId}/frames`)
      .field('kind', kind)
      .field('index', String(index))
      .field('capturedMs', String(index * 167))
      .field('sha256', hash)
      .attach('file', body, { filename: `${index}.jpg`, contentType: 'image/jpeg' });

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: true });
    maria = await login(ctx, USERS.maria);
    const created = await as(ctx, maria)
      .post('/api/guarantee-requests')
      .send({
        producerName: 'Agropecuaria La Esperanza S.A.',
        producerTaxId: '30-71548963-1',
        assetTypeCode: 'BOVINOS',
      })
      .expect(201);
    requestId = created.body.id;
    const token = String(created.body.invitation.url).split('/solicitud/')[1]!;
    await ctx
      .http()
      .post(`/api/producer/requests/${token}/accept`)
      .send({ email: 'scanner@laesperanza.com.ar', password: 'Rodeo-2026-seguro' })
      .expect(201);
    producer = await login(ctx, 'scanner@laesperanza.com.ar', 'Rodeo-2026-seguro');
    await as(ctx, producer)
      .post(`${base()}/establishment`)
      .send({
        name: 'La Esperanza',
        holderName: 'Agropecuaria La Esperanza S.A.',
        holderTaxId: '30-71548963-1',
        renspa: '06.687.0.01542/00',
        establishmentType: 'CRIA',
        tenure: 'LEASED',
        province: 'Buenos Aires',
        location: { latitude: -36.7905, longitude: -59.153 },
      })
      .expect(201);
    const asset = await as(ctx, producer)
      .post(`${base()}/asset`)
      .send({
        name: 'Rodeo de cría — manga',
        declaredQuantity: 30,
        metadata: { sistema_productivo: 'Cría', raza_predominante: 'Aberdeen Angus' },
      })
      .expect(201);
    assetId = asset.body.asset.id;
    for (let n = 1; n <= 6; n++) frames.push(await readFile(CAMERA(n)));
  });
  afterAll(() => ctx.close());

  it('crea la sesión de forma idempotente (mismo id desde el celular)', async () => {
    const body = {
      id: scanId,
      mode: 'FIXED',
      startedAt: new Date().toISOString(),
      sampledFps: 6,
      frameWidth: 640,
      frameHeight: 400,
      line: { orientation: 'vertical', position: 0.5 },
      latitude: -36.7905,
      longitude: -59.153,
      accuracyM: 8,
      device: { backend: 'wasm', model: 'yolox_nano' },
    };
    const first = await as(ctx, producer).post(`${base()}/scans`).send(body).expect(201);
    expect(first.body).toMatchObject({ id: scanId, status: 'UPLOADING', mode: 'FIXED' });
    const again = await as(ctx, producer).post(`${base()}/scans`).send(body).expect(201);
    expect(again.body.id).toBe(scanId);
    // Otro usuario (la entidad) no puede usar el endpoint del productor.
    await as(ctx, maria).post(`${base()}/scans`).send(body).expect(403);
  });

  it('sube cuadros con hash; reenviar no duplica, contenido distinto o hash falso se rechaza', async () => {
    for (let i = 0; i < 12; i++) await upload(i, 'SAMPLE', frames[i % 6]!).expect(201);
    const repeated = await upload(3, 'SAMPLE', frames[3]!).expect(201);
    expect(repeated.body.stored).toBe(false);
    await upload(3, 'SAMPLE', frames[0]!).expect(409);
    await upload(12, 'SAMPLE', frames[0]!, 'a'.repeat(64)).expect(422);
    await upload(0, 'KEY', frames[1]!).expect(201);
    const status = await as(ctx, producer).get(`${base()}/scans/${scanId}`).expect(200);
    expect(status.body.received).toEqual({ frames: 12, keyFrames: 1 });
    expect(status.body.receivedSampleIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('no finaliza si faltan cuadros; al completarlos encola el conteo oficial', async () => {
    const finalize = {
      endedAt: new Date().toISOString(),
      durationS: 12,
      expectedFrames: 14,
      expectedKeyFrames: 1,
      clientResult: {
        netCount: 999,
        positiveCrossings: 999,
        negativeCrossings: 0,
        preliminary: true,
      },
      warnings: ['Sin señal durante el escaneo: se sincronizó después'],
    };
    const missing = await as(ctx, producer)
      .post(`${base()}/scans/${scanId}/finalize`)
      .send(finalize)
      .expect(409);
    expect(missing.body.details.missingSample).toEqual([12, 13]);
    await upload(12, 'SAMPLE', frames[0]!).expect(201);
    await upload(13, 'SAMPLE', frames[1]!).expect(201);
    const sent = await as(ctx, producer)
      .post(`${base()}/scans/${scanId}/finalize`)
      .send(finalize)
      .expect(201);
    expect(['PROCESSING', 'COMPLETED']).toContain(sent.body.status);
    // Ya enviado: no admite cuadros nuevos.
    await upload(14, 'SAMPLE', frames[2]!).expect(409);
  });

  it('el worker calcula el conteo OFICIAL (no el del celular) y registra evidencia SCAN inmutable', async () => {
    const done = await waitFor(async () => {
      const r = await as(ctx, producer).get(`${base()}/scans/${scanId}`).expect(200);
      return r.body.status === 'COMPLETED' ? r.body : null;
    });
    expect(done.official.count).not.toBe(999);
    expect(done.official.model.simulated).toBe(true); // CV simulado en tests
    expect(done.deviceResult.netCount).toBe(999);
    expect(done.evidenceId).toBeTruthy();
    expect(done.warnings).toContain('Sin señal durante el escaneo: se sincronizó después');
    const [evidence] = await ctx.dataSource.query(
      `SELECT type, sha256, metadata FROM evidence WHERE id = $1`,
      [done.evidenceId],
    );
    expect(evidence.type).toBe('SCAN');
    expect(evidence.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.metadata).toMatchObject({
      scanSessionId: scanId,
      mode: 'FIXED',
      officialCount: done.official.count,
    });
    await expect(
      ctx.dataSource.query(
        `UPDATE scan_frames SET sha256 = repeat('0', 64) WHERE scan_session_id = $1`,
        [scanId],
      ),
    ).rejects.toThrow();
    const [audit] = await ctx.dataSource.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE resource_id = $1 AND action IN ('SCAN_STARTED','SCAN_SUBMITTED','SCAN_PROCESSED')`,
      [scanId],
    );
    expect(audit.n).toBe(3);
  });

  it('la entidad ve el escaneo con cuadros representativos; otra organización no', async () => {
    const list = await as(ctx, maria).get(`/api/assets/${assetId}/scans`).expect(200);
    expect(list.body[0]).toMatchObject({ id: scanId, status: 'COMPLETED' });
    expect(list.body[0].keyFrames[0].url).toMatch(/^http/);
    const detail = await as(ctx, maria).get(`/api/scans/${scanId}`).expect(200);
    expect(detail.body.serverDetail).toBeDefined();
    const other = await login(ctx, USERS.otherOrg);
    await as(ctx, other).get(`/api/scans/${scanId}`).expect(404);
    const request = await as(ctx, maria).get(`/api/guarantee-requests/${requestId}`).expect(200);
    expect(request.body.scans[0]).toMatchObject({ id: scanId, mode: 'FIXED', lowerBound: false });
    expect(request.body.evidenceCount).toBeGreaterThanOrEqual(1);
  });

  it('el escaneo cuenta como evidencia y la verificación lo usa como conteo en paso controlado', async () => {
    await as(ctx, producer)
      .post(`${base()}/documents`)
      .field('type', 'RENSPA')
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'), {
        filename: 'renspa.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    await as(ctx, producer).post(`${base()}/submit`).expect(201);
    const bank = await waitFor(async () => {
      const r = await as(ctx, maria).get(`/api/guarantee-requests/${requestId}`).expect(200);
      return r.body.verification?.outcome ? r.body : null;
    });
    const links = await as(ctx, maria)
      .get(`/api/verifications/${bank.verification.runId}/evidence`)
      .expect(200);
    const scanLink = (
      links.body as { evidence: { type: string }; detectedCount: number; role: string }[]
    ).find((l) => l.evidence.type === 'SCAN');
    expect(scanLink).toMatchObject({ role: 'PRIMARY' });
    const [basis] = await ctx.dataSource.query(
      `SELECT value::int AS value, details FROM verification_metrics WHERE verification_run_id = $1 AND key = 'count_lower_bound'`,
      [bank.verification.runId],
    );
    expect(basis.details.basis).toBe('CENSUS');
  });

  it('monitoreo: historial por verificación y conciliación visual + RFID (REAL y SIMULADO aparte)', async () => {
    const history = await as(ctx, maria)
      .get(`/api/assets/${assetId}/livestock/history`)
      .expect(200);
    expect(history.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(history.body.rows[0]).toMatchObject({ declared: 30, basis: 'CENSUS' });
    expect(Array.isArray(history.body.changes)).toBe(true);

    // Sin lecturas: no se inventan coincidencias.
    const none = await as(ctx, maria)
      .get(`/api/assets/${assetId}/livestock/reconciliation`)
      .expect(200);
    expect(none.body).toMatchObject({ method: 'NO_RFID', matches: null });

    // Lecturas SIMULADAS (demo): se informan aparte y no se concilian.
    await as(ctx, maria).post(`/api/assets/${assetId}/rfid/simulate`).expect(201);
    const simulated = await as(ctx, maria)
      .get(`/api/assets/${assetId}/livestock/reconciliation`)
      .expect(200);
    expect(simulated.body.method).toBe('NO_RFID');
    expect(simulated.body.simulated.tags).toBeGreaterThan(0);
    expect(simulated.body.real.tags).toBe(0);

    // Lectura REAL desde el puente del lector: sin paso simultáneo por la manga, solo totales.
    await as(ctx, maria)
      .post(`/api/assets/${assetId}/rfid/observations`)
      .send({
        readings: [{ electronicId: '032 0000 1245 9999', observedAt: new Date().toISOString() }],
      })
      .expect(201);
    const real = await as(ctx, maria)
      .get(`/api/assets/${assetId}/livestock/reconciliation`)
      .expect(200);
    expect(real.body.method).toBe('COUNTS_ONLY');
    expect(real.body.real.tags).toBe(1);
    expect(real.body.matches).toBeNull();
    expect(real.body.totalsDifference).toBe(real.body.observed - real.body.real.identified);

    // Aislamiento entre organizaciones y productor sin acceso a la vista de la entidad.
    const other = await login(ctx, USERS.otherOrg);
    await as(ctx, other).get(`/api/assets/${assetId}/livestock/history`).expect(404);
    await as(ctx, other).get(`/api/assets/${assetId}/livestock/reconciliation`).expect(404);
    await as(ctx, producer).get(`/api/assets/${assetId}/livestock/history`).expect(403);
  });
});

/**
 * Escáner de corral (animales quietos) y análisis de fotos: mismo flujo (sesión, cuadros con
 * hash, conteo oficial en el worker, evidencia SCAN), con conteo de animales únicos, cota inferior
 * y estado de la evidencia con instrucciones para el productor.
 */
describe('Escáner de corral y análisis de fotos', () => {
  let ctx: TestContext;
  let maria: Session;
  let producer: Session;
  let requestId: string;
  const frames: Buffer[] = [];
  const base = () => `/api/producer/me/requests/${requestId}`;

  async function scan(mode: 'PEN' | 'PHOTO', count: number) {
    const id = randomUUID();
    await as(ctx, producer)
      .post(`${base()}/scans`)
      .send({
        id,
        mode,
        startedAt: new Date().toISOString(),
        sampledFps: mode === 'PHOTO' ? 0 : 6,
        frameWidth: 640,
        frameHeight: 400,
        line: { orientation: 'vertical', position: 0.5 },
        device: { backend: 'wasm' },
      })
      .expect(201);
    for (let i = 0; i < count; i++) {
      const body = frames[i % frames.length]!;
      for (const kind of mode === 'PHOTO' ? (['SAMPLE', 'KEY'] as const) : (['SAMPLE'] as const))
        await as(ctx, producer)
          .post(`${base()}/scans/${id}/frames`)
          .field('kind', kind)
          .field('index', String(i))
          .field('capturedMs', String(i * 167))
          .field('sha256', sha(body))
          .attach('file', body, { filename: `${i}.jpg`, contentType: 'image/jpeg' })
          .expect(201);
    }
    await as(ctx, producer)
      .post(`${base()}/scans/${id}/finalize`)
      .send({
        endedAt: new Date().toISOString(),
        durationS: mode === 'PHOTO' ? 0 : 20,
        expectedFrames: count,
        expectedKeyFrames: mode === 'PHOTO' ? count : 0,
        clientResult: { netCount: 7, observed: 7, preliminary: true },
      })
      .expect(201);
    return waitFor(async () => {
      const r = await as(ctx, producer).get(`${base()}/scans/${id}`).expect(200);
      return r.body.status === 'COMPLETED' ? r.body : null;
    });
  }

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: true });
    maria = await login(ctx, USERS.maria);
    const created = await as(ctx, maria)
      .post('/api/guarantee-requests')
      .send({
        producerName: 'Feedlot Don Mario S.A.',
        producerTaxId: '30-71548963-1',
        assetTypeCode: 'BOVINOS',
      })
      .expect(201);
    requestId = created.body.id;
    const token = String(created.body.invitation.url).split('/solicitud/')[1]!;
    await ctx
      .http()
      .post(`/api/producer/requests/${token}/accept`)
      .send({ email: 'corral@donmario.com.ar', password: 'Corral-2026-seguro' })
      .expect(201);
    producer = await login(ctx, 'corral@donmario.com.ar', 'Corral-2026-seguro');
    await as(ctx, producer)
      .post(`${base()}/establishment`)
      .send({
        name: 'Feedlot Don Mario',
        holderName: 'Feedlot Don Mario S.A.',
        holderTaxId: '30-71548963-1',
        renspa: '06.687.0.01542/00',
        establishmentType: 'FEEDLOT',
        tenure: 'OWNED',
        province: 'Buenos Aires',
        location: { latitude: -36.7905, longitude: -59.153 },
      })
      .expect(201);
    await as(ctx, producer)
      .post(`${base()}/asset`)
      .send({
        name: 'Corrales de engorde',
        declaredQuantity: 400,
        metadata: { sistema_productivo: 'Feedlot', raza_predominante: 'Aberdeen Angus' },
      })
      .expect(201);
    for (let n = 1; n <= 6; n++) frames.push(await readFile(CAMERA(n)));
  });
  afterAll(() => ctx.close());

  it('un escaneo sin cuadros se cierra como FALLIDO con el motivo (no queda sincronizando)', async () => {
    const id = randomUUID();
    await as(ctx, producer)
      .post(`${base()}/scans`)
      .send({
        id,
        mode: 'SWEEP',
        startedAt: new Date().toISOString(),
        sampledFps: 6,
        frameWidth: 640,
        frameHeight: 400,
        line: { orientation: 'vertical', position: 0.5 },
        device: { backend: 'wasm', model: 'yolox_nano' },
      })
      .expect(201);
    // El celular no llegó a guardar ningún cuadro y no tiene duración.
    const closed = await as(ctx, producer)
      .post(`${base()}/scans/${id}/finalize`)
      .send({
        endedAt: new Date().toISOString(),
        expectedFrames: 0,
        expectedKeyFrames: 0,
        clientResult: { preliminary: true },
      })
      .expect(201);
    expect(closed.body.status).toBe('FAILED');
    expect(closed.body.error).toContain('sin imágenes');
    // Reintentar el cierre devuelve lo mismo (idempotente) y la entidad ve el motivo.
    const again = await as(ctx, producer)
      .post(`${base()}/scans/${id}/finalize`)
      .send({
        endedAt: new Date().toISOString(),
        expectedFrames: 0,
        expectedKeyFrames: 0,
        clientResult: {},
      })
      .expect(201);
    expect(again.body.status).toBe('FAILED');
    const request = await as(ctx, maria).get(`/api/guarantee-requests/${requestId}`).expect(200);
    const list = await as(ctx, maria)
      .get(`/api/assets/${request.body.asset.id as string}/scans`)
      .expect(200);
    const seen = (list.body as { id: string; status: string; error: string | null }[]).find(
      (s) => s.id === id,
    )!;
    expect(seen).toMatchObject({ status: 'FAILED' });
    expect(seen.error).toContain('sin imágenes');
  });

  it('el modo foto no exige tasa de muestreo, los modos con video sí', async () => {
    await as(ctx, producer)
      .post(`${base()}/scans`)
      .send({
        id: randomUUID(),
        mode: 'PEN',
        startedAt: new Date().toISOString(),
        sampledFps: 0,
        frameWidth: 640,
        frameHeight: 400,
        line: { orientation: 'vertical', position: 0.5 },
      })
      .expect(422);
  });

  it('escáner de corral: animales únicos, cota inferior y estado de la evidencia', async () => {
    const done = await scan('PEN', 60);
    expect(done.mode).toBe('PEN');
    expect(done.modeLabel).toBe('Escáner de corral');
    expect(done.official.stillAnimals).toBe(true);
    expect(done.official.lowerBound).toBe(true);
    expect(done.official.pen.observed).toBe(done.official.count);
    expect(done.official.count).not.toBe(7); // nunca el del celular
    expect(['VALIDATED', 'INCONCLUSIVE', 'INSUFFICIENT']).toContain(done.evidenceStatus);
    expect(done.evidenceStatusLabel).toBeTruthy();
    const [evidence] = await ctx.dataSource.query(`SELECT metadata FROM evidence WHERE id = $1`, [
      done.evidenceId,
    ]);
    expect(evidence.metadata).toMatchObject({
      mode: 'PEN',
      lowerBound: true,
      stillAnimals: true,
      officialCount: done.official.count,
    });
  });

  it('análisis de fotos: varias fotos en una sesión, procesadas oficialmente', async () => {
    const done = await scan('PHOTO', 3);
    expect(done.modeLabel).toBe('Análisis de fotos');
    expect(done.official.metrics.registeredPhotos).toBe(3);
    expect(done.keyFrames).toBeUndefined();
    const detail = await as(ctx, maria).get(`/api/scans/${done.id}`).expect(200);
    expect(detail.body.keyFrames).toHaveLength(3);
    const request = await as(ctx, maria).get(`/api/guarantee-requests/${requestId}`).expect(200);
    const modes = (request.body.scans as { mode: string; lowerBound: boolean }[]).map((s) => [
      s.mode,
      s.lowerBound,
    ]);
    expect(modes).toEqual(
      expect.arrayContaining([
        ['PEN', true],
        ['PHOTO', true],
      ]),
    );
  });
});
