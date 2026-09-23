import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import orchardUiKit from './scripts/eslint/orchard-ui-kit.mjs';
import { STUDIO_UI_KIT_POLICY } from './packages/studio/scripts/verify-ui-kit.mjs';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'build/releases/**',
      'output/**',
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
  // UI-kit gate (wiki: Decisions/61-Enforced UI-Kit Gate): Studio composes screens from kit factories only.
  // Keep both allowlists explicit and small. A new entry needs a reason.
  {
    files: ['packages/studio/src/**/*.ts'],
    ignores: ['packages/studio/src/**/*.test.ts'],
    plugins: { 'orchard-ui-kit': orchardUiKit },
    rules: {
      'orchard-ui-kit/no-hand-built-elements': 'error',
      'orchard-ui-kit/kit-entry-only': 'error',
      'orchard-ui-kit/no-raw-canvas-draw': 'error',
      'orchard-ui-kit/no-colour-literals': 'error',
    },
  },
  {
    // Spatial viewport renderers (world content, never chrome). The list lives
    // with the prebuild gate so both enforce the same allowlist.
    files: [...STUDIO_UI_KIT_POLICY.rawDrawAllowlist],
    rules: { 'orchard-ui-kit/no-raw-canvas-draw': 'off' },
  },
  {
    // Token and content files (sprite colour ramps, catalog category colours).
    files: [...STUDIO_UI_KIT_POLICY.colourAllowlist],
    rules: { 'orchard-ui-kit/no-colour-literals': 'off' },
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
