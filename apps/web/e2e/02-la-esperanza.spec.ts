import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Criterio de éxito del MVP sobre los datos demo: La Esperanza, 1.500 bovinos declarados,
 * verificación con YOLOX real sobre las composiciones de las 6 cámaras → 1.500 detectados,
 * 100 % de coincidencia, score 82/100, evidencia,
 * historial, informe PDF y confirmación como garantía.
 */
test('La Esperanza: verificación de punta a punta', async ({ page, context }) => {
  await login(page);

  await page.goto('/assets');
  await page.getByPlaceholder(/Buscar por activo/).fill('Esperanza');
  await page
    .getByRole('cell', { name: /^Rodeo de cría La Esperanza La Esperanza · Rauch/ })
    .click();
  await expect(page.getByTestId('asset-declared')).toContainText('1.500');
  await expect(page.getByTestId('asset-declared')).toContainText('cabezas');

  await page.getByRole('tab', { name: /^Documentación/ }).click();
  const requirements = page.getByTestId('document-requirements');
  await expect(requirements).toContainText('RENSPA / SENASA');
  await expect(requirements).toContainText('DNI / CUIT del titular');
  await expect(page.getByText('Constancia RENSPA (SENASA)')).toBeVisible();

  await page.getByRole('link', { name: 'Verificar ahora' }).click();
  await page.getByTestId('start-verification').click();
  const result = page.getByTestId('verification-result');
  await expect(result).toBeVisible({ timeout: 60_000 });

  await expect(page.getByTestId('stat-declared')).toContainText('1.500');
  await expect(page.getByTestId('stat-detected')).toContainText('1.500');
  await expect(page.getByTestId('stat-match')).toContainText('100 %');
  await expect(page.getByTestId('score-value')).toHaveText('82');
  const breakdown = page.getByTestId('score-breakdown');
  for (const label of [
    'Documentación',
    'Existencia verificada',
    'Historial',
    'Riesgo',
    'Consistencia',
  ]) {
    await expect(breakdown).toContainText(label);
  }

  // Evidencia: 6 cámaras con conteo, modelo y confianza.
  const gallery = page.getByTestId('evidence-gallery');
  await expect(gallery.locator('article')).toHaveCount(6);
  await expect(gallery).toContainText('yolox-s-coco');
  await expect(
    page.getByRole('img', { name: 'Evolución del score de verificación' }),
  ).toBeVisible();

  // Informe PDF: se genera en segundo plano y se descarga por URL firmada.
  const pdfButton = page.getByTestId('report-pdf');
  await expect(pdfButton).toBeVisible({ timeout: 60_000 });
  const popupPromise = context.waitForEvent('page');
  await pdfButton.click();
  const popup = await popupPromise;
  await popup.waitForURL(/X-Amz-Signature=/, { timeout: 20_000 });
  const pdf = await page.request.get(popup.url());
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await popup.close();

  // Garantía: se confirma si el activo todavía no está en garantía (los datos demo lo dejan libre).
  const confirm = page.getByTestId('confirm-guarantee');
  if (await confirm.isVisible()) {
    await confirm.click();
    await page.getByTestId('confirm-guarantee-submit').click();
    await expect(page.getByText('Confirmado como garantía')).toBeVisible();
  }
  await page.goto('/monitoring');
  await expect(
    page.getByRole('row', { name: /Rodeo de cría La Esperanza(?! \(demo)/ }),
  ).toContainText('Activa');
});
