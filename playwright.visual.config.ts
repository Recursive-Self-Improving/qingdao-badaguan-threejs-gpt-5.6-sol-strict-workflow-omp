import { defineConfig } from '@playwright/test';

import browserConfig from './playwright.config';

export default defineConfig({
  ...browserConfig,
  testDir: './tests/visual',
  outputDir: 'test-results/visual',
});
