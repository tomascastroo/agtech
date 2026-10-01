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

const CAMERA = join(import.meta.dirname, '../../../infra/seed-assets/cameras/CAM-LE-01.jpg');

describe('Solicitud de garantía: banco → link → productor → verificación → banco', () => {
  let ctx: TestContext;
  let maria: Session;
  let requestId: string;
  let token: string;
  const producer = () => ctx.http();

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: true });
    maria = await login(ctx, USERS.maria);
  });
  afterAll(() => ctx.close());

  it('el banco crea la solicitud y obtiene el link de invitación', async () => {
    const response = await as(ctx, maria)
      .post('/api/guarantee-requests')
      .send({
        producerName: 'Agropecuaria Demo S.A.',
        producerTaxId: '30-71548963-1',
        assetTypeCode: 'BOVINOS',
        requestedAmount: 900000,
      })
      .expect(201);
    expect(response.body.stage).toBe('INVITED');
    expect(response.body.missing).toContain('establecimiento');
    requestId = response.body.id;
    token = String(response.body.invitation.url).split('/solicitud/')[1]!;
    expect(token.length).toBeGreaterThan(30);
  });

  it('el link inválido no da acceso', async () => {
    await producer().get('/api/producer/requests/token-invalido-de-prueba-0000').expect(404);
  });

  it('el productor completa establecimiento, activo y evidencia con el link', async () => {
    const view = await producer().get(`/api/producer/requests/${token}`).expect(200);
    expect(view.body.requester.name).toBe('Banco del Campo');
    expect(view.body.verification).toBeUndefined();
    await producer()
      .post(`/api/producer/requests/${token}/establishment`)
      .send({
        name: 'Estancia Demo',
        holderName: 'Agropecuaria Demo S.A.',
        holderTaxId: '30-71548963-1',
        establishmentType: 'CRIA',
        tenure: 'OWNED',
        province: 'Buenos Aires',
        location: { latitude: -36.79, longitude: -59.15 },
      })
      .expect((r) => {
        if (r.status !== 201) throw new Error(JSON.stringify(r.body));
      });
    const withAsset = await producer()
      .post(`/api/producer/requests/${token}/asset`)
      .send({
        name: 'Rodeo Demo',
        declaredQuantity: 250,
        metadata: { sistema_productivo: 'Cría', raza_predominante: 'Angus' },
      })
      .expect((r) => {
        if (r.status !== 201) throw new Error(JSON.stringify(r.body));
      });
    expect(withAsset.body.missing).toEqual(['evidencia (fotos)']);
    await producer()
      .post(`/api/producer/requests/${token}/evidence`)
      .attach('file', await readFile(CAMERA), 'rodeo.jpg')
      .expect(201);
  });

  it('el productor envía la declaración y queda lista para verificar', async () => {
    const response = await producer().post(`/api/producer/requests/${token}/submit`).expect(201);
    expect(response.body.status).toBe('READY_FOR_VERIFICATION');
    // Ya enviada, la declaración no se puede modificar.
    await producer()
      .post(`/api/producer/requests/${token}/asset`)
      .send({ name: 'Otro', declaredQuantity: 1 })
      .expect(409);
  });

  it('el banco ve el resultado de la verificación y no puede editar la declaración', async () => {
    const detail = await waitFor(async () => {
      const r = await as(ctx, maria).get(`/api/guarantee-requests/${requestId}`).expect(200);
      return r.body.stage === 'VERIFIED' ? r.body : null;
    });
    expect(detail.asset.declaredQuantity).toBe(250);
    expect(detail.verification).toMatchObject({ status: 'COMPLETED', declaredQuantity: 250 });
    expect(typeof detail.verification.finalScore).toBe('number');
    expect(detail.evidenceCount).toBe(1);
    await as(ctx, maria)
      .patch(`/api/assets/${detail.asset.id}`)
      .send({ declaredQuantity: 300 })
      .expect(403);
  });
});
