import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    // Terrain/world-generation fixtures are CPU-heavy. Serialize test files on
    // constrained CI runners so worker contention cannot trip per-test budgets.
    fileParallelism: process.env.CI !== 'true',
    coverage: {
      provider: 'v8',
      include: ['packages/sim/src/**/*.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
