import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { login, seedAsset } from './helpers';

/**
 * Garantía bovina con verificación continua, por la interfaz de la entidad:
 * banco crea → productor declara 1.000 → passport → egreso de 25 (esperado 975) → inspección
 * con conteo de 975 → VERIFICADA → inspección con 720 → REQUIERE INSPECCIÓN con alerta explicada.
 * Fuentes oficiales SIN CONEXIÓN (nada se presenta como oficial) y DEMO fuera de los KPIs.
 */
const csrf = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === 'ag_csrf')?.value ?? '';

async function declaredGuarantee(page: Page, heads: number) {
  const suffix = Date.now().toString(36).slice(-5);
  const created = await page.request.post('/api/guarantee-requests', {
    headers: { 'x-csrf-token': await csrf(page) },
    data: {
      producerName: `Feedlot E2E ${suffix} S.A.`,
      producerTaxId: '30-71548963-1',
      assetTypeCode: 'BOVINOS',
      requestedAmount: 500000,
    },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { id: string; invitation: { url: string } };
  const token = body.invitation.url.split('/solicitud/')[1]!;
  const producer = (path: string) => `/api/producer/requests/${token}${path}`;
  const anon = await page
    .context()
    .browser()!
    .newContext({ baseURL: process.env.BASE_URL ?? 'http://localhost:3000' });
  const r = anon.request;
  expect(
    (
      await r.post(producer('/establishment'), {
        data: {
          name: `Corrales ${suffix}`,
          holderName: `Feedlot E2E ${suffix} S.A.`,
          holderTaxId: '30-71548963-1',
          establishmentType: 'FEEDLOT',
          tenure: 'OWNED',
          province: 'Entre Ríos',
          location: { latitude: -31.8653, longitude: -59.0269 },
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await r.post(producer('/asset'), {
        data: {
          name: `Rodeo ${suffix}`,
          declaredQuantity: heads,
          metadata: { sistema_productivo: 'Feedlot', raza_predominante: 'Angus' },
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await r.post(producer('/evidence'), {
        multipart: {
          file: {
            name: 'corral.jpg',
            mimeType: 'image/jpeg',
            buffer: readFileSync(seedAsset('cameras/CAM-LE-01.jpg')),
          },
          captureOrigin: 'FILE',
        },
      })
    ).status(),
  ).toBe(201);
  expect((await r.post(producer('/submit'))).status()).toBe(201);
  // El productor crea su acceso al portal.
  const email = `feedlot-${suffix}@e2e.agrogarantias.invalid`;
  expect(
    (
      await r.post(producer('/accept'), { data: { email, password: 'Rodeo-2026-seguro' } })
    ).status(),
  ).toBe(201);
  await anon.close();
  return { requestId: body.id, producerEmail: email };
}

test('garantía bovina: productor avisa egreso, banco acepta, inspector por link, verificada → diferencia', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await login(page);
  const { requestId, producerEmail } = await declaredGuarantee(page, 1000);

  // Cartera → passport.
  await page.goto('/guarantees');
  await expect(page.getByTestId('kpi-active')).toBeVisible();
  const list = await (await page.request.get('/api/bovine-guarantees')).json();
  const row = list.items.find((i: { requestId: string }) => i.requestId === requestId);
  await page.getByTestId(`guarantee-row-${row.code}`).click();
  await page.waitForURL(`**/guarantees/${row.id}`);
  await expect(page.getByTestId('passport-code')).toHaveText(`GARANTÍA #${row.code}`);
  await expect(page.getByTestId('passport-state')).toContainText('No determinable', {
    timeout: 90_000,
  });
  await expect(page.getByTestId('reconciliation-narrative')).toContainText('No implica faltante');

  // Productor (celular): ve su monitoreo y avisa un egreso de 25 desde su portal.
  const producerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pp = await producerCtx.newPage();
  await pp.goto('/login');
  await pp.getByLabel(/Correo electrónico/).fill(producerEmail);
  await pp
    .getByLabel(/Contraseña/)
    .first()
    .fill('Rodeo-2026-seguro');
  await pp.getByRole('button', { name: 'Ingresar' }).click();
  await pp.waitForURL('**/productor**');
  await pp.goto(`/productor/solicitudes/${requestId}#monitoreo`);
  await expect(pp.getByTestId('producer-monitoring-status')).toContainText('conteo completo');
  await expect(pp.getByTestId('producer-monitoring')).not.toContainText(/score/i);
  await pp.getByRole('button', { name: 'Avisar un movimiento' }).click();
  const mf = pp.getByTestId('producer-movement-form');
  await mf.getByLabel('Cantidad de animales').fill('25');
  await mf.getByLabel('Destino u origen').fill('Frigorífico');
  await mf.getByRole('button', { name: 'Avisar movimiento' }).click();
  await expect(pp.getByTestId('producer-movements')).toContainText('Salida de 25');
  await expect(pp.getByTestId('producer-movements')).toContainText('La entidad lo está revisando');

  // Banco: el esperado pasa a 975 y acepta el movimiento.
  await page.reload();
  await expect(page.getByTestId('heads-expected')).toContainText('975');
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  await expect(page.getByText('Productor', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page
    .getByTestId('form-reviewMovement')
    .getByLabel(/Nota/)
    .fill('Se pidió el DT-e por teléfono');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('VERIFICADO')).toBeVisible();

  // Banco: solicita inspección y obtiene el link del inspector.
  await page.getByRole('button', { name: 'Solicitar inspección' }).click();
  await page
    .getByTestId('form-requestInspection')
    .getByLabel(/Inspector/)
    .fill('Paula Ríos');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const link = await page.getByLabel('Link del inspector').inputValue();
  expect(link).toContain('/inspeccion/');
  await page.getByRole('button', { name: 'Listo' }).click();

  // Inspector (celular, sin cuenta): conteo a ciegas, foto con GPS y acta firmada.
  const inspectorCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: -31.8653, longitude: -59.0269 },
    permissions: ['geolocation'],
  });
  const ip = await inspectorCtx.newPage();
  await ip.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(ip.getByTestId('inspector-form')).toContainText(row.code);
  await expect(ip.getByTestId('inspector-form')).not.toContainText('1.000');
  await ip.locator('input[type="file"][capture]').setInputFiles(seedAsset('cameras/CAM-LE-01.jpg'));
  await expect(ip.getByTestId('inspection-photos')).toContainText('1 foto(s)');
  await ip.getByLabel(/^Tu nombre/).fill('Paula Ríos');
  await ip.getByLabel('Animales contados').fill('975');
  await ip.getByLabel(/Firma \(tu nombre/).fill('Paula Ríos');
  await ip.getByLabel(/Firmo el acta/).check();
  await ip.getByRole('button', { name: 'Firmar y enviar acta' }).click();
  await expect(ip.getByTestId('inspection-done')).toBeVisible();
  const overflow = await ip.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // Banco: verificada.
  await page.reload();
  await expect(page.getByTestId('passport-state')).toContainText('Verificada');
  await expect(page.getByTestId('trust-answer')).toContainText('Sí.');

  // Acta en papel con 720 → requiere inspección, con alerta explicada.
  await page.getByRole('button', { name: 'Acta en papel' }).click();
  const form = page.getByTestId('form-inspection');
  await form.getByLabel(/Inspector/).fill('Inspector de la entidad');
  await form.getByLabel(/Animales observados/).fill('720');
  await form.getByLabel(/Resultado/).selectOption('NO_CONFORME');
  await form.getByLabel(/Firma \(nombre/).fill('Inspector de la entidad');
  await form.getByLabel(/Firmo el acta/).check();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('passport-state')).toContainText('Requiere inspección');
  await page.getByRole('tab', { name: /Alertas/ }).click();
  await expect(page.getByTestId('alert-BG_QUANTITY_DIFFERENCE')).toContainText(
    'Diferencia no explicada: 255',
  );

  // Fuentes oficiales sin conexión.
  await page.getByRole('tab', { name: 'Fuentes y documentos' }).click();
  await expect(page.getByTestId('source-RENSPA')).toContainText('SIN CONEXIÓN');

  // El productor ve la inspección como novedad, sin el resultado interno.
  await pp.reload();
  await expect(pp.getByTestId('producer-monitoring-status')).toContainText('inspección');
  await producerCtx.close();
  await inspectorCtx.close();
});

test('las garantías DEMO no cuentan en los KPIs y se ven marcadas', async ({ page }) => {
  await login(page);
  const before = await (await page.request.get('/api/bovine-guarantees')).json();
  const demo = await page.request.post('/api/demo/guarantee-requests', {
    headers: { 'x-csrf-token': await csrf(page) },
    data: { scenario: 'COMPLETE' },
  });
  expect(demo.status()).toBe(201);
  const after = await (await page.request.get('/api/bovine-guarantees')).json();
  expect(after.kpis.activeGuarantees).toBe(before.kpis.activeGuarantees);
  expect(after.demoGuarantees).toBe(before.demoGuarantees + 1);

  await page.goto('/guarantees');
  await expect(page.getByText(/Los indicadores solo cuentan datos reales/)).toBeVisible();
  await page.getByLabel('Incluir demostraciones').check();
  await expect(page.locator('.demo-name').first()).toBeVisible();
});
