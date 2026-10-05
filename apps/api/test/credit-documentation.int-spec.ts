import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfig } from '../src/config/app-config.js';
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

const DOCS = join(import.meta.dirname, '../../../infra/seed-assets/demo-documents');

/**
 * Lector de documentos de PRUEBA: responde lo que el OCR real (RapidOCR, ai-service) lee de cada
 * documento de demostración (ver apps/ai-service/tests/test_documents.py, que corre el OCR real
 * sobre los mismos archivos). Así la integración de la API no depende del servicio Python.
 */
const READINGS: Record<string, { type: string; entries: [string, string][] }> = {
  'constancia-cuit': {
    type: 'ID_CUIT',
    entries: [
      ['HOLDER', 'JUAN PEREZ'],
      ['CUIT', '20000000019'],
      ['LOCALITY', 'VILLAGUAY'],
      ['PROVINCE', 'Entre Ríos'],
    ],
  },
  renspa: {
    type: 'RENSPA',
    entries: [
      ['RENSPA', '99.001.0.00001/00'],
      ['HOLDER', 'JUAN PEREZ'],
      ['CUIT', '20000000019'],
      ['ESTABLISHMENT', 'LA ESPERANZA'],
      ['LOCALITY', 'VILLAGUAY'],
      ['PROVINCE', 'Entre Ríos'],
    ],
  },
  'renspa-inconsistente': {
    type: 'RENSPA',
    entries: [
      ['RENSPA', '99.001.0.00002/00'],
      ['HOLDER', 'JUAN PEREZ'],
      ['CUIT', '20000000019'],
      ['ESTABLISHMENT', 'LA ESPERANZA'],
    ],
  },
  'certificado-vacunacion': {
    type: 'SANITARY_CERTIFICATE',
    entries: [
      ['RENSPA', '99.001.0.00001/00'],
      ['HOLDER', 'JUAN PEREZ'],
      ['ESTABLISHMENT', 'LA ESPERANZA'],
      ['EXPIRES_AT', '2030-12-31'],
    ],
  },
  'contrato-arrendamiento': {
    type: 'LEASE_CONTRACT',
    entries: [
      ['HOLDER', 'JUAN PEREZ'],
      ['ESTABLISHMENT', 'LA ESPERANZA'],
      ['LOCALITY', 'VILLAGUAY'],
      ['PROVINCE', 'Entre Ríos'],
    ],
  },
};

function fakeOcr(body: string) {
  const fileName = /filename="([^"]+)"/.exec(body)?.[1] ?? '';
  const key = Object.keys(READINGS)
    .sort((a, b) => b.length - a.length)
    .find((k) => fileName.startsWith(k));
  const reading = key ? READINGS[key]! : { type: 'UNKNOWN', entries: [] };
  const values = (field: string) => reading.entries.filter(([f]) => f === field).map(([, v]) => v);
  const cuit = values('CUIT').map((d) => `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`);
  const text = `DOCUMENTO DE DEMOSTRACION - SIN VALOR\n${reading.entries.map(([f, v]) => `${f}: ${v}`).join('\n')}`;
  return {
    method: 'OCR',
    text_confidence: 0.97,
    pages: 1,
    lines: reading.entries.length + 1,
    text_excerpt: text,
    text,
    detected_type: reading.type,
    classification_score: 6,
    classification_keywords: [],
    fields: {
      renspa: values('RENSPA'),
      cuit,
      holder_names: values('HOLDER'),
      issued_at: null,
      expires_at: values('EXPIRES_AT')[0] ?? null,
      dates: values('EXPIRES_AT'),
      establishment_names: values('ESTABLISHMENT'),
      localities: values('LOCALITY'),
      provinces: values('PROVINCE'),
      head_counts: [],
      vaccines: [],
    },
    entries: reading.entries.map(([field, normalized], line) => ({
      field,
      original: normalized,
      normalized,
      confidence: 0.97,
      line: line + 1,
    })),
    engine: 'test-reader',
    version: 'test',
    processing_ms: 1,
  };
}

interface ChecklistItem {
  code: string;
  status: string;
  reason: string;
  obligation: string;
  requested: unknown;
  document: { demo: boolean } | null;
}

describe('Documentación de crédito, OCR y simulación de solicitudes', () => {
  let ctx: TestContext;
  let maria: Session;
  let server: Server;
  const previousAiUrl = process.env.AI_SERVICE_URL;

  const checklist = async (id: string) => {
    const r = await as(ctx, maria).get(`/api/guarantee-requests/${id}`).expect(200);
    return r.body as {
      dataSource: string;
      documentation: { items: ChecklistItem[]; summary: Record<string, number> };
      dataLayers: {
        fields: { key: string; declared: string; internal: string; official: { status: string } }[];
        officialSources: { status: string }[];
      };
      informationRequests: { status: string; requirementCode: string | null }[];
      verification: { runId: string } | null;
    };
  };
  const item = (items: ChecklistItem[], code: string) => items.find((i) => i.code === code)!;
  /** Espera a que termine el OCR de todos los documentos cargados. */
  const settled = (id: string) =>
    waitFor(async () => {
      const c = await checklist(id);
      return c.documentation.items.some((i) => i.status === 'PROCESSING') ? null : c;
    });

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(fakeOcr(Buffer.concat(chunks).toString('latin1'))));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.AI_SERVICE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: true });
    maria = await login(ctx, USERS.maria);
  });
  afterAll(async () => {
    await ctx.close();
    server.close();
    process.env.AI_SERVICE_URL = previousAiUrl;
  });

  it('ofrece productos de crédito con fuentes y los escenarios de demostración', async () => {
    const options = await as(ctx, maria)
      .get('/api/guarantee-requests/new/options?assetTypeCode=BOVINOS')
      .expect(200);
    expect(options.body.defaultProductCode).toBe('LIVESTOCK_GUARANTEE_BASE');
    const bice = options.body.products.find(
      (p: { code: string }) => p.code === 'REF_BICE_VALOR_NOVILLO',
    );
    expect(bice).toMatchObject({ kind: 'REFERENCE', consultedAt: '2026-10-02' });
    expect(bice.sources[0].url).toMatch(/^https:\/\/www\.bice\.com\.ar/);
    const demo = await as(ctx, maria).get('/api/demo/scenarios').expect(200);
    expect(demo.body.enabled).toBe(true);
    expect(demo.body.scenarios).toHaveLength(4);
  });

  it('demo completa: mismos modelos, datos DEMO, OCR consistente y verificación', async () => {
    const created = await as(ctx, maria)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'COMPLETE' })
      .expect(201);
    expect(created.body.demo).toBe(true);
    const id = created.body.requestId as string;
    const c = await settled(id);
    expect(c.dataSource).toBe('DEMO');
    const items = c.documentation.items;
    for (const code of ['TAX_ID', 'RENSPA', 'SANITARY_CERTIFICATE', 'LAND_TENURE'])
      expect(item(items, code)).toMatchObject({ status: 'CONSISTENT', document: { demo: true } });
    // Requisitos según evaluación sin documento: pendientes, pero no bloquean.
    expect(item(items, 'FINANCIAL_STATEMENTS')).toMatchObject({
      status: 'PENDING',
      obligation: 'EVALUATION',
    });
    expect(c.documentation.summary.mandatoryMissing).toBe(0);
    // Capas: declarado + extraído + comparación interna; fuente oficial NO conectada.
    const renspa = c.dataLayers.fields.find((f) => f.key === 'renspa')!;
    expect(renspa).toMatchObject({ declared: '99.001.0.00001/00', internal: 'MATCH' });
    expect(renspa.official.status).toBe('NOT_CONNECTED');
    expect(c.dataLayers.officialSources[0]!.status).toBe('NOT_CONNECTED');
    expect(c.verification?.runId).toBeTruthy();
    const [row] = await ctx.dataSource.query(
      `SELECT r.data_source AS r, e.data_source AS e, a.data_source AS a
         FROM guarantee_requests r JOIN establishments e ON e.id = r.establishment_id
         JOIN assets a ON a.id = r.asset_id WHERE r.id = $1`,
      [id],
    );
    expect(row).toEqual({ r: 'DEMO', e: 'DEMO', a: 'DEMO' });
    // El análisis guarda el texto OCR completo y los valores original/normalizado/confianza.
    const [analysis] = await ctx.dataSource.query(
      `SELECT a.ocr_text, a.field_entries, a.declared FROM document_analyses a
         JOIN documents d ON d.id = a.document_id
        WHERE d.establishment_id = (SELECT establishment_id FROM guarantee_requests WHERE id = $1)
          AND d.type = 'RENSPA'`,
      [id],
    );
    expect(analysis.ocr_text).toContain('DEMOSTRACION');
    expect(analysis.field_entries[0]).toMatchObject({ field: 'RENSPA', confidence: 0.97 });
    expect(analysis.declared).toMatchObject({ renspa: '99.001.0.00001/00' });
  });

  it('demo con inconsistencia: el RENSPA del documento no coincide y se explica el motivo', async () => {
    const created = await as(ctx, maria)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'INCONSISTENT' })
      .expect(201);
    const c = await settled(created.body.requestId);
    expect(item(c.documentation.items, 'RENSPA')).toMatchObject({
      status: 'INCONSISTENT',
      reason: 'RENSPA del documento distinto del declarado',
    });
    expect(c.dataLayers.fields.find((f) => f.key === 'renspa')!.internal).toBe('MISMATCH');
  });

  it('documentación faltante: la entidad pide, el productor carga, se procesa y se actualiza', async () => {
    const created = await as(ctx, maria)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'MISSING_DOCUMENTS' })
      .expect(201);
    const id = created.body.requestId as string;
    let c = await settled(id);
    expect(item(c.documentation.items, 'RENSPA')).toMatchObject({
      status: 'PENDING',
      requested: expect.anything(),
    });
    // La demo ya pidió también el certificado sanitario (requisito del checklist).
    expect(item(c.documentation.items, 'SANITARY_CERTIFICATE').requested).toBeTruthy();

    // Productor ficticio: ve las tareas con qué falta y por qué.
    const producer = await login(
      ctx,
      created.body.producerAccess.email,
      created.body.producerAccess.password,
    );
    const home = await as(ctx, producer).get('/api/producer/me').expect(200);
    const titles = (home.body.tasks as { title: string }[]).map((t) => t.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('RENSPA'),
        expect.stringContaining('Certificado sanitario'),
      ]),
    );
    const detail = await as(ctx, producer).get(`/api/producer/me/requests/${id}`).expect(200);
    const renspaItem = (detail.body.documentation.items as ChecklistItem[]).find(
      (i) => i.code === 'RENSPA',
    ) as ChecklistItem & { purpose: string; howTo: string; sources?: unknown };
    expect(renspaItem.purpose).toBeTruthy();
    expect(renspaItem.howTo).toBeTruthy();
    expect(renspaItem.sources).toBeUndefined(); // el productor no ve la investigación interna
    expect(detail.body.dataLayers).toBeNull(); // ni la comparación de la entidad

    // Carga el RENSPA → OCR → consistente; responde el pedido.
    const bytes = await readFile(join(DOCS, 'renspa.png'));
    const uploaded = await as(ctx, producer)
      .post(`/api/producer/me/requests/${id}/documents`)
      .field('type', 'RENSPA')
      .attach('file', bytes, { filename: 'renspa-cargado.png', contentType: 'image/png' })
      .expect(201);
    // Visor: el productor ve su documento; la entidad, con inline=1.
    const view = await as(ctx, producer)
      .get(`/api/producer/me/requests/${id}/documents/${uploaded.body.id}/view`)
      .expect(200);
    expect(view.body).toMatchObject({ mimeType: 'image/png', fileName: 'renspa-cargado.png' });
    expect(view.body.url).toContain('response-content-disposition=inline');
    const bankView = await as(ctx, maria)
      .get(`/api/documents/${uploaded.body.id}/download?inline=1`)
      .expect(200);
    expect(bankView.body.url).toContain('response-content-disposition=inline');
    // Un documento ajeno a su solicitud no existe para el productor.
    const [foreign] = (await ctx.dataSource.query(
      `SELECT d.id FROM documents d
        WHERE d.organization_id = (SELECT organization_id FROM guarantee_requests WHERE id = $1)
          AND d.establishment_id <> (SELECT establishment_id FROM guarantee_requests WHERE id = $1)
        LIMIT 1`,
      [id],
    )) as { id: string }[];
    await as(ctx, producer)
      .get(`/api/producer/me/requests/${id}/documents/${foreign!.id}/view`)
      .expect(404);
    c = await settled(id);
    expect(item(c.documentation.items, 'RENSPA').status).toBe('CONSISTENT');
    const info = c.informationRequests.find((i) => i.requirementCode === 'RENSPA') as unknown as {
      id: string;
    };
    await as(ctx, producer)
      .post(`/api/producer/me/requests/${id}/information-requests/${info.id}/respond`)
      .expect(201);
    c = await checklist(id);
    expect(c.informationRequests.find((i) => i.requirementCode === 'RENSPA')!.status).toBe(
      'RESPONDED',
    );
    // Responder sin cargar el documento pedido no se acepta.
    const sanitary = c.informationRequests.find(
      (i) => i.requirementCode === 'SANITARY_CERTIFICATE',
    ) as unknown as { id: string };
    await as(ctx, producer)
      .post(`/api/producer/me/requests/${id}/information-requests/${sanitary.id}/respond`)
      .expect(422);
  });

  it('la entidad reprocesa un documento y marca requisitos como NO APLICA (auditado)', async () => {
    const created = await as(ctx, maria)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'READY' })
      .expect(201);
    const id = created.body.requestId as string;
    const c = await settled(id);
    const docId = (await ctx.dataSource.query(
      `SELECT d.id FROM documents d JOIN guarantee_requests r ON r.establishment_id = d.establishment_id
        WHERE r.id = $1 AND d.type = 'RENSPA'`,
      [id],
    )) as { id: string }[];
    const again = await as(ctx, maria).post(`/api/documents/${docId[0]!.id}/analyze`).expect(201);
    expect(again.body.status).toBe('CONSISTENT');
    expect(again.body.fieldEntries.length).toBeGreaterThan(0);

    await as(ctx, maria)
      .patch(`/api/guarantee-requests/${id}/requirements/BRAND_TITLE`)
      .send({ notApplicable: true, note: 'Hacienda sin marca propia' })
      .expect(200);
    const after = await checklist(id);
    expect(item(after.documentation.items, 'BRAND_TITLE').status).toBe('NOT_APPLICABLE');
    expect(after.documentation.summary.total).toBe(c.documentation.summary.total);
    const [audit] = await ctx.dataSource.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE resource_id = $1 AND action IN
         ('DEMO_REQUEST_CREATED','REQUIREMENT_UPDATED')`,
      [id],
    );
    expect(audit.n).toBe(2);
  });

  it('solicitud real con producto de referencia y requisitos que no aplican', async () => {
    const created = await as(ctx, maria)
      .post('/api/guarantee-requests')
      .send({
        producerName: 'Ganadera Real S.A.',
        producerTaxId: '30-71548963-1',
        assetTypeCode: 'BOVINOS',
        creditProductCode: 'REF_BICE_VALOR_NOVILLO',
        notApplicableRequirements: ['LIVESTOCK_PLEDGE'],
      })
      .expect(201);
    expect(created.body.dataSource).toBe('REAL');
    const items = created.body.documentation.items as ChecklistItem[];
    expect(items.map((i) => i.code)).toContain('MIPYME_CERTIFICATE');
    expect(item(items, 'LIVESTOCK_PLEDGE').status).toBe('NOT_APPLICABLE');
    await as(ctx, maria)
      .post('/api/guarantee-requests')
      .send({
        producerName: 'Ganadera Sin Producto',
        producerTaxId: '30-71548963-1',
        assetTypeCode: 'BOVINOS',
        creditProductCode: 'NO_EXISTE',
      })
      .expect(422);
  });

  it('aislamiento y roles: otra organización no ve la demo; el productor no puede simular', async () => {
    const created = await as(ctx, maria)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'INCONSISTENT' })
      .expect(201);
    const id = created.body.requestId as string;
    const other = await login(ctx, USERS.otherOrg);
    await as(ctx, other).get(`/api/guarantee-requests/${id}`).expect(404);
    const [doc] = (await ctx.dataSource.query(
      `SELECT d.id FROM documents d JOIN guarantee_requests r ON r.establishment_id = d.establishment_id
        WHERE r.id = $1 LIMIT 1`,
      [id],
    )) as { id: string }[];
    await as(ctx, other).post(`/api/documents/${doc!.id}/analyze`).expect(404);
    await as(ctx, other)
      .patch(`/api/guarantee-requests/${id}/requirements/RENSPA`)
      .send({ notApplicable: true })
      .expect(404);
    const producer = await login(
      ctx,
      created.body.producerAccess.email,
      created.body.producerAccess.password,
    );
    await as(ctx, producer)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'COMPLETE' })
      .expect(403);
    await as(ctx, maria)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'NO_EXISTE' })
      .expect(422);
  });

  it('el panel de cartera cuenta solo datos reales; los listados marcan lo DEMO', async () => {
    await as(ctx, maria)
      .post('/api/demo/guarantee-requests')
      .send({ scenario: 'READY' })
      .expect(201);
    const [counts] = (await ctx.dataSource.query(
      `SELECT count(*) FILTER (WHERE data_source = 'REAL')::int AS real,
              count(*) FILTER (WHERE data_source = 'DEMO')::int AS demo
         FROM assets WHERE deleted_at IS NULL
          AND organization_id = (SELECT organization_id FROM users WHERE email = $1)`,
      [USERS.maria],
    )) as { real: number; demo: number }[];
    expect(counts!.demo).toBeGreaterThan(0);
    const summary = await as(ctx, maria).get('/api/dashboard/summary').expect(200);
    expect(summary.body.kpis.monitoredAssets).toBe(counts!.real);
    expect(summary.body.operations.demoRequests).toBeGreaterThan(0);
    const bovines = summary.body.byAssetType.find((t: { code: string }) => t.code === 'BOVINOS');
    expect(bovines.count).toBeLessThanOrEqual(counts!.real);
    for (const v of summary.body.latestVerifications as { assetName: string }[])
      expect(v.assetName).not.toMatch(/\(demo\)/);
    // Los listados sí muestran lo DEMO, marcado.
    const assets = await as(ctx, maria).get('/api/assets?pageSize=100').expect(200);
    const demoAssets = (assets.body.items as { name: string; dataSource: string }[]).filter(
      (a) => a.dataSource === 'DEMO',
    );
    expect(demoAssets.length).toBe(counts!.demo);
    expect(demoAssets.every((a) => a.name.endsWith('(demo)'))).toBe(true);
    const portfolio = await as(ctx, maria).get('/api/monitoring/portfolio').expect(200);
    expect(
      (portfolio.body as { dataSource: string }[]).filter((r) => r.dataSource === 'DEMO').length,
    ).toBe(counts!.demo);
  });

  it('con DEMO_MODE=disabled no se puede simular (y se informa deshabilitado)', async () => {
    const config = ctx.app.get(AppConfig);
    const previous = config.env.DEMO_MODE;
    Object.assign(config.env, { DEMO_MODE: 'disabled' });
    try {
      const scenarios = await as(ctx, maria).get('/api/demo/scenarios').expect(200);
      expect(scenarios.body.enabled).toBe(false);
      await as(ctx, maria)
        .post('/api/demo/guarantee-requests')
        .send({ scenario: 'COMPLETE' })
        .expect(403);
    } finally {
      Object.assign(config.env, { DEMO_MODE: previous });
    }
  });
});
