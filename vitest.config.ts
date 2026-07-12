import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.spec.ts'],
    passWithNoTests: true,
    clearMocks: true,
    restoreMocks: true,
  },
});
