import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'scripts/*.test.ts'],
    // Terrain/world-generation fixtures are CPU-heavy. Serialize test files on
    // constrained CI and coverage runs so worker contention cannot trip the
    // dedicated per-test performance budgets.
    fileParallelism: process.env.CI !== 'true' && !process.argv.includes('--coverage'),
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['packages/sim/src/**/*.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
