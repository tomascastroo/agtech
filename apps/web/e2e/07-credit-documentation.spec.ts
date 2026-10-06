import { expect, test } from '@playwright/test';
import { login, seedAsset } from './helpers';

/**
 * Documentación de crédito de punta a punta con el OCR REAL del servicio de IA:
 * simular una solicitud → abrirla → productor, establecimiento, activo y documentos → lectura OCR
 * → pedir documentación → tarea del productor → el productor carga el documento → se procesa →
 * la entidad reprocesa y ve el resultado actualizado. Todos los datos son de DEMOSTRACIÓN.
 */
test('demo con documentación faltante: OCR, pedido al productor, carga y resultado actualizado', async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  // 1. Crear la demo.
  await login(page);
  await page.goto('/requests/new?modo=demo');
  await page.getByTestId('demo-scenario-MISSING_DOCUMENTS').click();
  await page.getByRole('button', { name: 'Crear demo' }).click();
  await expect(page.getByTestId('demo-created')).toBeVisible({ timeout: 60_000 });
  const producerEmail = await page.getByTestId('demo-producer-email').innerText();
  const producerPassword = await page.getByTestId('demo-producer-password').innerText();

  // 2-5. Abrir la solicitud: datos de demostración, productor, establecimiento y activo.
  await page.getByRole('button', { name: 'Abrir solicitud' }).click();
  await page.waitForURL('**/requests/**');
  await expect(page.getByTestId('demo-banner')).toContainText('Datos de demostración');
  await expect(page.getByText('Juan Pérez · CUIT 20-00000001-9')).toBeVisible();
  await expect(page.getByText(/La Esperanza · Villaguay/)).toBeVisible();
  await expect(page.getByText(/Rodeo de cría La Esperanza \(demo\) · 1\.500/)).toBeVisible();

  // 6-8. Documentos: la constancia de CUIT pasa por el OCR real y queda consistente.
  const taxId = page.getByTestId('requirement-TAX_ID');
  await expect(taxId).toContainText('Consistente', { timeout: 90_000 });
  await expect(taxId).toContainText('Documento de demostración');
  await taxId.getByRole('button', { name: 'Ver documento' }).click();
  await expect(taxId.getByTestId('document-viewer').locator('img')).toBeVisible();
  await expect(page.getByTestId('ocr-detail')).toContainText('20000000019');
  await expect(page.getByTestId('requirement-RENSPA')).toContainText('Pendiente');
  await expect(page.getByTestId('requirement-RENSPA')).toContainText('Solicitado al productor');
  // Fuente oficial: no conectada (nada figura como verificado por SENASA).
  await expect(page.getByTestId('data-layers')).toContainText('No conectada');

  // 9. La entidad pide además la tenencia del campo.
  const tenure = page.getByTestId('requirement-LAND_TENURE');
  await tenure.getByRole('button', { name: 'Solicitar' }).click();
  await expect(tenure).toContainText('Solicitado al productor');
  const requestUrl = page.url();

  // 10. El productor ve sus tareas.
  const producer = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const pp = await producer.newPage();
  await pp.goto('/login');
  await pp.getByLabel(/Correo electrónico/).fill(producerEmail);
  await pp
    .getByLabel(/Contraseña/)
    .first()
    .fill(producerPassword);
  await pp.getByRole('button', { name: 'Ingresar' }).click();
  await pp.waitForURL('**/productor**');
  // La cuenta de demostración se identifica en todo el portal.
  await expect(pp.getByTestId('producer-demo-tag')).toBeVisible();
  await expect(pp.getByTestId('demo-banner')).toContainText('Datos de demostración');
  await expect(pp.getByText('Banco del Campo solicita: RENSPA')).toBeVisible();
  await pp.getByText('Banco del Campo solicita: RENSPA').click();

  // 11. Carga el RENSPA (foto) desde su tarjeta.
  const card = pp.getByTestId('producer-requirement-RENSPA');
  await expect(card).toContainText('Por qué');
  await card.getByRole('button', { name: /Subí una foto o PDF/ }).click();
  await pp
    .getByLabel('Archivo o foto del documento')
    .setInputFiles(seedAsset('demo-documents/renspa.png'));
  await pp.getByRole('button', { name: 'Subir documento' }).click();

  // 12. Se procesa (OCR real) y el productor ve el resultado.
  await expect(pp.getByTestId('producer-requirement-RENSPA')).toContainText('Datos consistentes', {
    timeout: 90_000,
  });
  // Segundo pedido: el botón del pedido abre la carga con SU tipo (no el del primer pedido).
  await pp.goto(pp.url());
  await pp.getByRole('button', { name: /Subir certificado sanitario/i }).click();
  await expect(pp.getByLabel('Tipo de documento')).toHaveValue('SANITARY_CERTIFICATE');
  await pp
    .getByLabel('Archivo o foto del documento')
    .setInputFiles(seedAsset('demo-documents/certificado-vacunacion.png'));
  await pp.getByRole('button', { name: 'Subir documento' }).click();
  await expect(pp.getByTestId('producer-requirement-SANITARY_CERTIFICATE')).toContainText(
    'Datos consistentes',
    { timeout: 90_000 },
  );
  await expect(pp.getByTestId('producer-requirement-RENSPA')).toContainText('Datos consistentes');

  // El productor ve el documento que subió.
  const uploaded = pp.getByRole('button', { name: 'Ver', exact: true }).first();
  await uploaded.click();
  await expect(pp.getByTestId('document-viewer').locator('img')).toBeVisible();
  await producer.close();

  // El panel de cartera no mezcla la demo con la cartera real.
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-demo-note')).toContainText('solo datos reales');

  // 13. La entidad reprocesa y ve el resultado actualizado.
  await page.goto(requestUrl);
  const renspa = page.getByTestId('requirement-RENSPA');
  await expect(renspa).toContainText('Consistente', { timeout: 60_000 });
  await renspa.getByRole('button', { name: 'Procesar de nuevo' }).click();
  await expect(renspa).toContainText('Consistente', { timeout: 60_000 });
  await renspa.getByRole('button', { name: 'Ver documento' }).click();
  await expect(renspa.getByTestId('document-viewer').locator('img')).toBeVisible();
  await expect(page.getByTestId('ocr-detail')).toContainText('99.001.0.00001/00');
  await page.screenshot({ path: 'test-results/documentacion-banco.png', fullPage: true });
});

test('demo con inconsistencia: el banco ve el motivo exacto', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto('/requests/new?modo=demo');
  await page.getByTestId('demo-scenario-INCONSISTENT').click();
  await page.getByRole('button', { name: 'Crear demo' }).click();
  await page.getByRole('button', { name: 'Abrir solicitud' }).click();
  const renspa = page.getByTestId('requirement-RENSPA');
  await expect(renspa).toContainText('Inconsistente', { timeout: 90_000 });
  await expect(page.getByTestId('requirement-reason-RENSPA')).toContainText(
    'RENSPA del documento distinto del declarado',
  );
  await expect(page.getByTestId('data-layers').locator('tr[data-field="renspa"]')).toContainText(
    'No coincide',
  );
});
