import { describe, expect, it } from 'vitest';
import { chestLifecycleTargetKind } from './net/overworld-connection.js';

describe('chest lifecycle target namespace', () => {
  it('uses the generic placeable namespace for the live unified chest projection', () => {
    expect(chestLifecycleTargetKind(40n, {
      id: 40n, kind: 'chest', definitionId: 'object:chest',
    })).toBe('placeable');
    expect(chestLifecycleTargetKind(41n, {
      id: 41n, kind: 'storage_box', definitionId: 'object:chest',
    })).toBe('placeable');
  });

  it('uses the legacy chest namespace when no same-id generic chest is live', () => {
    expect(chestLifecycleTargetKind(40n, undefined)).toBe('chest');
    expect(chestLifecycleTargetKind(40n, {
      id: 41n, kind: 'chest', definitionId: 'object:chest',
    })).toBe('chest');
  });

  it('does not confuse a colliding non-chest placeable id with the legacy namespace', () => {
    expect(chestLifecycleTargetKind(40n, {
      id: 40n, kind: 'anvil', definitionId: 'object:anvil',
    })).toBe('chest');
  });
});
