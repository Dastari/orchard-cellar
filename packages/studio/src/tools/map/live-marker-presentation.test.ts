import { describe, expect, it } from 'vitest';
import { buildContentRegistry, bootstrapContentRows } from '@orchard/sim';
import type { MapEditorLiveMarker } from './editor-controller.js';
import { resolveStudioLiveMarkerPresentation } from './live-marker-presentation.js';

const registry = buildContentRegistry(bootstrapContentRows()).registry;
const marker = (overrides: Partial<MapEditorLiveMarker>): MapEditorLiveMarker => ({
  id: '1', entityKind: 'placeable', kind: 'chest', label: 'Chest', spaceId: 0,
  tileX: 1, tileY: 1, worldX: 24, worldY: 32, elevation: 0,
  footprint: { width: 1, height: 1 }, layer: 'player_owned', color: '#fff',
  ...overrides,
});

describe('Studio live marker presentation authority', () => {
  it('resolves active durable objects and rejects explicit missing identities', () => {
    expect(resolveStudioLiveMarkerPresentation(registry,
      marker({ definitionId: 'object:chest' })).kind).toBe('object');
    expect(resolveStudioLiveMarkerPresentation(registry,
      marker({ definitionId: 'object:not_here' }))).toEqual({ kind: 'neutral' });
  });

  it('retains blank legacy object compatibility without treating explicit ids as kinds', () => {
    expect(resolveStudioLiveMarkerPresentation(registry, marker({ definitionId: '' }))).toMatchObject({
      kind: 'object', legacyFallback: true,
    });
  });

  it('gates wildlife by the active creature registry while preserving the NPC kind', () => {
    expect(resolveStudioLiveMarkerPresentation(registry, marker({
      entityKind: 'npc', kind: 'wildlife', species: 'chicken', definitionId: undefined,
    }))).toEqual({ kind: 'wildlife', species: 'chicken' });
    expect(resolveStudioLiveMarkerPresentation(registry, marker({
      entityKind: 'npc', kind: 'wildlife', species: 'moon_bird', definitionId: undefined,
    }))).toEqual({ kind: 'neutral' });
  });

  it('does not render any live authority from an unverified registry', () => {
    expect(resolveStudioLiveMarkerPresentation(null, marker({}))).toEqual({ kind: 'neutral' });
  });
});
