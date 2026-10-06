import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { credentials } from './helpers';

/**
 * Escáner de corral y "Analizar foto" de punta a punta con una CÁMARA FALSA de Chromium
 * alimentada con el video SINTÉTICO de barrido (12 bovinos QUIETOS, la cámara recorre el grupo).
 * Corre el pipeline real: YOLOX-Nano en el navegador, conteo de animales únicos, fotos en
 * IndexedDB, sincronización, conteo oficial en el servidor y vista de la entidad.
 *
 * Requiere SCANNER_FAKE_CAMERA_STILL con un .y4m (ver docs/scanner.md para generarlo).
 */
const camera = process.env.SCANNER_FAKE_CAMERA_STILL ?? '';
test.skip(!camera || !existsSync(camera), 'Definí SCANNER_FAKE_CAMERA_STILL (video .y4m)');
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
  geolocation: { latitude: -33.1, longitude: -64.35, accuracy: 6 },
  viewport: { width: 412, height: 915 },
});

async function csrf(context: BrowserContext): Promise<string> {
  return (await context.cookies()).find((c) => c.name === 'ag_csrf')?.value ?? '';
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(`/api${path}`, {
    data,
    headers: { 'x-csrf-token': await csrf(page.context()) },
  });
  expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

/** Entidad crea la solicitud; productor acepta y declara un rodeo de FEEDLOT. */
async function feedlotRequest(browser: import('@playwright/test').Browser) {
  const bank = await browser.newContext();
  const bankPage = await bank.newPage();
  await bankPage.goto('/login');
  await bankPage.getByLabel(/Correo electrónico/).fill(credentials.email);
  await bankPage.getByLabel(/Contraseña/).fill(credentials.password);
  await bankPage.getByRole('button', { name: 'Ingresar' }).click();
  await bankPage.waitForURL('**/dashboard');
  const created = await post(bankPage, '/guarantee-requests', {
    producerName: 'Feedlot Don Mario S.A.',
    producerTaxId: '30-71548963-1',
    assetTypeCode: 'BOVINOS',
  });
  const token = String(created.invitation.url).split('/solicitud/')[1];
  const producer = await browser.newContext();
  const page = await producer.newPage();
  const email = `corral-${randomUUID().slice(0, 8)}@donmario.com.ar`;
  await page.request.post(`/api/producer/requests/${token}/accept`, {
    data: { email, password: 'Corral-2026-seguro' },
  });
  await page.goto('/login');
  await page.getByLabel(/Correo electrónico/).fill(email);
  await page
    .getByLabel(/Contraseña/)
    .first()
    .fill('Corral-2026-seguro');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/productor**');
  const base = `/producer/me/requests/${created.id}`;
  await post(page, `${base}/establishment`, {
    name: 'Feedlot Don Mario',
    holderName: 'Feedlot Don Mario S.A.',
    holderTaxId: '30-71548963-1',
    renspa: '06.687.0.01542/00',
    establishmentType: 'FEEDLOT',
    tenure: 'OWNED',
    province: 'Córdoba',
    location: { latitude: -33.1, longitude: -64.35 },
  });
  await post(page, `${base}/asset`, {
    name: 'Corrales de engorde',
    declaredQuantity: 12,
    metadata: { sistema_productivo: 'Feedlot', raza_predominante: 'Aberdeen Angus' },
  });
  return { bankPage, page, requestId: String(created.id) };
}

test('escáner de corral: animales quietos únicos, recomendado para feedlot, conteo oficial', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { bankPage, page, requestId } = await feedlotRequest(browser);
  await page.goto(`/productor/solicitudes/${requestId}`);
  await expect(page.getByTestId('livestock-profile')).toContainText('Feedlot');
  await page.getByTestId('open-scanner').click();
  await expect(page.getByTestId('scanner-profile')).toContainText('Feedlot');
  // El perfil de feedlot ordena primero (y recomienda) el escáner de corral.
  const corral = page.getByRole('button', { name: /Escáner de corral/ });
  await expect(corral).toHaveAttribute('aria-pressed', 'true');
  await expect(corral).toContainText('Recomendado');
  await page.getByRole('button', { name: 'Iniciar escaneo' }).click();
  await expect(page.getByRole('button', { name: 'FINALIZAR' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('scanner-coverage')).toBeVisible();
  await page.waitForTimeout(25_000);
  const observed = Number(await page.getByTestId('scanner-count').innerText());
  await page.screenshot({ path: 'test-results/corral-live.png' });
  await page.getByRole('button', { name: 'FINALIZAR' }).click();
  await expect(page.getByTestId('scanner-sync-detail')).toContainText('Verificado en servidor', {
    timeout: 180_000,
  });
  const detail = await page.getByTestId('scanner-sync-detail').innerText();
  expect(detail).toContain('cota inferior');

  await bankPage.goto(`/requests/${requestId}`);
  const card = bankPage.getByTestId('scan-card').first();
  await expect(card).toContainText('Escáner de corral');
  await expect(card.getByTestId('scan-official')).toContainText('animales únicos');
  await expect(card.getByTestId('scan-pen')).toContainText('reapariciones');
  await expect(card.getByTestId('scan-evidence-status')).toBeVisible();
  // Monitoreo del rodeo y visual + RFID (sin lecturas reales: no hay coincidencias inventadas).
  await expect(bankPage.getByTestId('livestock-history')).toBeVisible();
  await expect(bankPage.getByTestId('rfid-matches')).toHaveText('No determinable');
  await bankPage.screenshot({ path: 'test-results/corral-bank.png', fullPage: true });
  test.info().annotations.push({ type: 'conteo', description: `celular=${observed}; ${detail}` });
});

test('analizar foto: dos fotos con cajas y conteo, sincronizadas y procesadas en el servidor', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { bankPage, page, requestId } = await feedlotRequest(browser);
  await page.goto(`/escaner/${requestId}`);
  await page.getByRole('button', { name: /Analizar foto/ }).click();
  await page.getByRole('button', { name: 'Abrir cámara' }).click();
  await expect(page.getByRole('button', { name: 'Tomar foto' })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3_000);
  await page.getByRole('button', { name: 'Tomar foto' }).click();
  await expect(page.getByRole('button', { name: 'Otra foto' })).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: 'Otra foto' }).click();
  await expect(page.getByTestId('scanner-photos')).toContainText('2 fotos', { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/foto-live.png' });
  await page.getByRole('button', { name: 'FINALIZAR' }).click();
  await expect(page.getByTestId('scanner-summary')).toContainText('Fotos: 2');
  await expect(page.getByTestId('scanner-sync-detail')).toContainText('Verificado en servidor', {
    timeout: 180_000,
  });

  await bankPage.goto(`/requests/${requestId}`);
  const card = bankPage.getByTestId('scan-card').first();
  await expect(card).toContainText('Análisis de fotos');
  await expect(card.getByTestId('scan-official')).toContainText('bovinos en las fotos');
  await expect(card.locator('figure')).toHaveCount(2);
  await bankPage.screenshot({ path: 'test-results/foto-bank.png', fullPage: true });
});
