import { expect, test } from '@playwright/test';
import { login, minimalPdf, seedAsset } from './helpers';

/**
 * Alta completa de un activo nuevo: selección de tipo, establecimiento, datos con metadata,
 * documentación, dispositivo instalado, evidencia manual, verificación, alerta e informe.
 */
test('alta de activo, verificación, alerta e informe', async ({ page }) => {
  const suffix = Date.now().toString(36).toUpperCase();
  const assetName = `Rodeo E2E ${suffix}`;
  await login(page);

  // 1. ¿Qué activos querés poner como garantía?
  await page.goto('/assets/new');
  await page.getByTestId('asset-type-BOVINOS').click();
  await page.getByRole('button', { name: /^Continuar/ }).click();

  // 2. Establecimiento registrado
  const option = page.locator('select[name="establishmentId"] option', { hasText: 'El Trébol' });
  await page
    .locator('select[name="establishmentId"]')
    .selectOption((await option.getAttribute('value'))!);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // 3. Información del activo (300 declaradas: la evidencia mostrará bastantes menos)
  await page.locator('input[name="name-BOVINOS"]').fill(assetName);
  await page.locator('input[name="quantity-BOVINOS"]').fill('300');
  await page.locator('input[name="value-BOVINOS"]').fill('210000');
  await page.getByLabel(/Sistema productivo/).selectOption('Recría');
  await page.getByLabel(/Raza predominante/).fill('Hereford');
  await page.getByLabel(/^Vacas/).fill('180');
  await page.getByTestId('save-assets').click();

  // 4. Documentación
  await expect(page.getByTestId('document-requirements')).toBeVisible();
  await page.getByLabel(/Tipo de documento/).selectOption('SANITARY_CERTIFICATE');
  await page.getByLabel(/^Archivo/).setInputFiles({
    name: 'certificado-sanitario.pdf',
    mimeType: 'application/pdf',
    buffer: minimalPdf,
  });
  await page.getByRole('button', { name: 'Cargar documento' }).click();
  await expect(page.getByText(/cargado\. Queda pendiente de revisión/)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // 5. Dispositivos: equipo ya instalado (sin señal en el gateway simulado) + fotos manuales
  await page.getByRole('button', { name: /Ya instalé mis dispositivos/ }).click();
  await page.getByLabel(/Número de serie/).fill(`CAM-E2E-${suffix}`);
  await page.getByLabel(/Ubicación \/ referencia/).fill('Bebedero norte');
  await page.getByRole('button', { name: 'Registrar y probar conexión' }).click();
  await expect(page.getByText(/todavía no reporta señal/)).toBeVisible();
  await page.getByText('Cargar fotografías del activo').click();
  await page.getByLabel(/^Imágenes/).setInputFiles(seedAsset('cameras/CAM-ET-01.jpg'));
  await page.getByRole('button', { name: 'Cargar evidencia' }).click();
  await expect(page.getByText('Imagen incorporada como evidencia.')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // 6. Verificación
  await page.getByRole('link', { name: 'Verificar ahora' }).click();
  await page.getByTestId('start-verification').click();
  await expect(page.getByTestId('verification-result')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('stat-declared')).toContainText('300');
  await expect(page.getByTestId('stat-detected')).toContainText(/\d/);
  await expect(page.getByTestId('evidence-gallery').locator('article')).toHaveCount(1);
  await expect(page.getByTestId('score-value')).toHaveText(/^\d{1,3}$/);

  // Alerta generada por la regla "cantidad detectada inferior a la declarada" (umbral 90 %)
  await page.goto('/alerts');
  const alertRow = page
    .getByRole('row', { name: new RegExp(assetName) })
    .filter({ hasText: 'Diferencia significativa entre cantidad declarada y detectada' });
  await expect(alertRow).toContainText('por debajo del umbral de 90 %');
  await alertRow.getByRole('button', { name: 'Resolver' }).click();
  await page
    .getByLabel(/Nota de resolución/)
    .fill('Se coordinó un recuento presencial con el productor.');
  await page.getByRole('dialog').getByRole('button', { name: 'Resolver' }).click();
  await expect(
    page
      .getByRole('row', { name: new RegExp(assetName) })
      .filter({ hasText: 'Diferencia significativa' }),
  ).toHaveCount(0);

  // Informe generado para la verificación
  await page.goto('/reports');
  const reportRow = page.getByRole('row', { name: new RegExp(assetName) });
  await expect(reportRow.getByRole('button', { name: 'PDF' })).toBeVisible({ timeout: 60_000 });
});
