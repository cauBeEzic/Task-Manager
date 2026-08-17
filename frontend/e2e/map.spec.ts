import { expect, test } from '@playwright/test';

test('serves the MapLibre worker and finishes loading the task map', async ({ page }) => {
  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const headers = {
      'content-type': 'application/json',
      'access-control-allow-origin': process.env.E2E_BASE_URL || 'http://localhost:4200',
      'access-control-allow-credentials': 'true',
      'x-access-token': 'map-test-token'
    };
    const body = url.endsWith('/lists/map-test-list/tasks')
      ? []
      : url.endsWith('/lists')
        ? [{ _id: 'map-test-list', title: 'Map test list' }]
        : {};
    return route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
  });

  await page.route('https://tiles.openfreemap.org/styles/liberty', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: 8,
      sources: {},
      layers: [{
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#dbeafe' }
      }]
    })
  }));

  const workerResponse = page.waitForResponse(response =>
    response.url().endsWith('/maplibre-gl-worker.mjs')
  );
  const sharedResponse = page.waitForResponse(response =>
    response.url().endsWith('/maplibre-gl-shared.mjs')
  );

  await page.goto('/lists/map-test-list/map');

  expect((await workerResponse).status()).toBe(200);
  expect((await sharedResponse).status()).toBe(200);
  await expect(page.locator('#task-map canvas')).toBeVisible();
  await expect(page.locator('#task-map')).toHaveAttribute('aria-busy', 'false');
});
