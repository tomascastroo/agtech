import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

// Las credenciales demo se leen del mismo .env que usa el seed (nunca del código).
// Playwright transpila los tests a CommonJS: se usa __dirname.
const repoRoot = join(__dirname, '../../..');
const rootEnv = join(repoRoot, '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const credentials = {
  email:
    process.env.E2E_EMAIL ?? process.env.DEMO_LOGIN_EMAIL ?? 'maria.lopez@bancodelcampo.com.ar',
  password: process.env.E2E_PASSWORD ?? process.env.SEED_DEMO_PASSWORD ?? '',
};

export const seedAsset = (name: string) => join(repoRoot, 'infra/seed-assets', name);

export async function login(page: Page) {
  if (!credentials.password)
    throw new Error('Definí SEED_DEMO_PASSWORD (o E2E_PASSWORD) para los tests E2E');
  await page.goto('/login');
  await page.getByLabel(/Correo electrónico/).fill(credentials.email);
  await page.getByLabel(/Contraseña/).fill(credentials.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByTestId('weighted-score')).toBeVisible();
}

/** PDF mínimo válido (la API verifica la firma del archivo, no la extensión). */
export const minimalPdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);
