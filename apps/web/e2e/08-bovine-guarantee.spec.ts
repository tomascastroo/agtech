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
  await anon.close();
  return body.id;
}

async function recordInspection(page: Page, observed: number, result: string) {
  await page.getByRole('button', { name: 'Registrar inspección' }).click();
  const form = page.getByTestId('form-inspection');
  await form.getByLabel(/Inspector/).fill('Ing. Agr. Paula Ríos');
  await form.getByLabel(/Animales observados/).fill(String(observed));
  await form.getByLabel(/Resultado/).selectOption(result);
  await form.getByLabel(/Firma \(nombre/).fill('Paula Ríos');
  await form.getByLabel(/Firmo el acta/).check();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(form).toBeHidden({ timeout: 30_000 });
}

test('garantía bovina: declarado → movimientos → inspección → verificada → diferencia → requiere inspección', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page);
  const requestId = await declaredGuarantee(page, 1000);

  // Cartera: la garantía aparece y se abre su passport.
  await page.goto('/guarantees');
  await expect(page.getByTestId('kpi-active')).toBeVisible();
  const list = await (await page.request.get('/api/bovine-guarantees')).json();
  const row = list.items.find((i: { requestId: string }) => i.requestId === requestId);
  await page.getByTestId(`guarantee-row-${row.code}`).click();
  await page.waitForURL(`**/guarantees/${row.id}`);
  await expect(page.getByTestId('passport-code')).toHaveText(`GARANTÍA #${row.code}`);

  // Verificación inicial (fotos de galería): no se puede determinar el total; nunca "faltan".
  await expect(page.getByTestId('passport-state')).toContainText('No determinable', {
    timeout: 90_000,
  });
  await expect(page.getByTestId('reconciliation-narrative')).toContainText(
    'Se declararon 1.000 animales.',
  );
  await expect(page.getByTestId('reconciliation-narrative')).toContainText('No implica faltante');
  await expect(page.getByTestId('passport-coverage')).toContainText('No determinable');

  // Egreso de 25 cabezas → esperado 975.
  await page.getByRole('button', { name: 'Movimiento' }).click();
  const mv = page.getByTestId('form-movement');
  await mv.getByLabel('Cabezas').fill('25');
  await mv.getByLabel('Destino').fill('Frigorífico');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('heads-expected')).toContainText('975');
  await expect(page.getByTestId('reconciliation-narrative')).toContainText(
    'Se registraron 25 salidas.',
  );

  // Inspección con conteo completo de 975 → VERIFICADA.
  await recordInspection(page, 975, 'CONFORME');
  await expect(page.getByTestId('passport-state')).toContainText('Verificada');
  await expect(page.getByTestId('trust-answer')).toContainText('Sí.');
  await expect(page.getByTestId('heads-verified')).toContainText('975');

  // Inspección con 720 → REQUIERE INSPECCIÓN, alerta con qué pasó / por qué / acción.
  await recordInspection(page, 720, 'NO_CONFORME');
  await expect(page.getByTestId('passport-state')).toContainText('Requiere inspección');
  await page.getByRole('tab', { name: /Alertas/ }).click();
  const alert = page.getByTestId('alert-BG_QUANTITY_DIFFERENCE');
  await expect(alert).toContainText('La cantidad esperada es 975');
  await expect(alert).toContainText('Diferencia no explicada: 255');
  await expect(alert).toContainText('Acción:');

  // Score explicable con compuerta.
  await page.getByRole('tab', { name: 'Score' }).click();
  await expect(page.getByTestId('gate-DIFERENCIA_NO_EXPLICADA')).toBeVisible();

  // Fuentes oficiales: sin conexión, con carga de documento oficial.
  await page.getByRole('tab', { name: 'Fuentes y documentos' }).click();
  await expect(page.getByTestId('source-RENSPA')).toContainText('SIN CONEXIÓN');
  await expect(page.getByTestId('source-TRAZA')).toContainText('NO DISPONIBLE');
  await expect(
    page.getByTestId('source-DTE').getByRole('button', { name: 'SUBIR DOCUMENTO OFICIAL' }),
  ).toBeVisible();

  // Historial inmutable con el cambio de estado.
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.getByTestId('passport-timeline')).toContainText(
    'Verificada → Requiere inspección',
  );

  // PDF del passport.
  const pdf = await page.request.get(`/api/bovine-guarantees/${row.id}/passport.pdf`);
  expect(pdf.headers()['content-type']).toContain('application/pdf');

  // Celular: el passport se lee sin desbordes horizontales.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Resumen' }).click();
  await expect(page.getByTestId('trust-answer')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
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
