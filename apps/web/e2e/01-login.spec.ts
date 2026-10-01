import { expect, test } from '@playwright/test';
import { credentials, login } from './helpers';

test.describe('Login', () => {
  test('rechaza credenciales inválidas', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/Correo electrónico/).fill(credentials.email);
    await page.getByLabel(/Contraseña/).fill('contraseña-incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirige a login sin sesión y entra al panel con credenciales válidas', async ({
    page,
  }) => {
    await page.goto('/monitoring');
    await expect(page).toHaveURL(/\/login\?next=%2Fmonitoring/);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Panel de cartera' })).toBeVisible();
    await expect(page.getByTestId('current-user')).toContainText('María López');
    await expect(page.getByTestId('kpi-assets')).toBeVisible();
  });

  test('cierra la sesión', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForURL('**/login');
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
