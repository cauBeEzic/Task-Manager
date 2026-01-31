import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4200',
    headless: true
  },
  webServer: {
    command: 'npm run start',
    url: process.env.E2E_BASE_URL || 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120 * 1000
  }
});
