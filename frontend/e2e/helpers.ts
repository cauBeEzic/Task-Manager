import { APIRequestContext, expect } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL || 'http://localhost:3000';
export const TEST_PASSWORD = 'Playwright-password-123!';

export function uniqueEmail(label: string) {
  const random = Math.random().toString(36).slice(2);
  return `${label}-${Date.now()}-${random}@example.com`;
}

export async function signUp(
  request: APIRequestContext,
  email = uniqueEmail('user'),
  password = TEST_PASSWORD
) {
  const response = await request.post(`${API_URL}/users`, {
    data: { email, password }
  });

  expect(response.status(), await response.text()).toBe(200);

  const accessToken = response.headers()['x-access-token'];
  expect(accessToken).toBeTruthy();

  return { email, password, accessToken };
}

export function accessTokenHeaders(accessToken: string) {
  return { 'x-access-token': accessToken };
}

export async function csrfToken(request: APIRequestContext) {
  const state = await request.storageState();
  const cookie = state.cookies.find(({ name }) => name === 'XSRF-TOKEN');
  expect(cookie, 'The server should set an XSRF-TOKEN cookie').toBeTruthy();
  return cookie!.value;
}
