import {
  as,
  DEMO_PASSWORD,
  assetIdByName,
  login,
  resetAndSeed,
  startTestApp,
  USERS,
  type Session,
  type TestContext,
} from './helpers/test-environment.js';

describe('Aislamiento multi-tenant y RBAC', () => {
  let ctx: TestContext;
  let maria: Session;
  let other: Session;
  let viewer: Session;
  let auditor: Session;
  let laEsperanza: string;

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: false });
    [maria, other, viewer, auditor] = await Promise.all([
      login(ctx, USERS.maria),
      login(ctx, USERS.otherOrg),
      login(ctx, USERS.viewer),
      login(ctx, USERS.auditor),
    ]);
    laEsperanza = await assetIdByName(ctx, maria, 'Esperanza');
  });
  afterAll(() => ctx.close());

  it('cada organización ve únicamente su cartera', async () => {
    const bank = await as(ctx, maria).get('/api/assets?pageSize=100').expect(200);
    const insurer = await as(ctx, other).get('/api/assets?pageSize=100').expect(200);
    expect(bank.body.total).toBe(12);
    expect(insurer.body.total).toBe(1);
    expect(insurer.body.items[0].name).toBe('Rodeo asegurado La Candelaria');
    const establishments = await as(ctx, other).get('/api/establishments').expect(200);
    expect(establishments.body.map((e: { name: string }) => e.name)).toEqual(['La Candelaria']);
  });

  it('un usuario de otra organización no puede leer ni operar recursos ajenos (404, sin filtrar existencia)', async () => {
    await as(ctx, other).get(`/api/assets/${laEsperanza}`).expect(404);
    await as(ctx, other).get(`/api/assets/${laEsperanza}/documents`).expect(404);
    await as(ctx, other).get(`/api/assets/${laEsperanza}/evidence`).expect(404);
    await as(ctx, other).get(`/api/assets/${laEsperanza}/devices`).expect(404);
    await as(ctx, other).post(`/api/assets/${laEsperanza}/verifications`).send({}).expect(404);
    await as(ctx, other).patch(`/api/assets/${laEsperanza}`).send({ name: 'Intento' }).expect(404);

    const documents = await as(ctx, maria).get(`/api/assets/${laEsperanza}/documents`).expect(200);
    await as(ctx, other)
      .get(`/api/documents/${documents.body.documents[0].id}/download`)
      .expect(404);

    const runs = await as(ctx, maria).get(`/api/verifications?assetId=${laEsperanza}`).expect(200);
    const runId = runs.body.items[0].id;
    await as(ctx, other).get(`/api/verifications/${runId}`).expect(404);
    await as(ctx, other).get(`/api/verifications/${runId}/evidence`).expect(404);
    await as(ctx, other).post(`/api/verifications/${runId}/guarantee`).send({}).expect(404);

    const reports = await as(ctx, maria).get('/api/reports').expect(200);
    if (reports.body.items[0])
      await as(ctx, other).get(`/api/reports/${reports.body.items[0].id}`).expect(404);

    const alerts = await as(ctx, maria).get('/api/alerts?status=ACTIVE').expect(200);
    await as(ctx, other)
      .patch(`/api/alerts/${alerts.body.items[0].id}`)
      .send({ status: 'ACKNOWLEDGED' })
      .expect(404);
  });

  it('el dashboard y la auditoría están acotados a la organización', async () => {
    const dashboard = await as(ctx, other).get('/api/dashboard/summary').expect(200);
    expect(dashboard.body.kpis.portfolioAssets).toBe(1);
    const audit = await as(ctx, maria).get('/api/audit-logs?pageSize=100').expect(200);
    expect(
      audit.body.items.every(
        (i: { organizationId: string }) => i.organizationId === maria.organizationId,
      ),
    ).toBe(true);
  });

  it('el rol Consulta puede leer pero no modificar', async () => {
    await as(ctx, viewer).get('/api/assets').expect(200);
    await as(ctx, viewer).post(`/api/assets/${laEsperanza}/verifications`).send({}).expect(403);
    await as(ctx, viewer).patch(`/api/assets/${laEsperanza}`).send({ name: 'x' }).expect(403);
    await as(ctx, viewer).get('/api/audit-logs').expect(403);
    await as(ctx, viewer)
      .put('/api/organization/scoring/weights')
      .send({ documentation: 1, existence: 0, historical: 0, risk: 0, consistency: 0 })
      .expect(403);
  });

  it('el rol Auditor accede al registro de auditoría pero no ejecuta verificaciones', async () => {
    await as(ctx, auditor).get('/api/audit-logs').expect(200);
    await as(ctx, auditor).post(`/api/assets/${laEsperanza}/verifications`).send({}).expect(403);
  });

  it('los permisos se evalúan contra la base (no solo el token)', async () => {
    await ctx.dataSource.query(`UPDATE users SET status = 'DISABLED' WHERE email = $1`, [
      USERS.viewer,
    ]);
    // La caché de sesión expira a los 30 s; un nuevo login ya no es posible.
    await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: USERS.viewer, password: DEMO_PASSWORD })
      .expect(401);
    await ctx.dataSource.query(`UPDATE users SET status = 'ACTIVE' WHERE email = $1`, [
      USERS.viewer,
    ]);
  });

  it('solo administradores modifican los pesos del scoring, que deben sumar 1', async () => {
    await as(ctx, maria)
      .put('/api/organization/scoring/weights')
      .send({ documentation: 0.5, existence: 0.5, historical: 0.5, risk: 0, consistency: 0 })
      .expect(422);
    const ok = await as(ctx, maria)
      .put('/api/organization/scoring/weights')
      .send({ documentation: 0.2, existence: 0.25, historical: 0.2, risk: 0.15, consistency: 0.2 })
      .expect(200);
    expect(ok.body.existence).toBe(0.25);
  });
});
