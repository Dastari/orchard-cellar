import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, parseObjectDefinition } from '@orchard/sim';
import { chestLifecycleTargetKind } from './net/overworld-connection.js';

const registry = bootstrapContentRegistry();

describe('chest lifecycle target namespace', () => {
  it('uses the generic placeable namespace for the live unified chest projection', () => {
    expect(chestLifecycleTargetKind(40n, {
      id: 40n, kind: 'chest', definitionId: 'object:chest',
    }, registry)).toBe('placeable');
    expect(chestLifecycleTargetKind(41n, {
      id: 41n, kind: 'storage_box', definitionId: 'object:chest',
    }, registry)).toBe('placeable');
  });

  it('uses the legacy chest namespace when no same-id generic chest is live', () => {
    expect(chestLifecycleTargetKind(40n, undefined, registry)).toBe('chest');
    expect(chestLifecycleTargetKind(40n, {
      id: 41n, kind: 'chest', definitionId: 'object:chest',
    }, registry)).toBe('chest');
  });

  it('does not confuse a colliding non-chest placeable id with the legacy namespace', () => {
    expect(chestLifecycleTargetKind(40n, {
      id: 40n, kind: 'anvil', definitionId: 'object:anvil',
    }, registry)).toBe('chest');
  });

  it('follows an active renamed chest definition and rejects an explicit stale id', () => {
    const source = registry.objects.get('object:chest')!;
    const renamed = parseObjectDefinition({ ...source, id: 'object:moon_crate' });
    const active = { objects: new Map([[renamed.id, renamed]]), items: registry.items };
    expect(chestLifecycleTargetKind(40n, {
      id: 40n, kind: 'storage_box', definitionId: renamed.id,
    }, active)).toBe('placeable');
    expect(chestLifecycleTargetKind(40n, {
      id: 40n, kind: 'chest', definitionId: source.id,
    }, active)).toBe('chest');
  });
});
