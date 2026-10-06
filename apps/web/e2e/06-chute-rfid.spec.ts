import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { credentials } from './helpers';

/**
 * Manga + RFID de punta a punta con una CÁMARA FALSA de Chromium alimentada con el video
 * SINTÉTICO de manga individual (un bovino por vez entra, queda quieto y sale). Corre el pipeline
 * real: YOLOX-Nano + ByteTrack en el navegador, lector RFID SIMULADO, captura en IndexedDB,
 * sincronización y asociación OFICIAL en el servidor (YOLOX-S + ByteTrack), vista de la entidad.
 *
 * Requiere SCANNER_FAKE_CAMERA_CHUTE con un .y4m (ver docs/scanner.md para generarlo).
 */
const camera = process.env.SCANNER_FAKE_CAMERA_CHUTE ?? '';
test.skip(!camera || !existsSync(camera), 'Definí SCANNER_FAKE_CAMERA_CHUTE (video .y4m)');
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
  geolocation: { latitude: -36.79, longitude: -59.15, accuracy: 6 },
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

/** Entidad crea la solicitud; productor acepta y declara un rodeo de cría. */
async function chuteRequest(browser: import('@playwright/test').Browser) {
  const bank = await browser.newContext();
  const bankPage = await bank.newPage();
  await bankPage.goto('/login');
  await bankPage.getByLabel(/Correo electrónico/).fill(credentials.email);
  await bankPage.getByLabel(/Contraseña/).fill(credentials.password);
  await bankPage.getByRole('button', { name: 'Ingresar' }).click();
  await bankPage.waitForURL('**/dashboard');
  const created = await post(bankPage, '/guarantee-requests', {
    producerName: 'Estancia La Manga S.A.',
    producerTaxId: '30-71548963-1',
    assetTypeCode: 'BOVINOS',
  });
  const token = String(created.invitation.url).split('/solicitud/')[1];
  const producer = await browser.newContext();
  const page = await producer.newPage();
  const email = `manga-${randomUUID().slice(0, 8)}@lamanga.com.ar`;
  await page.request.post(`/api/producer/requests/${token}/accept`, {
    data: { email, password: 'Manga-2026-seguro' },
  });
  await page.goto('/login');
  await page.getByLabel(/Correo electrónico/).fill(email);
  await page
    .getByLabel(/Contraseña/)
    .first()
    .fill('Manga-2026-seguro');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/productor**');
  const base = `/producer/me/requests/${created.id}`;
  await post(page, `${base}/establishment`, {
    name: 'La Manga',
    holderName: 'Estancia La Manga S.A.',
    holderTaxId: '30-71548963-1',
    renspa: '06.687.0.01542/00',
    establishmentType: 'CRIA',
    tenure: 'OWNED',
    province: 'Buenos Aires',
    location: { latitude: -36.79, longitude: -59.15 },
  });
  await post(page, `${base}/asset`, {
    name: 'Rodeo de cría — manga RFID',
    declaredQuantity: 4,
    metadata: { sistema_productivo: 'Cría', raza_predominante: 'Aberdeen Angus' },
  });
  return { bankPage, page, requestId: String(created.id) };
}

/** Espera un bovino quieto en la zona, lee la caravana (SIMULADA) y espera el resultado. */
async function registerAnimal(page: Page): Promise<string> {
  const state = page.getByTestId('chute-state');
  await expect(state).toHaveAttribute('data-state', 'WAITING_FOR_RFID', { timeout: 60_000 });
  await page.getByTestId('chute-read').click();
  const result = page.getByTestId('chute-result');
  await expect(result).toBeVisible({ timeout: 20_000 });
  return (await result.getAttribute('data-status')) ?? '';
}

test('manga + RFID: dos bovinos seguidos, identificados por caravana y confirmados en el servidor', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const { bankPage, page, requestId } = await chuteRequest(browser);
  await page.goto(`/escaner/${requestId}`);
  const mode = page.getByRole('button', { name: /Manga \+ RFID/ });
  await expect(mode).toContainText('escaneo individual');
  await mode.click();
  await page.getByRole('button', { name: 'Iniciar sesión de manga' }).click();
  await expect(page.getByTestId('chute-panel')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('rfid-reader')).toHaveText('SIMULADO');

  // Primer bovino.
  expect(await registerAnimal(page)).toBe('CONFIRMED');
  await expect(page.getByTestId('chute-result')).toContainText('✓ Bovino identificado');
  await expect(page.getByTestId('chute-eid')).toHaveText('032 0000 0000 0001');
  await expect(page.getByTestId('chute-result')).toContainText('Imágenes de evidencia');
  await page.screenshot({ path: 'test-results/manga-confirmado.png' });

  // Siguiente: espera a que salga el anterior y entre otro (nunca asocia dos con la misma escena).
  await page.getByTestId('chute-next').click();
  await expect(page.getByTestId('chute-state')).toHaveAttribute(
    'data-state',
    'WAITING_FOR_ANIMAL',
    { timeout: 30_000 },
  );
  expect(await registerAnimal(page)).toBe('CONFIRMED');
  await expect(page.getByTestId('chute-eid')).toHaveText('032 0000 0000 0002');
  await page.getByTestId('chute-next').click();

  await page.getByRole('button', { name: 'FINALIZAR' }).click();
  await expect(page.getByTestId('scanner-sync-detail')).toContainText('Verificado en servidor', {
    timeout: 240_000,
  });
  await expect(page.getByTestId('scanner-sync-detail')).toContainText('SIMULADO');
  const captures = page.getByTestId('chute-captures').locator('li');
  await expect(captures).toHaveCount(2);
  await expect(captures.first()).toContainText('oficial');
  await page.screenshot({ path: 'test-results/manga-resumen.png' });
  const official = await page.getByTestId('scanner-sync-detail').innerText();

  // Entidad: bovinos identificados, marcados SIMULADO, con imágenes de respaldo.
  await bankPage.goto(`/requests/${requestId}`);
  const panel = bankPage.getByTestId('bovine-individuals');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(bankPage.getByText(/Bovinos identificados: \d/)).toBeVisible();
  await expect(panel).toContainText('BOV-');
  await expect(panel).toContainText('SIMULADO');
  await panel.locator('tbody tr').first().click();
  await expect(bankPage.getByTestId('bovine-detail').locator('figure').first()).toBeVisible();
  await expect(bankPage.getByTestId('scan-chute')).toContainText('confirmadas');
  await bankPage.screenshot({ path: 'test-results/manga-banco.png', fullPage: true });
  test.info().annotations.push({ type: 'oficial', description: official });
});
