import { describe, expect, it } from 'vitest';
import {
  StudioRowsProjection,
  type StudioRowsProjectionSource,
} from './studio-connection.js';

const identity = (value: string) => ({ toHexString: () => value });
const table = <Row>(rows: () => readonly Row[]) => ({ iter: () => rows().values() });

function fixture(resourceCount = 1) {
  const data = {
    placeables: [{
      id: 1n, kind: 'fruit_press', tileX: 4, tileY: 5, spaceId: 0,
      facing: 'down', open: false, lit: false, carriedBy: undefined,
      definitionId: 'object:fruit_press', smeltStartTick: undefined,
      stateJson: '{"batch":2}',
      processStartTick: undefined as bigint | undefined,
      barrelSealedTick: undefined, cookStartTick: undefined,
    }],
    combatTargets: [{
      id: 2n, kind: 'archery_target', x: 16, y: 32, spaceId: 0,
      carriedBy: undefined, healthCenti: 100, maxHealthCenti: 100,
    }],
    resources: Array.from({ length: resourceCount }, (_, index) => ({
      id: BigInt(index + 10), kind: 'tree', tileX: index, tileY: 1, spaceId: 0,
      health: 5, depleted: false, growthStage: 3, miningClass: '', richness: 0,
      maximumRichness: 0,
    })),
    surfaces: [{ id: 3n, kind: 'campfire', tileX: 6, tileY: 7, spaceId: 0 }],
    npcs: [{
      id: 4n, kind: 'wildlife', displayName: 'Doe', x: 64, y: 80,
      homeX: 48, homeY: 64, rider: undefined as ReturnType<typeof identity> | undefined,
      facing: 'left', moving: false, wanderDirection: 'idle', health: 8, spaceId: 0,
    }],
    wildlife: [{ npcId: 4n, species: 'deer', variant: 1 }],
    positions: [{
      identity: identity('player-1'), spaceId: 0, x: 96, y: 112,
      facing: 'right', moving: false, equippedKind: 'axe',
    }],
    profiles: [{ identity: identity('player-1'), displayName: 'Toby', online: true }],
    appearances: [{
      identity: identity('player-1'), hairKind: 'hair-1', shirtKind: 'shirt-1',
      pantsKind: 'pants-1', shoesKind: 'shoes-1',
    }],
    homesteads: [{
      spaceId: 5, owner: identity('player-1'), ownerName: 'Toby',
      overworldTileX: 20, overworldTileY: 21, sizeTier: 1, accessMode: 'private',
    }],
  };
  const source: StudioRowsProjectionSource = {
    worldPlaceable: table(() => data.placeables),
    worldCombatTarget: table(() => data.combatTargets),
    worldResource: table(() => data.resources),
    worldSurface: table(() => data.surfaces),
    worldNpc: table(() => data.npcs),
    worldWildlifeProfile: table(() => data.wildlife),
    playerPosition: table(() => data.positions),
    playerPublic: table(() => data.profiles),
    playerAppearance: table(() => data.appearances),
    homestead: table(() => data.homesteads),
  };
  return { data, source };
}

describe('StudioRowsProjection', () => {
  it('does not rescan 5,981 resources for a placeable event and retains unchanged arrays', () => {
    const { data, source } = fixture(5_981);
    const projection = new StudioRowsProjection();
    expect(projection.refresh(source)).toBe(true);
    const before = projection.rows();
    const resources = before.resources;
    expect(resources).toHaveLength(5_981);
    expect(projection.scanCounts()).toMatchObject({ resources: 1, placeables: 1 });

    data.placeables = data.placeables.map((row) => ({ ...row, processStartTick: 42n }));
    projection.mark('placeables');
    expect(projection.refresh(source)).toBe(true);
    expect(projection.rows()).not.toBe(before);
    expect(projection.rows().resources).toBe(resources);
    expect(projection.rows().placeables[0]).toMatchObject({ processStartTick: 42n });
    expect(projection.rows().placeables[0]).toMatchObject({
      definitionId: 'object:fruit_press',
      state: { batch: 2, open: false, lit: false, facing: 'down' },
    });
    expect(projection.scanCounts()).toMatchObject({ resources: 1, placeables: 2 });
  });

  it('returns no semantic change for SDK row replacement and therefore requires no repaint', () => {
    const { data, source } = fixture();
    const projection = new StudioRowsProjection();
    projection.refresh(source);
    const rows = projection.rows();
    const placeables = rows.placeables;

    data.placeables = data.placeables.map((row) => ({ ...row }));
    projection.mark('placeables');
    expect(projection.refresh(source)).toBe(false);
    expect(projection.rows()).toBe(rows);
    expect(projection.rows().placeables).toBe(placeables);
    expect(projection.scanCounts()).toMatchObject({ resources: 1, placeables: 2 });
  });

  it('fails malformed authored state soft and still projects exact core state fields', () => {
    const { data, source } = fixture();
    data.placeables = data.placeables.map((row) => ({ ...row, stateJson: 'not json' }));
    const projection = new StudioRowsProjection();
    expect(projection.refresh(source)).toBe(true);
    expect(projection.rows().placeables[0]).toMatchObject({
      definitionId: 'object:fruit_press',
      state: { open: false, lit: false, facing: 'down' },
    });
  });

  it('rescans only the dynamic collection affected by a cached profile dependency', () => {
    const { data, source } = fixture();
    const projection = new StudioRowsProjection();
    projection.refresh(source);
    const resources = projection.rows().resources;
    const players = projection.rows().players;

    data.wildlife = [{ ...data.wildlife[0]!, species: 'stag' }];
    projection.mark('wildlife_profiles');
    expect(projection.refresh(source)).toBe(true);
    expect(projection.rows().npcs[0]).toMatchObject({ species: 'stag' });
    expect(projection.rows().npcs[0]).toMatchObject({
      homeX: 48, homeY: 64, riderIdentity: undefined,
    });
    expect(projection.rows().players).toBe(players);
    expect(projection.rows().resources).toBe(resources);
    expect(projection.scanCounts()).toMatchObject({
      wildlife_profiles: 2, npcs: 2, player_positions: 1, resources: 1,
    });

    const npcs = projection.rows().npcs;
    data.appearances = [{ ...data.appearances[0]!, hairKind: 'hair-2' }];
    projection.mark('player_appearances');
    expect(projection.refresh(source)).toBe(true);
    expect(projection.rows().players[0]?.appearance).toMatchObject({ hairKind: 'hair-2' });
    expect(projection.rows().npcs).toBe(npcs);
    expect(projection.rows().resources).toBe(resources);
    expect(projection.scanCounts()).toMatchObject({
      player_appearances: 2, player_positions: 2, wildlife_profiles: 2, npcs: 2, resources: 1,
    });
  });
});
