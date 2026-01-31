import { defineConfig } from '@playwright/test';

const frontendUrl = process.env.E2E_BASE_URL || 'http://localhost:4200';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: frontendUrl,
    headless: true
  },
  webServer: [
    {
      command: 'node ../api/app.js',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120 * 1000,
      env: {
        JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
        MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/TaskManager'
      }
    },
    {
      command: 'npm run start',
      url: frontendUrl,
      reuseExistingServer: true,
      timeout: 120 * 1000
    }
  ]
});
