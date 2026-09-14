import { describe, expect, it } from 'vitest';
import { uiMetadataErrors } from './ui-metadata.js';
import type { AssetSource } from './types.js';

const grid = ['................', '................'] as const;
const base: AssetSource = {
  name: 'ui_test', category: 'ui', size: [16, 2], anchor: [0, 0],
  frames: { idle: [grid] }, frameKinds: { idle: 'state' },
  sourcePath: 'references/art/kenmi/cute-fantasy/ui/UI/Test.png',
};

describe('Cute Fantasy UI metadata lint', () => {
  it('requires explicit sizing intent for licensed UI extracts', () => {
    expect(uiMetadataErrors(base)).toContain('ui_test: Cute Fantasy UI assets must declare uiSizing');
  });

  it('requires slices and complete state sets', () => {
    expect(uiMetadataErrors({ ...base, uiSizing: 'nine_slice', uiRequiredStates: ['idle', 'pressed'] }))
      .toEqual(expect.arrayContaining([
        'ui_test: nine_slice UI assets must declare slice insets',
        'ui_test: missing required UI state pressed',
      ]));
  });

  it('accepts a complete fixed-size state asset', () => {
    expect(uiMetadataErrors({ ...base, uiSizing: 'fixed', uiRequiredStates: ['idle'] })).toEqual([]);
  });
});

it('rejects unclassified kit frames and nonexact palettes', () => {
  const errors = uiMetadataErrors({ ...base, uiSizing: 'fixed', tags: ['ui.kit'], frameKinds: {} });
  expect(errors).toContain('ui_test: kit group idle must declare frameKinds');
  expect(errors).toContain('ui_test: kit group idle must declare sourceRegions');
  expect(errors).toContain('ui_test: kit art requires exact sourcePalette');
});
