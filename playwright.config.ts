import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const defaultPort = 41_731;
const portOverride = process.env.PLAYWRIGHT_PORT;

function parsePort(value: string): number {
  if (!/^[1-9]\d{0,4}$/.test(value)) {
    throw new Error(
      `Invalid PLAYWRIGHT_PORT "${value}": expected an integer from 1 to 65535.`,
    );
  }

  const parsed = Number(value);
  if (parsed > 65_535) {
    throw new Error(
      `Invalid PLAYWRIGHT_PORT "${value}": expected an integer from 1 to 65535.`,
    );
  }

  return parsed;
}

const port = portOverride === undefined ? defaultPort : parsePort(portOverride);
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
