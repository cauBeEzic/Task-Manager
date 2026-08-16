import { test, expect } from '@playwright/test';
import { API_URL, signUp, TEST_PASSWORD, uniqueEmail } from './helpers';

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('accepts an email and password', async ({ page }) => {
  await page.goto('/login');

  const email = uniqueEmail('typed-login');
  const emailInput = page.getByPlaceholder('Email');
  const passwordInput = page.getByPlaceholder('Password');

  await emailInput.fill(email);
  await passwordInput.fill(TEST_PASSWORD);

  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(TEST_PASSWORD);
});

test('authenticates valid credentials', async ({ page, request }) => {
  const credentials = await signUp(request, uniqueEmail('login'));

  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(credentials.email);
  await page.getByPlaceholder('Password').fill(credentials.password);

  const [loginResponse] = await Promise.all([
    page.waitForResponse(
      response =>
        response.url() === `${API_URL}/users/login` &&
        response.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Login' }).click()
  ]);

  expect(loginResponse.status()).toBe(200);
  expect(loginResponse.headers()['x-access-token']).toBeTruthy();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(page.getByRole('heading', { name: 'Lists' })).toBeVisible();

  const xsrfCookie = (await page.context().cookies())
    .find(({ name }) => name === 'XSRF-TOKEN');
  expect(xsrfCookie, 'Login should set a browser-readable CSRF cookie').toBeTruthy();
  expect(xsrfCookie!.path).toBe('/');
  await expect.poll(() => page.evaluate(() => document.cookie))
    .toContain('XSRF-TOKEN=');
});
