import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:15173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'npm run start --workspace backend',
      url: 'http://127.0.0.1:18788/api/health',
      env: {
        LABLINEAGE_PORT: '18788',
        LABLINEAGE_AUTH_MODE: 'development',
        NODE_ENV: 'test'
      },
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: 'npm run dev --workspace frontend -- --host 127.0.0.1 --port 15173 --strictPort',
      url: 'http://127.0.0.1:15173',
      env: {
        LABLINEAGE_API_ORIGIN: 'http://127.0.0.1:18788'
      },
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
});
