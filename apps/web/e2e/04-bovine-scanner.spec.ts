import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { credentials } from './helpers';

/**
 * Escáner de Bovinos de punta a punta con una CÁMARA FALSA de Chromium alimentada con el video
 * SINTÉTICO de manga (infra/seed-assets/videos, 14 animales). Corre el pipeline real: YOLOX-Nano
 * en el navegador (ONNX Runtime Web), tracker, cuadros en IndexedDB, modo sin señal,
 * sincronización automática, conteo oficial en el servidor y vista de la entidad.
 *
 * Requiere SCANNER_FAKE_CAMERA con un .y4m (ver docs/scanner.md para generarlo).
 */
const camera = process.env.SCANNER_FAKE_CAMERA ?? '';
test.skip(!camera || !existsSync(camera), 'Definí SCANNER_FAKE_CAMERA (video .y4m)');
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${camera}`,
    ],
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
  },
  permissions: ['camera', 'geolocation'],
  geolocation: { latitude: -36.7905, longitude: -59.153, accuracy: 8 },
  viewport: { width: 412, height: 915 },
  // SCANNER_E2E_IOS=1: se presenta como iPhone para recorrer el camino de iOS (motor solo-WASM,
  // cámara 640×480, inferencia limitada).
  ...(process.env.SCANNER_E2E_IOS
    ? {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      }
    : {}),
});

async function csrf(context: BrowserContext): Promise<string> {
  return (await context.cookies()).find((c) => c.name === 'ag_csrf')?.value ?? '';
}

async function post(
  request: APIRequestContext,
  context: BrowserContext,
  path: string,
  data: unknown,
) {
  const response = await request.post(`/api${path}`, {
    data,
    headers: { 'x-csrf-token': await csrf(context) },
  });
  expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

test('escáner fijo: detección en vivo, sin señal, sincronización y conteo oficial', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // Entidad: crea la solicitud de garantía.
  const bank = await browser.newContext();
  const bankPage = await bank.newPage();
  await bankPage.goto('/login');
  await bankPage.getByLabel(/Correo electrónico/).fill(credentials.email);
  await bankPage.getByLabel(/Contraseña/).fill(credentials.password);
  await bankPage.getByRole('button', { name: 'Ingresar' }).click();
  await bankPage.waitForURL('**/dashboard');
  const created = await post(bankPage.request, bank, '/guarantee-requests', {
    producerName: 'Agropecuaria La Esperanza S.A.',
    producerTaxId: '30-71548963-1',
    assetTypeCode: 'BOVINOS',
  });
  const token = String(created.invitation.url).split('/solicitud/')[1];

  // Productor: acepta, declara establecimiento y rodeo (API), y escanea desde el celular (UI).
  const producer = await browser.newContext();
  const page = await producer.newPage();
  const email = `scanner-${randomUUID().slice(0, 8)}@laesperanza.com.ar`;
  await page.request.post(`/api/producer/requests/${token}/accept`, {
    data: { email, password: 'Rodeo-2026-seguro' },
  });
  await page.goto('/login');
  await page.getByLabel(/Correo electrónico/).fill(email);
  await page
    .getByLabel(/Contraseña/)
    .first()
    .fill('Rodeo-2026-seguro');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/productor**');
  const base = `/producer/me/requests/${created.id}`;
  await post(page.request, producer, `${base}/establishment`, {
    name: 'La Esperanza',
    holderName: 'Agropecuaria La Esperanza S.A.',
    holderTaxId: '30-71548963-1',
    renspa: '06.687.0.01542/00',
    establishmentType: 'CRIA',
    tenure: 'LEASED',
    province: 'Buenos Aires',
    location: { latitude: -36.7905, longitude: -59.153 },
  });
  await post(page.request, producer, `${base}/asset`, {
    name: 'Rodeo en manga',
    declaredQuantity: 14,
    metadata: { sistema_productivo: 'Cría', raza_predominante: 'Aberdeen Angus' },
  });

  await page.goto(`/productor/solicitudes/${created.id}`);
  await page.getByTestId('open-scanner').click();
  await expect(page.getByTestId('bovine-scanner')).toBeVisible();
  await page.getByRole('button', { name: /Escáner fijo/ }).click();
  await page.getByRole('button', { name: 'Iniciar escaneo' }).click();
  await expect(page.getByRole('button', { name: 'FINALIZAR' })).toBeVisible({ timeout: 60_000 });

  // Mitad del escaneo: se corta la señal; el escaneo continúa localmente.
  await page.waitForTimeout(8_000);
  await producer.setOffline(true);
  await expect(page.getByTestId('scanner-status')).toHaveText('Sin señal');
  await page.waitForTimeout(12_000);
  const deviceCount = Number(await page.getByTestId('scanner-count').innerText());
  await page.screenshot({ path: 'test-results/scanner-live.png' });
  await page.getByRole('button', { name: 'FINALIZAR' }).click();
  await expect(page.getByTestId('scanner-summary')).toBeVisible();
  await expect(page.getByTestId('scanner-sync-detail')).toContainText('Sin señal');

  // Vuelve la señal: se sincroniza solo y el servidor calcula el conteo oficial.
  await producer.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('scanner-sync-detail')).toContainText('Verificado en servidor', {
    timeout: 180_000,
  });
  const detail = await page.getByTestId('scanner-sync-detail').innerText();
  await page.screenshot({ path: 'test-results/scanner-summary.png' });

  // La entidad ve el conteo oficial separado del preliminar del celular.
  await bankPage.goto(`/requests/${created.id}`);
  await expect(bankPage.getByTestId('scan-card')).toBeVisible();
  await expect(bankPage.getByTestId('scan-official')).toContainText('cruzaron la línea');
  await bankPage.screenshot({ path: 'test-results/scanner-bank.png', fullPage: true });
  test
    .info()
    .annotations.push({ type: 'conteo', description: `celular=${deviceCount}; ${detail}` });
});

test('escaneo cortado (la página se cierra a mitad): se recupera, se sube y la sesión sigue', async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const bank = await browser.newContext();
  const bankPage = await bank.newPage();
  await bankPage.goto('/login');
  await bankPage.getByLabel(/Correo electrónico/).fill(credentials.email);
  await bankPage.getByLabel(/Contraseña/).fill(credentials.password);
  await bankPage.getByRole('button', { name: 'Ingresar' }).click();
  await bankPage.waitForURL('**/dashboard');
  const created = await post(bankPage.request, bank, '/guarantee-requests', {
    producerName: 'Agropecuaria La Esperanza S.A.',
    producerTaxId: '30-71548963-1',
    assetTypeCode: 'BOVINOS',
  });
  const token = String(created.invitation.url).split('/solicitud/')[1];

  const producer = await browser.newContext();
  const page = await producer.newPage();
  const email = `scanner-${randomUUID().slice(0, 8)}@laesperanza.com.ar`;
  await page.request.post(`/api/producer/requests/${token}/accept`, {
    data: { email, password: 'Rodeo-2026-seguro' },
  });
  await page.goto('/login');
  await page.getByLabel(/Correo electrónico/).fill(email);
  await page
    .getByLabel(/Contraseña/)
    .first()
    .fill('Rodeo-2026-seguro');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/productor**');
  const base = `/producer/me/requests/${created.id}`;
  await post(page.request, producer, `${base}/establishment`, {
    name: 'La Esperanza',
    holderName: 'Agropecuaria La Esperanza S.A.',
    holderTaxId: '30-71548963-1',
    renspa: '06.687.0.01542/00',
    establishmentType: 'CRIA',
    tenure: 'LEASED',
    province: 'Buenos Aires',
    location: { latitude: -36.7905, longitude: -59.153 },
  });
  await post(page.request, producer, `${base}/asset`, {
    name: 'Rodeo en manga',
    declaredQuantity: 14,
    metadata: { sistema_productivo: 'Cría', raza_predominante: 'Aberdeen Angus' },
  });

  await page.goto(`/escaner/${created.id}`);
  await page.getByRole('button', { name: /Escáner fijo/ }).click();
  await page.getByRole('button', { name: 'Iniciar escaneo' }).click();
  await expect(page.getByRole('button', { name: 'FINALIZAR' })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(12_000);
  // Como cuando iOS mata la página: se recarga sin pasar por FINALIZAR.
  await page.reload();

  // Queda en RECORDING hasta que pasa el umbral y la sincronización lo recupera.
  await page.goto(`/productor/solicitudes/${created.id}`);
  const row = page.getByTestId('scan-row').first();
  await expect(row.getByTestId('scan-status')).toContainText('Verificado', { timeout: 240_000 });
  const scans = await (await page.request.get(`/api${base}/scans`)).json();
  const list = (Array.isArray(scans) ? scans : scans.items) as { warnings: string[] }[];
  expect(list[0]!.warnings.join(' ')).toContain('interrumpido');
  // La sesión no se perdió.
  await expect(page).toHaveURL(new RegExp(`/productor/solicitudes/${created.id}`));
});
