import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_USE_BUNDLED_CHROMIUM
        ? undefined
        : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `OPSEC_PROVIDER=demo NEXT_TELEMETRY_DISABLED=1 npm run ${process.env.OPSEC_E2E_PRODUCTION ? 'start' : 'dev'} -- --port 3100`,
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120000,
  },
  outputDir: 'test-results',
});
