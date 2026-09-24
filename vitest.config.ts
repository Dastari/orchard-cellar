import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'scripts/*.test.ts'],
    // Terrain/world-generation fixtures are CPU-heavy. Serialize test files on
    // constrained CI and coverage runs so worker contention cannot trip the
    // dedicated per-test performance budgets.
    fileParallelism: process.env.CI !== 'true' && !process.argv.includes('--coverage'),
    // Coverage instruments large world-generation fixtures on hosted CPUs.
    testTimeout: process.argv.includes('--coverage') ? 120_000 : 15_000,
    exclude: process.env.ORCHARD_TEST_LICENSED_ART === '0' ? [
      'packages/tools/src/hearth-architecture-assets.test.ts',
      'packages/tools/src/hearth-bridge-assets.test.ts',
      'packages/tools/src/hearth-icon-assets.test.ts',
      'packages/tools/src/hearth-pavement-assets.test.ts',
      'packages/tools/src/empty-terrain-assets.test.ts',
      'packages/tools/src/hearth-resource-assets.test.ts',
      'packages/tools/src/hearth-seating-assets.test.ts',
      'packages/tools/src/hearth-village-assets.test.ts',
      'packages/tools/src/hearth-volcano-scenery-assets.test.ts',
    ] : [],
    coverage: {
      provider: 'v8',
      include: ['packages/sim/src/**/*.ts'],
      // CI shards each see part of the suite; thresholds are enforced once, on the
      // merged report (vitest --merge-reports --coverage). Local runs and release
      // gates (npm run check) never set ORCHARD_COVERAGE_SHARD.
      thresholds: process.env.ORCHARD_COVERAGE_SHARD === '1'
        ? undefined
        : { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
