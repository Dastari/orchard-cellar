import { describe, expect, it } from 'vitest';
import {CombatRegionPolicy,HEARTH_COMBAT_REGIONS,HEARTH_ISLANDS,PLAYER_HITBOX_FOOT_OFFSET,TILE_SIZE_FIXED,
  collisionMapForCompiledMapDocument,compileMapDocument,createLiveIslandMapDocument,
  mapCollisionAtPlane,movementPositionAllowed,parseMapDocumentV3,positionCollides,serializeMapDocumentV3,
  serializeMapDocumentV3ForTransport,survivalBiomeBlocksTraversal,terrainDocumentForMapV3} from '@orchard/sim';
import {WILLOWHARBOUR_PLOTS,buildHearthArchipelagoContribution,composeHearthArchipelago} from './hearth-archipelago-authoring.js';

describe('Hearth archipelago composition', () => {
  const contribution = buildHearthArchipelagoContribution();
  it('adds two bounded islands without writing any original-island cell', () => {
    const counts = { willowharbour: 0, cinderwake: 0 };
    for (const cell of Object.keys(contribution.cells)) {
      const [x,y] = cell.split(',').map(Number) as [number,number];
      expect(x < 256 || x > 575 || y < 256 || y > 575).toBe(true);
      for (const [id, island] of Object.entries(HEARTH_ISLANDS)) {
        if (x >= island.minX && x <= island.maxX && y >= island.minY && y <= island.maxY) counts[id as keyof typeof counts] += 1;
      }
    }
    expect(counts.willowharbour).toBeGreaterThan(10_000);
    expect(counts.cinderwake).toBeGreaterThan(20_000);
  });
  it('keeps arrival and every village door connected with all ten building plots reserved', () => {
    const walkable = (x: number, y: number): boolean => {
      const cell = contribution.cells[`${x},${y}`];
      return cell !== undefined && cell.surface !== 'water' && cell.collision !== 'force_block'
        && !WILLOWHARBOUR_PLOTS.some((plot) => x >= plot.minX && x <= plot.maxX && y >= plot.minY && y <= plot.maxY);
    };
    const start = HEARTH_ISLANDS.willowharbour.arrival;
    const seen = new Set([`${start.tileX},${start.tileY}`]);
    const queue = [[start.tileX as number,start.tileY as number]];
    for (let index = 0; index < queue.length; index += 1) {
      const [x,y] = queue[index]!;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x! + dx!; const ny = y! + dy!; const key = `${nx},${ny}`;
        if (!seen.has(key) && walkable(nx,ny)) { seen.add(key); queue.push([nx,ny]); }
      }
    }
    expect(WILLOWHARBOUR_PLOTS).toHaveLength(10);
    expect(WILLOWHARBOUR_PLOTS.filter(({ enterable }) => enterable)).toHaveLength(10);
    for (const plot of WILLOWHARBOUR_PLOTS) expect(seen.has(`${plot.door.tileX},${plot.door.tileY}`), plot.id).toBe(true);
    expect(seen.has('209,400')).toBe(true);
  });
  it('gives lava semantic ground and boat collision and protects the volcanic arrival', () => {
    const lava = Object.values(contribution.cells).filter(({ biome }) => biome === 'lava');
    expect(lava.length).toBeGreaterThan(100);
    expect(lava.every(({ collision, surface }) => collision === 'force_block' && surface !== 'water')).toBe(true);
    expect(survivalBiomeBlocksTraversal('lava','ground')).toBe(true);
    expect(survivalBiomeBlocksTraversal('lava','water')).toBe(true);
    const policy = new CombatRegionPolicy(HEARTH_COMBAT_REGIONS);
    expect(policy.allowsHostileDamage({ spaceId: 0, ...HEARTH_ISLANDS.cinderwake.arrival })).toBe(false);
    expect(policy.allowsHostileDamage({ spaceId: 0, tileX: 721, tileY: 117 })).toBe(true);
  });
  it('compiles walkable volcanic ramps with correct endpoints and a level guardian floor', () => {
    const map = compileMapDocument(terrainDocumentForMapV3(composeHearthArchipelago(createLiveIslandMapDocument()).document));
    for (const ramp of contribution.transitions) {
      const lower = ramp.lowerTileY * map.width + ramp.lowerTileX;
      const upper = ramp.upperTileY * map.width + ramp.upperTileX;
      expect(map.elevations[lower]).toBe(ramp.contourLevel - 1);
      expect(map.elevations[upper]).toBe(ramp.contourLevel);
      expect(mapCollisionAtPlane(map, ramp.lowerTileX, ramp.lowerTileY, ramp.contourLevel - 1)).toBe('transition');
      expect(mapCollisionAtPlane(map, ramp.upperTileX, ramp.upperTileY, ramp.contourLevel)).toBe('transition');
    }
    // Central combat floor stays flat; the irregular terrace shoulders sit outside it.
    for (let y = 108; y <= 130; y++) for (let x = 711; x <= 738; x++) {
      expect(mapCollisionAtPlane(map, x, y, 3), `${x},${y}`).toBe('open');
    }
    for (const island of Object.values(HEARTH_ISLANDS)) {
      expect(mapCollisionAtPlane(map, island.arrival.tileX, island.arrival.tileY, 0)).toBe('open');
    }
  }, 20_000);
  it('supports a player-sized outward and return route from the ferry across all terraces', () => {
    const compiled = compileMapDocument(terrainDocumentForMapV3(composeHearthArchipelago(createLiveIslandMapDocument()).document));
    const map = collisionMapForCompiledMapDocument(compiled);
    const island = HEARTH_ISLANDS.cinderwake;
    const at = (x: number, y: number) => ({ x: x * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: y * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1 });
    const edgeOpen = (x: number, y: number, nx: number, ny: number): boolean => {
      let previous = at(x,y);
      const end = at(nx,ny);
      if (positionCollides(end,map)) return false;
      for (let pixel = 1; pixel <= 16; pixel++) {
        const next = { x: at(x,y).x + (end.x-at(x,y).x)*pixel/16,
          y: at(x,y).y + (end.y-at(x,y).y)*pixel/16 };
        if (!movementPositionAllowed(previous,next,map)) return false;
        previous = next;
      }
      return true;
    };
    const start = [island.ferry.tileX as number,island.ferry.tileY as number] as const;
    expect(positionCollides(at(...start),map)).toBe(false);
    const queue: (readonly [number,number])[] = [start];
    const parent = new Map<string, readonly [number,number] | null>([[start.join(','),null]]);
    let reached = false;
    for (let i = 0; i < queue.length && !reached; i++) {
      const [x,y] = queue[i]!;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const nx = x+dx, ny = y+dy, key = `${nx},${ny}`;
        if (nx<island.minX || nx>island.maxX || ny<island.minY || ny>island.maxY
          || parent.has(key) || !edgeOpen(x,y,nx,ny)) continue;
        parent.set(key,[x,y]); queue.push([nx,ny]);
        if (nx===721 && ny===117) { reached=true; break; }
      }
    }
    expect(reached).toBe(true);
    let current: readonly [number,number] = [721,117];
    while (true) {
      const previous = parent.get(current.join(','));
      if (previous === null) break;
      if (previous === undefined) throw new Error('broken route');
      expect(edgeOpen(...current,...previous)).toBe(true);
      current = previous;
    }
  }, 30_000);
  it('refuses to compose onto an unrelated map or a different generation baseline', () => {
    const base=createLiveIslandMapDocument();
    expect(()=>composeHearthArchipelago({ ...base,id: 'unrelated' })).toThrow('hearth_requires_pinned_live_island');
    expect(()=>composeHearthArchipelago({ ...base,provenance: { ...base.provenance,generatorSeed: 1 } })).toThrow('hearth_requires_pinned_live_island');
  });
  it('preserves authored cells and old landmarks, reports conflicts, and survives canonical parsing', () => {
    const base = createLiveIslandMapDocument();
    const authored = { ...base, cells: { '400,400': { surface: 'dirt' as const }, '204,400': { elevation: 2 } } };
    const composed = composeHearthArchipelago(authored);
    expect(composed.document.cells['400,400']).toEqual(authored.cells['400,400']);
    expect(composed.document.cells['204,400']).toEqual({ elevation: 2 });
    expect(composed.conflictingCells).toEqual(['204,400']);
    expect(composed.document.landmarks).toBe(base.landmarks);
    expect(composed.document.provenance).toBe(base.provenance);
    const clean = composeHearthArchipelago(base);
    const encoded = serializeMapDocumentV3ForTransport(clean.document);
    expect(encoded.length).toBeLessThan(4_000_000);
    expect(parseMapDocumentV3(encoded).cells['721,117']?.biome).toBe('volcanic_ash');
    expect(serializeMapDocumentV3(parseMapDocumentV3(encoded))).toBe(serializeMapDocumentV3(clean.document));
    expect(composeHearthArchipelago(clean.document).conflictingCells).toEqual([]);
    expect(composeHearthArchipelago(clean.document).document.transitions).toEqual(clean.document.transitions);
  }, 20_000);
});
