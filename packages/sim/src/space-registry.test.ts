import { describe, expect, it } from 'vitest';
import { buildSpaceRegistry } from './space-registry.js';
import { SPACES } from './spaces.js';

describe('space registry', () => {
  it('uses supplied static revision without bootstrap fallback', () => {
    const spaces = buildSpaceRegistry(SPACES.filter((s) => s.spaceId !== 65533), [], []);
    expect(spaces.some((s) => s.definition.spaceId === 65533)).toBe(false);
    expect(spaces.map((s) => s.definition)).toEqual(SPACES.filter((s) => s.spaceId !== 65533).sort((a, b) => a.spaceId - b.spaceId));
  });
  it('resolves expanded homes, cellar, owner and portal links', () => {
    const portal = { id: '7', fromSpace: 20000, fromTileX: 11, fromTileY: 7, toSpace: 20001, toTileX: 512, toTileY: 499 };
    const rows = buildSpaceRegistry([], [{ spaceId: 10000, ownerName: 'Ada', ownerIdentity: 'abc', sizeTier: 2,
      residenceSpaceId: 20000, residenceExpansionRank: 2 }], [portal]);
    expect(rows.map((r) => [r.kind, r.definition.sizeTiles])).toEqual([['homestead', 160], ['residence', 32], ['cellar', 1024]]);
    expect(rows[1]?.portals).toEqual([portal]);
    expect(rows[2]?.ownerIdentity).toBe('abc');
    expect(rows[0]?.label).toBe("Ada's farm");
  });
  it('includes active rogue geometry without financial state and ignores inactive rooms', () => {
    const rogue = { spaceId: 30000, instanceKind: 'roguelike', seed: 9, roomNumber: 2, roomKind: 'combat', theme: 'cave' };
    const rows = buildSpaceRegistry([], [rogue, { ...rogue, spaceId: 30001, active: false }], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.definition.rogueRoom?.seed).toBe(9);
    expect(rows[0]?.definition.sizeTiles).toBe(32);
  });
});
