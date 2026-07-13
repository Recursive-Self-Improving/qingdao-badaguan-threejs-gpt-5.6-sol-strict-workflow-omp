import { defineConfig } from '@playwright/test';

import browserConfig from './playwright.config';

export default defineConfig({
  ...browserConfig,
  testDir: './tests/visual',
  testMatch: 'environment.spec.ts',
  outputDir: 'test-results/c07/playwright',
  projects: browserConfig.projects?.filter((project) => project.name === 'desktop-chromium'),
});
