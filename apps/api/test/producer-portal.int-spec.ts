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

const CAMERA = (n: string) =>
  join(import.meta.dirname, `../../../infra/seed-assets/cameras/CAM-LE-0${n}.jpg`);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

describe('Portal del productor: invitación → cuenta → tareas → evidencia → pedido de información', () => {
  let ctx: TestContext;
  let maria: Session;
  let producer: Session;
  let requestId: string;
  let token: string;
  const base = () => `/api/producer/me/requests/${requestId}`;

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
        requestedAmount: 1_200_000,
      })
      .expect(201);
    requestId = created.body.id;
    token = String(created.body.invitation.url).split('/solicitud/')[1]!;
  });
  afterAll(() => ctx.close());

  it('el productor acepta la invitación, crea su acceso e ingresa al portal', async () => {
    const view = await ctx.http().get(`/api/producer/requests/${token}`).expect(200);
    expect(view.body.producerStatus).toBe('INVITATION_PENDING');
    await ctx
      .http()
      .post(`/api/producer/requests/${token}/accept`)
      .send({ email: 'campo@laesperanza.com.ar', password: 'Rodeo-2026-seguro' })
      .expect(201);
    // El link deja de ser credencial: ya no permite operar ni volver a aceptarse.
    await ctx
      .http()
      .post(`/api/producer/requests/${token}/accept`)
      .send({ email: 'otro@laesperanza.com.ar', password: 'Rodeo-2026-seguro' })
      .expect(409);
    await ctx.http().post(`/api/producer/requests/${token}/submit`).expect(403);

    producer = await login(ctx, 'campo@laesperanza.com.ar', 'Rodeo-2026-seguro');
    const overview = await as(ctx, producer).get('/api/producer/me').expect(200);
    expect(overview.body.requests).toHaveLength(1);
    expect(overview.body.tasks.map((t: { kind: string }) => t.kind)).toEqual(['ESTABLISHMENT']);
  });

  it('el productor no accede a la cartera del banco', async () => {
    await as(ctx, producer).get('/api/assets').expect(403);
    await as(ctx, producer).get('/api/guarantee-requests').expect(403);
    await as(ctx, maria).get('/api/producer/me').expect(403);
  });

  it('completa en varias sesiones: establecimiento existente, activo, fotos y documentos', async () => {
    const est = await as(ctx, producer)
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
    expect(est.body.establishment.name).toBe('La Esperanza');
    // Vuelve a entrar con una sesión nueva: el progreso se conserva.
    producer = await login(ctx, 'campo@laesperanza.com.ar', 'Rodeo-2026-seguro');
    const asset = await as(ctx, producer)
      .post(`${base()}/asset`)
      .send({
        name: 'Rodeo de cría',
        declaredQuantity: 1500,
        metadata: { sistema_productivo: 'Cría', raza_predominante: 'Aberdeen Angus' },
      })
      .expect(201);
    expect(asset.body.producerStatus).toBe('PENDING_EVIDENCE');
    expect(asset.body.guaranteeType.evidenceGuidance).toContain('rodeo');
    for (const n of ['1', '2', '3', '4', '5', '6', '1']) {
      await as(ctx, producer)
        .post(`${base()}/evidence`)
        .attach('file', await readFile(CAMERA(n)), `rodeo-${n}.jpg`)
        .field('description', 'Sector norte')
        .expect(201);
    }
    await as(ctx, producer)
      .post(`${base()}/documents`)
      .field('type', 'RENSPA')
      .attach('file', PDF, { filename: 'renspa.pdf', contentType: 'application/pdf' })
      .expect(201);
    const detail = await as(ctx, producer).get(base()).expect(200);
    expect(detail.body.evidenceCount).toBe(7);
    expect(detail.body.evidence).toHaveLength(7);
    expect(detail.body.documents.documents.map((d: { type: string }) => d.type)).toContain(
      'RENSPA',
    );
    expect(detail.body.verification).toBeNull();
  });

  it('envía la declaración: queda inmutable y se ejecuta la verificación', async () => {
    const sent = await as(ctx, producer).post(`${base()}/submit`).expect(201);
    expect(['VERIFYING', 'READY_FOR_VERIFICATION', 'VERIFIED']).toContain(sent.body.producerStatus);
    await as(ctx, producer)
      .post(`${base()}/asset`)
      .send({ name: 'Otro', declaredQuantity: 1 })
      .expect(409);
    const bank = await waitFor(async () => {
      const r = await as(ctx, maria).get(`/api/guarantee-requests/${requestId}`).expect(200);
      return r.body.stage === 'VERIFIED' ? r.body : null;
    });
    expect(bank.asset.declaredQuantity).toBe(1500);
    expect(typeof bank.verification.finalScore).toBe('number');
    // El productor ve el estado, no el score.
    const mine = await as(ctx, producer).get(base()).expect(200);
    expect(mine.body.producerStatus).toBe('VERIFIED');
    expect(mine.body.verification.finalScore).toBeUndefined();
  });

  it('la entidad pide más evidencia; el productor la aporta sin modificar la declaración', async () => {
    await as(ctx, maria)
      .post(`/api/guarantee-requests/${requestId}/information-requests`)
      .send({ kind: 'EVIDENCE', message: 'Agregá fotografías del rodeo desde otros sectores.' })
      .expect(201);
    const pending = await as(ctx, producer).get('/api/producer/me').expect(200);
    expect(pending.body.requests[0].producerStatus).toBe('INFO_REQUIRED');
    const task = pending.body.tasks.find((t: { kind: string }) => t.kind === 'INFO_EVIDENCE');
    expect(task.description).toContain('otros sectores');
    // Sin aportar nada nuevo no se puede responder.
    await as(ctx, producer)
      .post(`${base()}/information-requests/${task.informationRequestId}/respond`)
      .expect(422);
    await as(ctx, producer)
      .post(`${base()}/evidence`)
      .attach('file', await readFile(CAMERA('3')), 'sector-sur.jpg')
      .expect(201);
    const responded = await as(ctx, producer)
      .post(`${base()}/information-requests/${task.informationRequestId}/respond`)
      .expect(201);
    expect(responded.body.informationRequests[0].status).toBe('RESPONDED');
    expect(responded.body.asset.declaredQuantity).toBe(1500);
  });
});
