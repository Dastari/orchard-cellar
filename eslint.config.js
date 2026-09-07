import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'build/releases/**/previous-dist/**',
      'output/playwright/**',
      'output/**/client-dist/**',
      'output/**/publish-candidate/**',
      'output/lighting-58-20260905/runtime/review.js',
      'output/lighting-58-20260905/runtime/basic-composite-review.js',
      'output/lighting-58-20260905/shadows/review.js',
      'output/lighting-58-20260906/release/world-review.js',
      'output/lighting-lockup-20260906/tint-probe.js',
      '**/coverage/**',
      '**/node_modules/**',
      'packages/world-bindings/src/**',
      'references/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/client/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@orchard/studio', '@orchard/studio/*', '**/studio', '**/studio/**'],
          message: '@orchard/client and @orchard/studio must remain independent applications.',
        }],
      }],
    },
  },
  {
    files: ['packages/studio/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@orchard/client', '@orchard/client/*', '**/client', '**/client/**'],
          message: '@orchard/studio and @orchard/client must remain independent applications.',
        }],
      }],
    },
  },
  {
    files: ['packages/{engine,ui}/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@orchard/auth',
            '@orchard/auth/*',
            '@orchard/world-bindings',
            '@orchard/world-bindings/*',
            '**/auth',
            '**/auth/**',
            '**/world-bindings',
            '**/world-bindings/**',
          ],
          message: '@orchard/engine and @orchard/ui must not depend on auth or live-world bindings.',
        }],
      }],
    },
  },
  {
    files: ['packages/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG in rng.ts.' },
        { object: 'Date', property: 'now', message: 'Use the simulation tick counter.' },
      ],
    },
  },
);
