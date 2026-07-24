import { test, expect } from '@playwright/test';
import {
  accessTokenHeaders,
  API_URL,
  csrfToken,
  signUp,
  TEST_PASSWORD,
  uniqueEmail
} from './helpers';

test('returns an invalid-login error for incorrect credentials', async ({ request }) => {
  const response = await request.post(`${API_URL}/users/login`, {
    data: {
      email: uniqueEmail('missing-user'),
      password: TEST_PASSWORD
    }
  });

  expect(response.status()).toBe(400);
  expect(response.headers()['x-access-token']).toBeUndefined();
});

test('creates a signed JWT access token during authentication', async ({ request }) => {
  const { accessToken } = await signUp(request, uniqueEmail('jwt'));
  const tokenParts = accessToken.split('.');

  expect(tokenParts).toHaveLength(3);

  const payload = JSON.parse(
    Buffer.from(tokenParts[1], 'base64url').toString('utf8')
  );

  expect(payload._id).toMatch(/^[a-f\d]{24}$/);
  expect(payload.iat).toEqual(expect.any(Number));
  expect(payload.exp).toBeGreaterThan(payload.iat);
  expect(payload.exp - payload.iat).toBe(15 * 60);
});

test('refreshes an access token only for a valid cookie and CSRF pair', async ({ request }) => {
  await signUp(request, uniqueEmail('refresh'));
  const xsrf = await csrfToken(request);

  const refreshResponse = await request.post(`${API_URL}/users/me/access-token`, {
    headers: { 'X-XSRF-TOKEN': xsrf }
  });

  expect(refreshResponse.status(), await refreshResponse.text()).toBe(200);
  const refreshedAccessToken = refreshResponse.headers()['x-access-token'];
  expect(refreshedAccessToken).toBeTruthy();
  expect((await refreshResponse.json()).accessToken).toBe(refreshedAccessToken);

  const protectedResponse = await request.get(`${API_URL}/lists`, {
    headers: accessTokenHeaders(refreshedAccessToken)
  });
  expect(protectedResponse.status()).toBe(200);

  const missingCsrfResponse = await request.post(
    `${API_URL}/users/me/access-token`
  );
  expect(missingCsrfResponse.status()).toBe(403);
});

test('recovers the browser session after an application reload', async ({ page }) => {
  const email = uniqueEmail('session-recovery');
  const listTitle = `Recovered list ${Date.now()}`;

  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/lists$/);

  await page.getByRole('button', { name: '+ New List' }).click();
  await page.getByPlaceholder('Enter list name...').fill(listTitle);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(listTitle, { exact: true })).toBeVisible();

  const refreshResponse = page.waitForResponse(
    response =>
      response.url() === `${API_URL}/users/me/access-token` &&
      response.status() === 200
  );
  await page.reload();

  await refreshResponse;
  await expect(page.getByText(listTitle, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/lists\/[a-f\d]{24}$/);
});
