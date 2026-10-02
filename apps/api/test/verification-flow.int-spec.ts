import {
  as,
  assetIdByName,
  fetchBytes,
  login,
  resetAndSeed,
  startTestApp,
  USERS,
  waitFor,
  type Session,
  type TestContext,
} from './helpers/test-environment.js';

describe('Flujo de verificación (API + worker + BullMQ)', () => {
  let ctx: TestContext;
  let maria: Session;
  let laEsperanza: string;
  let runId: string;

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: true });
    maria = await login(ctx, USERS.maria);
    laEsperanza = await assetIdByName(ctx, maria, 'Esperanza');
  });
  afterAll(() => ctx.close());

  const waitCompleted = (id: string) =>
    waitFor(async () => {
      const response = await as(ctx, maria).get(`/api/verifications/${id}`).expect(200);
      return ['COMPLETED', 'FAILED'].includes(response.body.status) ? response.body : null;
    });

  it('responde 202 de inmediato y procesa en segundo plano', async () => {
    const response = await as(ctx, maria)
      .post(`/api/assets/${laEsperanza}/verifications`)
      .send({})
      .expect(202);
    expect(response.body.status).toBe('PENDING');
    runId = response.body.id;
    const asset = await as(ctx, maria).get(`/api/assets/${laEsperanza}`).expect(200);
    expect(asset.body.status).toBe('PENDING_VERIFICATION');
  });

  it('impide verificaciones concurrentes del mismo activo (409)', async () => {
    const run = await as(ctx, maria).get(`/api/verifications/${runId}`).expect(200);
    if (run.body.status === 'PENDING' || run.body.status === 'PROCESSING') {
      await as(ctx, maria).post(`/api/assets/${laEsperanza}/verifications`).send({}).expect(409);
    }
  });

  it('obtiene 1.490 detectados (verdad de campo de las composiciones; CV simulado en tests), 99,3 % de coincidencia y score 82/100 explicable', async () => {
    const run = await waitCompleted(runId);
    expect(run.status).toBe('COMPLETED');
    expect(run.result).toMatchObject({
      declaredQuantity: 1500,
      detectedQuantity: 1490,
      matchPercentage: 99.33,
      finalScore: 82,
      outcome: 'VERIFIED',
      riskLevel: 'MEDIUM',
      locationVerified: true,
      scoringModelVersion: 'agro-score/1.1.0',
    });
    expect(run.result.components.map((c: { score: number }) => c.score)).toEqual([
      90, 85, 70, 68, 95,
    ]);
    expect(run.inputSnapshot).toMatchObject({ declaredQuantity: 1500, assetTypeCode: 'BOVINOS' });
    expect(run.externalData[0]).toMatchObject({
      source: 'SENASA_RENSPA',
      simulated: true,
      status: 'OK',
    });
    expect(run.history).toHaveLength(5);
    const metrics = Object.fromEntries(
      run.metrics.map((m: { key: string; value: number }) => [m.key, m.value]),
    );
    expect(metrics).toMatchObject({
      detected_quantity: 1490,
      cameras_reporting: 6,
      final_score: 82,
    });
    const asset = await as(ctx, maria).get(`/api/assets/${laEsperanza}`).expect(200);
    expect(asset.body).toMatchObject({
      status: 'VERIFIED',
      lastScore: 82,
      lastDetectedQuantity: 1490,
    });
  });

  it('expone la evidencia utilizada: imagen, cámara, ubicación, modelo y confianza', async () => {
    const evidence = await as(ctx, maria).get(`/api/verifications/${runId}/evidence`).expect(200);
    expect(evidence.body).toHaveLength(6);
    for (const item of evidence.body) {
      expect(item.role).toBe('PRIMARY');
      expect(item.evidence.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(item.evidence.location.type).toBe('Point');
      expect(item.evidence.url).toContain('X-Amz-Signature');
      expect(item.analysis.model.code).toBeDefined();
      expect(item.confidence).toBeGreaterThan(0.8);
    }
    const total = evidence.body.reduce(
      (acc: number, i: { detectedCount: number }) => acc + i.detectedCount,
      0,
    );
    expect(total).toBe(1490);
  });

  it('las verificaciones cerradas son inmutables a nivel de base de datos', async () => {
    await expect(
      ctx.dataSource.query(`UPDATE verification_runs SET status = 'FAILED' WHERE id = $1`, [runId]),
    ).rejects.toThrow(/inmutable/);
    await expect(
      ctx.dataSource.query(
        `UPDATE verification_results SET final_score = 99 WHERE verification_run_id = $1`,
        [runId],
      ),
    ).rejects.toThrow(/inmutable/);
    await expect(ctx.dataSource.query(`DELETE FROM audit_logs`)).rejects.toThrow(/inmutable/);
  });

  it('genera el informe de garantía (PDF, CSV y JSON) automáticamente', async () => {
    const report = await waitFor(async () => {
      const response = await as(ctx, maria).get(`/api/reports?assetId=${laEsperanza}`).expect(200);
      const item = response.body.items.find(
        (r: { verificationId: string }) => r.verificationId === runId,
      );
      return item?.status === 'READY' ? item : null;
    });
    expect(Object.keys(report.formats).sort()).toEqual(['CSV', 'JSON', 'PDF']);
    const download = await as(ctx, maria)
      .get(`/api/reports/${report.id}/download?format=JSON`)
      .expect(200);
    const content = (await fetch(download.body.url).then((r) => r.json())) as {
      simulatedSources: string[];
    };
    expect(content).toMatchObject({
      verificationId: runId,
      result: { finalScore: 82, detectedQuantity: 1490 },
    });
    expect(content.simulatedSources.length).toBeGreaterThan(0);
    const pdf = await as(ctx, maria)
      .get(`/api/reports/${report.id}/download?format=PDF`)
      .expect(200);
    const bytes = await fetchBytes(pdf.body.url);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('confirma el activo como garantía una única vez', async () => {
    const guarantee = await as(ctx, maria)
      .post(`/api/verifications/${runId}/guarantee`)
      .send({})
      .expect(201);
    expect(guarantee.body).toMatchObject({
      status: 'ACTIVE',
      coveredQuantity: 1490,
      currency: 'USD',
    });
    await as(ctx, maria).post(`/api/verifications/${runId}/guarantee`).send({}).expect(409);
  });

  it('genera alertas cuando la cantidad detectada es significativamente menor', async () => {
    const establishmentId = (await as(ctx, maria).get(`/api/assets/${laEsperanza}`)).body
      .establishment.id;
    const evidenceUrl = (await as(ctx, maria).get(`/api/verifications/${runId}/evidence`)).body[0]
      .evidence.url;
    const image = await fetchBytes(evidenceUrl);
    const asset = await as(ctx, maria)
      .post('/api/assets')
      .send({
        establishmentId,
        assetTypeCode: 'BOVINOS',
        name: 'Rodeo de recría — potreros del fondo',
        declaredQuantity: 400,
        declaredValue: 340_000,
        metadata: { sistema_productivo: 'Recría', raza_predominante: 'Hereford' },
      })
      .expect(201);
    await as(ctx, maria)
      .post(`/api/assets/${asset.body.id}/evidence`)
      .attach('file', image, { filename: 'recorrida.jpg', contentType: 'image/jpeg' })
      .field('latitude', '-36.7905')
      .field('longitude', '-59.1530')
      .expect(201);
    const run = await as(ctx, maria)
      .post(`/api/assets/${asset.body.id}/verifications`)
      .send({})
      .expect(202);
    const result = await waitCompleted(run.body.id);
    expect(result.result.detectedQuantity).toBeLessThan(360);
    const alerts = await as(ctx, maria).get(`/api/alerts?assetId=${asset.body.id}`).expect(200);
    expect(alerts.body.items.map((a: { type: string }) => a.type)).toContain(
      'QUANTITY_BELOW_DECLARED',
    );

    const alert = alerts.body.items.find(
      (a: { type: string }) => a.type === 'QUANTITY_BELOW_DECLARED',
    );
    await as(ctx, maria).patch(`/api/alerts/${alert.id}`).send({ status: 'RESOLVED' }).expect(422);
    const resolved = await as(ctx, maria)
      .patch(`/api/alerts/${alert.id}`)
      .send({
        status: 'RESOLVED',
        resolutionNote: 'Parte del rodeo se trasladó a otro establecimiento declarado.',
      })
      .expect(200);
    expect(resolved.body.status).toBe('RESOLVED');
  });

  it('el monitoreo programado dispara verificaciones vencidas', async () => {
    await ctx.dataSource
      .query(`UPDATE monitoring_configurations SET next_run_at = now() - interval '1 minute'
      WHERE asset_id = (SELECT id FROM assets WHERE name = 'Silobolsas Lote 3 — soja')`);
    const { MonitoringSchedulerService } =
      await import('../src/modules/monitoring/application/monitoring-scheduler.service.js');
    const result = await ctx.worker!.get(MonitoringSchedulerService).tick();
    expect(result.dispatched).toBe(1);
    const silobolsas = await assetIdByName(ctx, maria, 'Silobolsas');
    const runs = await as(ctx, maria).get(`/api/verifications?assetId=${silobolsas}`).expect(200);
    expect(runs.body.items[0].trigger).toBe('SCHEDULED');
    await waitCompleted(runs.body.items[0].id);
  });
});
