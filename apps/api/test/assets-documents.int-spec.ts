import { DocumentAnalysisService } from '../src/modules/documents/application/document-analysis.service.js';
import { ObjectStorage } from '../src/modules/storage/object-storage.js';
import { storageKeys } from '../src/modules/storage/storage-keys.js';
import {
  as,
  assetIdByName,
  fetchBytes,
  login,
  resetAndSeed,
  startTestApp,
  USERS,
  type Session,
  type TestContext,
} from './helpers/test-environment.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n'), Buffer.alloc(256, 32)]);

describe('Establecimientos, activos, documentos y evidencia', () => {
  let ctx: TestContext;
  let maria: Session;

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: false });
    maria = await login(ctx, USERS.maria);
  });
  afterAll(() => ctx.close());

  const establishment = {
    name: 'El Ombú',
    holderName: 'Ganadera El Ombú S.A.',
    holderTaxId: '30-71234567-1',
    renspa: '06.448.0.00918/00',
    establishmentType: 'CRIA',
    tenure: 'OWNED',
    province: 'Buenos Aires',
    locality: 'Ayacucho',
    location: { latitude: -37.15, longitude: -58.48 },
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [-58.5, -37.17],
          [-58.46, -37.17],
          [-58.46, -37.13],
          [-58.5, -37.13],
          [-58.5, -37.17],
        ],
      ],
    },
  };

  it('crea un establecimiento con límite PostGIS y calcula su superficie', async () => {
    const response = await as(ctx, maria)
      .post('/api/establishments')
      .send(establishment)
      .expect(201);
    expect(response.body.totalAreaHa).toBeGreaterThan(1500);
    expect(response.body.location.boundary.type).toBe('MultiPolygon');
  });

  it('rechaza CUIT con dígito verificador inválido y geometrías mal formadas', async () => {
    await as(ctx, maria)
      .post('/api/establishments')
      .send({ ...establishment, name: 'Campo X', holderTaxId: '30-71234567-9' })
      .expect(422);
    await as(ctx, maria)
      .post('/api/establishments')
      .send({
        ...establishment,
        name: 'Campo Y',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [-58.5, -37.17],
              [-58.46, -37.17],
            ],
          ],
        },
      })
      .expect(422);
  });

  it('valida la metadata del activo contra el esquema de su tipo', async () => {
    const establishments = await as(ctx, maria).get('/api/establishments').expect(200);
    const ombu = establishments.body.find((e: { name: string }) => e.name === 'El Ombú');
    const invalid = await as(ctx, maria)
      .post('/api/assets')
      .send({
        establishmentId: ombu.id,
        assetTypeCode: 'BOVINOS',
        name: 'Rodeo',
        declaredQuantity: 300,
        metadata: { vacas: 'muchas' },
      })
      .expect(422);
    expect(invalid.body.details.fields.map((f: { field: string }) => f.field)).toContain(
      'raza_predominante',
    );
    await as(ctx, maria)
      .post('/api/assets')
      .send({
        establishmentId: ombu.id,
        assetTypeCode: 'CULTIVOS',
        name: 'Trigo',
        declaredQuantity: 100,
        metadata: { cultivo: 'Trigo', campania: '2026/27' },
      })
      .expect(422);
    const created = await as(ctx, maria)
      .post('/api/assets')
      .send({
        establishmentId: ombu.id,
        assetTypeCode: 'BOVINOS',
        name: 'Rodeo de cría El Ombú',
        declaredQuantity: 300,
        metadata: { sistema_productivo: 'Cría', raza_predominante: 'Angus' },
      })
      .expect(201);
    expect(created.body).toMatchObject({ status: 'DRAFT', unit: 'HEAD', metadata: { version: 1 } });
    const updated = await as(ctx, maria)
      .patch(`/api/assets/${created.body.id}`)
      .send({ metadata: { sistema_productivo: 'Cría', raza_predominante: 'Angus', vacas: 180 } })
      .expect(200);
    expect(updated.body.metadata.version).toBe(2);
  });

  it('carga documentación validando contenido real, la guarda en S3 y entrega URL firmada', async () => {
    const asset = await assetIdByName(ctx, maria, 'El Ombú');
    await as(ctx, maria)
      .post(`/api/assets/${asset}/documents`)
      .attach('file', Buffer.from('MZ fake executable content padding padding'), {
        filename: 'renspa.pdf',
        contentType: 'application/pdf',
      })
      .field('type', 'RENSPA')
      .expect(422);
    const uploaded = await as(ctx, maria)
      .post(`/api/assets/${asset}/documents`)
      .attach('file', PDF, { filename: '../../renspa "ombú".pdf', contentType: 'application/pdf' })
      .field('type', 'RENSPA')
      .field('expiresAt', '2028-01-31')
      .expect(201);
    expect(uploaded.body).toMatchObject({
      type: 'RENSPA',
      status: 'PENDING_REVIEW',
      fileName: 'renspa ombú.pdf',
    });
    expect(uploaded.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    const list = await as(ctx, maria).get(`/api/assets/${asset}/documents`).expect(200);
    expect(
      list.body.requirements.find((r: { requirement: string }) => r.requirement === 'RENSPA')
        .satisfied,
    ).toBe(true);
    const download = await as(ctx, maria)
      .get(`/api/documents/${uploaded.body.id}/download`)
      .expect(200);
    const fetched = await fetchBytes(download.body.url);
    expect(fetched.equals(PDF)).toBe(true);

    // La lectura automática corre en segundo plano y nunca bloquea la carga; sin servicio de
    // lectura disponible queda FAILED (revisión manual), sin afirmar nada sobre el contenido.
    await ctx.app.get(DocumentAnalysisService).drain();
    const analyzed = await as(ctx, maria).get(`/api/assets/${asset}/documents`).expect(200);
    const doc = analyzed.body.documents.find((d: { id: string }) => d.id === uploaded.body.id);
    expect(doc.analysis).toMatchObject({ status: 'FAILED', validationResults: [] });
    expect(doc.analysis.disclaimer).toMatch(/No certifica la autenticidad/);
  });

  it('solicita el kit de dispositivos o registra dispositivos ya instalados', async () => {
    const asset = await assetIdByName(ctx, maria, 'El Ombú');
    const kit = await as(ctx, maria)
      .post(`/api/assets/${asset}/devices/kit-request`)
      .send({
        cameras: 4,
        connectivity: 'LTE_4G',
        solarPower: true,
        rfidReader: false,
        shippingAddress: 'Ruta 29 km 120, Ayacucho',
        contactName: 'Pedro Ruiz',
        contactPhone: '+54 9 2296 44-1122',
      })
      .expect(201);
    expect(kit.body).toMatchObject({ requestType: 'KIT_REQUEST', status: 'REQUESTED' });
    // Señal simulada disponible para la nueva cámara (equivale a un equipo en línea).
    const storage = ctx.app.get(ObjectStorage);
    await storage.putObject({
      key: storageKeys.simulatedCameraFeed('CAM-OMBU-01'),
      body: await storage.getObject(storageKeys.simulatedCameraFeed('CAM-LE-01')),
      contentType: 'image/jpeg',
    });
    await as(ctx, maria)
      .post(`/api/assets/${asset}/devices`)
      .send({
        type: 'SOLAR_CAMERA',
        serialNumber: 'CAM-LE-01',
        connectivity: 'LTE_4G',
        powerSource: 'SOLAR',
        label: 'Duplicada',
      })
      .expect(409);
    const device = await as(ctx, maria)
      .post(`/api/assets/${asset}/devices`)
      .send({
        type: 'SOLAR_CAMERA',
        serialNumber: 'CAM-OMBU-01',
        connectivity: 'LTE_4G',
        powerSource: 'SOLAR',
        label: 'Aguada',
        latitude: -37.15,
        longitude: -58.48,
      })
      .expect(201);
    expect(device.body).toMatchObject({ status: 'ACTIVE', connection: 'ONLINE' });
    const offline = await as(ctx, maria)
      .post(`/api/assets/${asset}/devices`)
      .send({
        type: 'FIXED_CAMERA',
        serialNumber: 'CAM-NUEVA-99',
        connectivity: 'WIFI',
        powerSource: 'GRID',
        label: 'Manga',
      })
      .expect(201);
    expect(offline.body.connection).toBe('OFFLINE');
  });

  it('expone el catálogo de tipos de activo, el mapa y la serie satelital', async () => {
    const types = await as(ctx, maria).get('/api/asset-types').expect(200);
    expect(types.body.map((t: { code: string }) => t.code)).toEqual(
      expect.arrayContaining([
        'BOVINOS',
        'CULTIVOS',
        'VINEDOS',
        'FRUTALES',
        'FORESTAL',
        'SILOBOLSAS',
        'SILOS',
        'MAQUINARIA',
        'INFRAESTRUCTURA',
        'RESERVORIOS',
        'OTROS',
      ]),
    );
    const vineyard = await assetIdByName(ctx, maria, 'Malbec');
    const satellite = await as(ctx, maria).get(`/api/assets/${vineyard}/satellite`).expect(200);
    // Serie Sentinel-2 real del seed (infra/seed-assets/satellite/real/don-jose-vinedo).
    expect(satellite.body.length).toBeGreaterThan(10);
    expect(satellite.body.at(-1).scene).toMatchObject({
      simulated: false,
      provider: 'sentinel2-l2a',
    });
    expect(satellite.body.some((o: { usable: boolean }) => !o.usable)).toBe(true);
    const portfolio = await as(ctx, maria).get('/api/monitoring/portfolio').expect(200);
    const states = Object.fromEntries(
      portfolio.body.map((r: { establishmentName: string; state: string }) => [
        r.establishmentName,
        r.state,
      ]),
    );
    // Reposo invernal: verificación no concluyente por fenología (sin alerta fabricada).
    expect(states['Finca Don José']).toBe('OBSERVADO');
    expect(states['Campo Los Álamos']).toBe('OK');
    const dashboard = await as(ctx, maria).get('/api/dashboard/summary').expect(200);
    expect(dashboard.body.kpis).toMatchObject({ verified: 9, withAlerts: 2 });
  });

  it('expone el estado de las integraciones indicando cuáles son simuladas', async () => {
    const integrations = await as(ctx, maria).get('/api/integrations').expect(200);
    const byCapability = Object.fromEntries(
      integrations.body.providers.map((p: { capability: string; simulated: boolean }) => [
        p.capability,
        p.simulated,
      ]),
    );
    expect(byCapability).toMatchObject({
      SATELLITE_IMAGERY: true,
      CAMERA_GATEWAY: true,
      LIVESTOCK_REGISTRY: true,
    });
  });

  it('ingiere lecturas RFID, las asocia al animal y marca la simulación', async () => {
    const asset = await assetIdByName(ctx, maria, 'Rodeo de cría La Esperanza');
    await as(ctx, maria)
      .post(`/api/assets/${asset}/rfid/observations`)
      .send({ readings: [{ electronicId: '12345', observedAt: new Date().toISOString() }] })
      .expect(422);
    const bridge = await as(ctx, maria)
      .post(`/api/assets/${asset}/rfid/observations`)
      .send({
        readings: [
          { electronicId: '032 0000 1245 5678', observedAt: new Date().toISOString() },
          { electronicId: '032000099990000', observedAt: new Date().toISOString() },
        ],
      })
      .expect(201);
    expect(bridge.body).toMatchObject({ received: 2, identified: 1, unknown: 1 });
    const simulated = await as(ctx, maria).post(`/api/assets/${asset}/rfid/simulate`).expect(201);
    expect(simulated.body.received).toBeGreaterThan(1);
    const list = await as(ctx, maria).get(`/api/assets/${asset}/rfid/observations`).expect(200);
    expect(list.body.readings[0]).toMatchObject({ electronicId: expect.stringMatching(/^032 /) });
    expect(list.body.readings.some((r: { source: string }) => r.source === 'SIMULATED')).toBe(true);
    expect(
      list.body.readings.find((r: { status: string }) => r.status === 'IDENTIFIED'),
    ).toMatchObject({
      establishmentName: expect.any(String),
      officialTag: expect.any(String),
    });
  });

  it('documenta la API con OpenAPI', async () => {
    const spec = await ctx.http().get('/api/docs/openapi.json').expect(200);
    expect(Object.keys(spec.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/login',
        '/api/assets/{assetId}/verifications',
        '/api/reports/{id}/generate',
      ]),
    );
  });
});
