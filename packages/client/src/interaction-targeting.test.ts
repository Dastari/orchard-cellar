import { describe, expect, it } from 'vitest';
import { nearestInteractionCandidate, type InteractionCandidate } from './interaction-targeting.js';

describe('E-key interaction targeting', () => {
  it('selects the closest interaction point regardless of entity type or candidate order', () => {
    const merchant = { kind: 'merchant', x: 32, y: 0, stableId: 'npc:1' } as const;
    const chest = { kind: 'chest', x: 12, y: 0, stableId: 'chest:4' } as const;
    expect(nearestInteractionCandidate(0, 0, [merchant, chest])).toBe(chest);
    expect(nearestInteractionCandidate(0, 0, [chest, merchant])).toBe(chest);
  });

  it('uses deterministic kind and stable-id ordering only for exact distance ties', () => {
    const candidates: InteractionCandidate[] = [
      { kind: 'merchant', x: 8, y: 0, stableId: 'npc:1' },
      { kind: 'chest', x: 0, y: 8, stableId: 'chest:9' },
      { kind: 'chest', x: -8, y: 0, stableId: 'chest:2' },
    ];
    expect(nearestInteractionCandidate(0, 0, candidates)).toEqual(candidates[2]);
  });

  it('includes embedded target arrows in the shared nearest-E path', () => {
    const arrow = { kind: 'embedded_arrow', x: 4, y: 0, stableId: 'arrow:8' } as const;
    const item = { kind: 'world_item', x: 9, y: 0, stableId: 'item:2' } as const;
    expect(nearestInteractionCandidate(0, 0, [item, arrow])).toBe(arrow);
  });

  it('includes mature crops in the shared nearest-E path', () => {
    const crop = { kind: 'crop', x: 4, y: 0, stableId: 'crop:8' } as const;
    const item = { kind: 'world_item', x: 9, y: 0, stableId: 'item:2' } as const;
    expect(nearestInteractionCandidate(0, 0, [item, crop])).toBe(crop);
  });
});
