import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CollateralService } from '../src/modules/collateral/application/collateral.service.js';
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
const DAY = 86_400_000;
// Dentro del establecimiento declarado (mismo punto que su ubicación).
const FIELD = { latitude: -31.8653, longitude: -59.0269 };

type Guarantee = { id: string; code: string; state: string; requestId: string };

describe('Garantía bovina: verificación continua (Asset Passport)', () => {
  let ctx: TestContext;
  let maria: Session;
  let a: Guarantee;

  const inspect = (id: string, body: Record<string, unknown>) =>
    as(ctx, maria)
      .post(`/api/bovine-guarantees/${id}/inspection/record`)
      .send({
        inspectorName: 'Ing. Agr. Paula Ríos',
        performedAt: new Date().toISOString(),
        ...FIELD,
        fullCount: true,
        observations: 'Conteo en manga, animal por animal.',
        signatureName: 'Paula Ríos',
        signatureAccepted: true,
        ...body,
      });
  const passport = async (id: string) =>
    (await as(ctx, maria).get(`/api/bovine-guarantees/${id}/passport`).expect(200)).body;

  /** Banco crea la solicitud → productor declara por el link → envía. */
  async function declared(opts: {
    name: string;
    cuit: string;
    heads: number;
    system: string;
  }): Promise<Guarantee & { token: string }> {
    const created = await as(ctx, maria)
      .post('/api/guarantee-requests')
      .send({
        producerName: opts.name,
        producerTaxId: opts.cuit,
        assetTypeCode: 'BOVINOS',
        requestedAmount: 500_000,
      })
      .expect(201);
    const token = String(created.body.invitation.url).split('/solicitud/')[1]!;
    const list = await as(ctx, maria).get('/api/bovine-guarantees').expect(200);
    const g = list.body.items.find((i: { requestId: string }) => i.requestId === created.body.id);
    expect(g).toMatchObject({ state: 'PENDIENTE_DECLARACION', dataSource: 'REAL' });
    expect(g.code).toMatch(/^AG-\d{4,}$/);
    const p = (path: string) => ctx.http().post(`/api/producer/requests/${token}${path}`);
    await p('/establishment')
      .send({
        name: `Campo ${opts.name}`,
        holderName: opts.name,
        holderTaxId: opts.cuit,
        establishmentType: opts.system === 'Feedlot' ? 'FEEDLOT' : 'CRIA',
        tenure: 'OWNED',
        province: 'Entre Ríos',
        location: FIELD,
      })
      .expect(201);
    await p('/asset')
      .send({
        name: `Rodeo ${opts.name}`,
        declaredQuantity: opts.heads,
        metadata: { sistema_productivo: opts.system, raza_predominante: 'Angus' },
      })
      .expect(201);
    await p('/evidence')
      .attach('file', await readFile(CAMERA), 'rodeo.jpg')
      .field('captureOrigin', 'FILE')
      .expect(201);
    await p('/submit').expect(201);
    return { id: g.id, code: g.code, state: g.state, requestId: created.body.id, token };
  }

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: true });
    maria = await login(ctx, USERS.maria);
  });
  afterAll(() => ctx.close());

  it('banco crea → productor declara 1.000 → declaración congelada → verificación inicial', async () => {
    a = await declared({
      name: 'Feedlot Norte S.A.',
      cuit: '30-71548963-1',
      heads: 1000,
      system: 'Feedlot',
    });
    // La verificación del pipeline (fotos de galería, cota inferior) llega al passport.
    const p = await waitFor(async () => {
      const body = await passport(a.id);
      return body.verifications.length > 0 ? body : null;
    }, 60_000);
    expect(p.identity.productionType).toBe('FEEDLOT');
    expect(p.declaration.current).toMatchObject({ version: 1, heads: 1000, source: 'PRODUCTOR' });
    expect(p.verifications[0]).toMatchObject({
      method: 'FOTO',
      countBasis: 'COTA_INFERIOR',
      captureOrigin: 'ARCHIVO_CARGADO',
      quality: 'INSUFICIENTE',
    });
    // Foto de galería sin GPS: calidad insuficiente, con el motivo explicado.
    expect(p.verifications[0].qualityReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Archivo cargado'),
        'Sin ubicación GPS de captura.',
      ]),
    );
    // Una foto muestra una parte del rodeo: no se puede afirmar el total, y nunca "faltan".
    expect(p.header.state).toBe('NO_DETERMINABLE');
    expect(p.bovines.narrative.join(' ')).toContain('No implica faltante');
    expect(p.header.coverage.status).toBe('NO_DETERMINABLE');
    expect(
      p.officialSources.map((s: { code: string; status: string }) => `${s.code}:${s.status}`),
    ).toEqual([
      'RENSPA:SIN_CONEXION',
      'SIGSA:SIN_CONEXION',
      'DTE:SIN_CONEXION',
      'TRAZA:NO_DISPONIBLE',
    ]);
    expect(p.officialSources[0].action).toBe('SUBIR DOCUMENTO OFICIAL');
    expect(p.schedule).toMatchObject({ recommendedMethod: expect.any(String) });
    expect(p.score.components).toHaveLength(10);
    const alert = p.alerts.find((x: { type: string }) => x.type === 'BG_INSUFFICIENT_EVIDENCE');
    expect(alert.context).toMatchObject({
      what: expect.any(String),
      why: expect.any(String),
      action: expect.any(String),
    });
  });

  it('la declaración es inmutable en la base; una corrección crea una versión nueva', async () => {
    await expect(
      ctx.dataSource.query(`UPDATE collateral_declarations SET heads = 1 WHERE guarantee_id = $1`, [
        a.id,
      ]),
    ).rejects.toThrow(/inmutable/);
    await expect(
      ctx.dataSource.query(`DELETE FROM collateral_events WHERE guarantee_id = $1`, [a.id]),
    ).rejects.toThrow(/inmutable/);
    await as(ctx, maria)
      .post(`/api/bovine-guarantees/${a.id}/declaration`)
      .send({ heads: 1000, reason: '' })
      .expect(422);
    const r = await as(ctx, maria)
      .post(`/api/bovine-guarantees/${a.id}/declaration`)
      .send({
        heads: 1000,
        categories: [{ category: 'Novillos', heads: 1000 }],
        reason: 'Detalle por categoría',
      })
      .expect(201);
    expect(r.body.version).toBe(2);
    const p = await passport(a.id);
    expect(p.declaration.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(p.declaration.versions[1].heads).toBe(1000);
  });

  it('1.000 − 25 salidas = 975; inspección cuenta 975 → VERIFICADA', async () => {
    await as(ctx, maria)
      .post(`/api/bovine-guarantees/${a.id}/movements`)
      .send({
        direction: 'EGRESO',
        kind: 'VENTA',
        heads: 25,
        occurredAt: new Date().toISOString(),
        destination: 'Frigorífico',
      })
      .expect(201);
    let p = await passport(a.id);
    expect(p.bovines).toMatchObject({ declared: 1000, exits: 25, expected: 975 });
    expect(p.movements[0]).toMatchObject({
      sourceLevel: 'DECLARADO',
      verificationState: 'PENDIENTE',
    });
    expect(p.alerts.map((x: { type: string }) => x.type)).toContain('BG_UNEXPECTED_MOVEMENT');

    const ins = await inspect(a.id, { observedHeads: 975, result: 'CONFORME' }).expect(201);
    expect(ins.body.signatureHash).toMatch(/^[0-9a-f]{64}$/);
    p = await passport(a.id);
    expect(p.bovines).toMatchObject({
      expected: 975,
      observed: 975,
      observedBasis: 'CENSO',
      unexplainedDifference: 0,
      consistency: 'CONSISTENTE',
    });
    expect(p.header.state).toBe('VERIFICADA');
    expect(p.header.trust.verdict).toBe('SI');
    // La alerta de evidencia insuficiente se cerró sola (sin borrarse).
    const closed = p.alerts.find((x: { type: string }) => x.type === 'BG_INSUFFICIENT_EVIDENCE');
    expect(closed.status).toBe('RESOLVED');
    expect(p.header.nextVerificationAt).toBeTruthy();
    // El acta realizada no se puede modificar.
    await expect(
      ctx.dataSource.query(`UPDATE collateral_inspections SET observed_heads = 1 WHERE id = $1`, [
        ins.body.id,
      ]),
    ).rejects.toThrow(/realizada/);
  });

  it('cobertura: no determinable sin precio; con peso, precio y factor se calcula contra la deuda', async () => {
    await as(ctx, maria)
      .patch(`/api/bovine-guarantees/${a.id}`)
      .send({ debtAmount: 390_000, averageWeightKg: 400, weightSource: 'Balanza del feedlot' })
      .expect(200);
    let c = (await as(ctx, maria).get(`/api/bovine-guarantees/${a.id}/coverage`).expect(200)).body;
    expect(c.status).toBe('NO_DETERMINABLE');
    expect(c.missing).toEqual(['precio de referencia por kg', 'factor de calidad']);
    await as(ctx, maria)
      .patch(`/api/bovine-guarantees/${a.id}`)
      .send({
        pricePerKg: 2,
        priceCurrency: 'USD',
        priceSource: 'Mercado Agroganadero',
        priceDate: new Date().toISOString().slice(0, 10),
        qualityFactor: 0.9,
      })
      .expect(200);
    c = (await as(ctx, maria).get(`/api/bovine-guarantees/${a.id}/coverage`).expect(200)).body;
    expect(c).toMatchObject({
      status: 'DETERMINADA',
      verifiableHeads: 975,
      verifiableValue: 702_000,
      ratio: 1.8,
      ratioBasis: 'DEUDA',
    });
  });

  it('una inspección que cuenta 720 contra 975 esperados → REQUIERE_INSPECCION con alerta explicada', async () => {
    await inspect(a.id, {
      observedHeads: 720,
      result: 'NO_CONFORME',
      discrepancies: [{ topic: 'Cantidad', description: 'Faltan corrales 4 y 5' }],
    }).expect(201);
    const p = await passport(a.id);
    expect(p.header.state).toBe('REQUIERE_INSPECCION');
    expect(p.header.trust.verdict).toBe('NO');
    expect(p.bovines.unexplainedDifference).toBe(-255);
    const alert = p.alerts.find(
      (x: { type: string; status: string }) =>
        x.type === 'BG_QUANTITY_DIFFERENCE' && x.status === 'OPEN',
    );
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.context.what).toContain('La cantidad esperada es 975');
    expect(alert.recommendedAction).toMatch(/inspección/);
    const timeline = (
      await as(ctx, maria).get(`/api/bovine-guarantees/${a.id}/timeline`).expect(200)
    ).body;
    expect(timeline.find((e: { type: string }) => e.type === 'ESTADO_CAMBIADO')).toMatchObject({
      previousState: 'VERIFICADA',
      newState: 'REQUIERE_INSPECCION',
    });

    // Alertas: responsable, revisión y descarte con nota (nunca se borran).
    await as(ctx, maria)
      .patch(`/api/alerts/${alert.id}`)
      .send({ ownerUserId: maria.userId, status: 'IN_REVIEW' })
      .expect(200);
    await as(ctx, maria).patch(`/api/alerts/${alert.id}`).send({ status: 'DISMISSED' }).expect(422);
    const dismissed = await as(ctx, maria)
      .patch(`/api/alerts/${alert.id}`)
      .send({ status: 'DISMISSED', resolutionNote: 'Se repite la inspección' })
      .expect(200);
    expect(dismissed.body).toMatchObject({ status: 'DISMISSED', ownerUserId: maria.userId });
  });

  it('evidencia vieja → REQUIERE_EVIDENCIA; el productor corrige su declaración con una versión nueva', async () => {
    const b = await declared({
      name: 'Cabaña Sur S.A.',
      cuit: '30-71549896-7',
      heads: 300,
      system: 'Cría',
    });
    await inspect(b.id, {
      observedHeads: 300,
      result: 'CONFORME',
      performedAt: new Date(Date.now() - 100 * DAY).toISOString(),
    }).expect(201);
    const p = await passport(b.id);
    expect(p.header.state).toBe('REQUIERE_EVIDENCIA');
    expect(p.score.gates.map((g: { code: string }) => g.code)).toContain('EVIDENCIA_VENCIDA');
    expect(p.alerts.map((x: { type: string }) => x.type)).toContain('BG_EVIDENCE_EXPIRED');

    // Productor con acceso propio: ve su declaración congelada y pide una corrección.
    await ctx
      .http()
      .post(`/api/producer/requests/${b.token}/accept`)
      .send({ email: 'cabana@sur.com.ar', password: 'Rodeo-2026-seguro' })
      .expect(201);
    const producer = await login(ctx, 'cabana@sur.com.ar', 'Rodeo-2026-seguro');
    const view = await as(ctx, producer)
      .get(`/api/producer/me/requests/${b.requestId}/declaration`)
      .expect(200);
    expect(view.body).toMatchObject({ frozen: true, declarations: [{ version: 1, heads: 300 }] });
    const corrected = await as(ctx, producer)
      .post(`/api/producer/me/requests/${b.requestId}/declaration/corrections`)
      .send({ heads: 298, reason: 'Murieron 2 terneros' })
      .expect(201);
    expect(corrected.body.declarations.map((d: { version: number }) => d.version)).toEqual([2, 1]);
    // Otro productor no puede corregir una garantía ajena.
    await as(ctx, producer)
      .post(`/api/producer/me/requests/${a.requestId}/declaration/corrections`)
      .send({ heads: 1, reason: 'x' })
      .expect(403);
  });

  it('la frecuencia sale de la política configurable (no del código)', async () => {
    const before = (await as(ctx, maria).get('/api/bovine-guarantees/policies').expect(200)).body;
    expect(before.FEEDLOT.BAJO).toMatchObject({ frequencyDays: 30 });
    await as(ctx, maria)
      .put('/api/bovine-guarantees/policies')
      .send({
        productionType: 'FEEDLOT',
        riskLevel: 'BAJO',
        frequencyDays: 21,
        maxEvidenceAgeDays: 30,
        recommendedMethod: 'ESCANER_FIJO',
        requiresInspection: false,
      })
      .expect(200);
    const after = (await as(ctx, maria).get('/api/bovine-guarantees/policies').expect(200)).body;
    expect(after.FEEDLOT.BAJO.frequencyDays).toBe(21);
    expect(after.CRIA.BAJO.frequencyDays).toBe(90);
  });

  it('dashboard: KPIs solo con datos reales; las DEMO aparecen marcadas y aparte', async () => {
    const demo = await as(ctx, maria)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'COMPLETE' })
      .expect(201);
    const real = (await as(ctx, maria).get('/api/bovine-guarantees').expect(200)).body;
    expect(real.items.every((i: { dataSource: string }) => i.dataSource === 'REAL')).toBe(true);
    expect(real.demoGuarantees).toBeGreaterThanOrEqual(1);
    expect(real.kpis).toMatchObject({
      activeGuarantees: expect.any(Number),
      openAlerts: expect.any(Number),
    });
    expect(real.kpis.atRisk).toBeGreaterThanOrEqual(1);
    const all = (await as(ctx, maria).get('/api/bovine-guarantees?includeDemo=true').expect(200))
      .body;
    const demoRow = all.items.find(
      (i: { requestId: string }) => i.requestId === demo.body.requestId,
    );
    expect(demoRow.dataSource).toBe('DEMO');
    const filtered = (
      await as(ctx, maria).get('/api/bovine-guarantees?state=REQUIERE_INSPECCION').expect(200)
    ).body;
    expect(filtered.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
    const pdf = await as(ctx, maria)
      .get(`/api/bovine-guarantees/${demoRow.id}/passport.pdf`)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const text = await as(ctx, maria)
      .get(`/api/bovine-guarantees/${demoRow.id}/passport`)
      .expect(200);
    expect(text.body.limitations[0]).toContain('DATOS DE DEMOSTRACIÓN');
  });

  it('PDF del passport, otra entidad no lo ve, y el barrido programado reevalúa sin romper', async () => {
    const pdf = await as(ctx, maria)
      .get(`/api/bovine-guarantees/${a.id}/passport.pdf`)
      .buffer(true)
      .expect(200);
    expect(pdf.headers['content-disposition']).toContain(`asset-passport-${a.code}.pdf`);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const other = await login(ctx, USERS.otherOrg);
    await as(ctx, other).get(`/api/bovine-guarantees/${a.id}/passport`).expect(404);
    const evaluated = await ctx.app.get(CollateralService).sweep(new Date(Date.now() + 40 * DAY));
    expect(evaluated).toBeGreaterThanOrEqual(2);
    const p = await passport(a.id);
    expect(p.score.history.length).toBeGreaterThan(3);
    // Un segundo barrido no reevalúa garantías ya vencidas en agenda ni ensucia el historial.
    const events = async () =>
      (
        (await ctx.dataSource.query(`SELECT count(*)::int AS n FROM collateral_events`)) as {
          n: number;
        }[]
      )[0]!.n;
    const before = await events();
    expect(await ctx.app.get(CollateralService).sweep(new Date())).toBe(0);
    expect(await events()).toBe(before);
  });

  it('demos de garantía bovina: VERIFICADA y REQUIERE_INSPECCION, siempre marcadas DEMO', async () => {
    const make = async (scenario: string) => {
      const r = await as(ctx, maria)
        .post('/api/demo/guarantee-requests')
        .send({ scenario })
        .expect(201);
      expect(r.body.guaranteeId).toBeTruthy();
      return passport(r.body.guaranteeId as string);
    };
    const ok = await make('GUARANTEE_VERIFIED');
    expect(ok.header).toMatchObject({ state: 'VERIFICADA', dataSource: 'DEMO' });
    expect(ok.bovines).toMatchObject({ declared: 1000, exits: 25, expected: 975, observed: 975 });
    expect(ok.coverage).toMatchObject({ status: 'DETERMINADA', verifiableHeads: 975 });
    expect(ok.limitations[0]).toContain('DATOS DE DEMOSTRACIÓN');
    const diff = await make('GUARANTEE_INSPECTION');
    expect(diff.header.state).toBe('REQUIERE_INSPECCION');
    expect(diff.bovines.unexplainedDifference).toBe(-255);
    expect(diff.alerts.map((a: { type: string }) => a.type)).toContain('BG_QUANTITY_DIFFERENCE');
  });
});
