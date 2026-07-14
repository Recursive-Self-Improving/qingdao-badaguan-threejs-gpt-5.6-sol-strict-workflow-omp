import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const port = 41_732;
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: './tests/performance',
  testMatch: '**/*.profile.ts',
  outputDir: 'test-results/performance',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 420_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    browserName: 'chromium',
    headless: false,
    deviceScaleFactor: 1,
    viewport: { width: 1280, height: 720 },
    trace: 'off', screenshot: 'off', video: 'off',
    launchOptions: { args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] },
  },
  webServer: { command: `npm run dev -- --host ${host} --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false, timeout: 120_000 },
});
