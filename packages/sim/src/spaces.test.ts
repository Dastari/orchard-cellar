import { describe, expect, it } from 'vitest';
import {
  DEBUG_SPACE_ID,
  TOPSIDE_SPACE_ID,
  spaceDefinitionFor,
} from './spaces.js';

describe('26§2 space registry', () => {
  it('resolves static topside and owner-only debug definitions', () => {
    expect(spaceDefinitionFor(TOPSIDE_SPACE_ID)).toMatchObject({ generator: 'island' });
    expect(spaceDefinitionFor(DEBUG_SPACE_ID)).toMatchObject({
      generator: 'debug_flat',
      ownerOnly: true,
    });
  });

  it('resolves future per-player homestead rows with u16 ids', () => {
    expect(spaceDefinitionFor(60_000, { spaceId: 60_000, sizeTier: 2 })).toMatchObject({
      spaceId: 60_000,
      generator: 'homestead',
      sizeTiles: 64,
    });
    expect(spaceDefinitionFor(60_000, { spaceId: 60_001, sizeTier: 2 })).toBeUndefined();
    expect(spaceDefinitionFor(65_536, { spaceId: 65_536, sizeTier: 0 })).toBeUndefined();
  });
});
