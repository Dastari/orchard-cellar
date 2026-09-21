import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { stableAssetId } from './assets/asset-id.js';
import { CombatRegionPolicy, createLiveIslandMapDocument, compileMapDocument, terrainDocumentForMapV3,
  collisionMapForCompiledMapDocument, mapObjectCollisionCells, mapCollisionAtPlane, HEARTH_RESOURCE_SITES,
  bootstrapContentRegistry, runtimeHearthSupplyCache, hearthSupplyCacheInstalled, hearthSupplyCacheApproachClear, hearthFerryLanding,
  runtimeHearthFerryNetwork, HEARTH_ENCOUNTERS, hearthResourceInstallationGeometry,
  hearthResourceInstallationRoutes, positionCollides, TILE_SIZE_FIXED, type CollisionObstacle } from '@orchard/sim';
import {HEARTH_CINDER_NATIVE_BASES,HEARTH_CINDER_SCENERY_PLACEMENTS} from './hearth-cinder-scenery.js';
import {composeHearthContentMap} from './hearth-map-composition.js';
const assetFor = (name: string) => {
  const category = name.startsWith('building_') ? 'buildings' : name.startsWith('tree_') ? 'trees' : name.startsWith('crop_') ? 'crops' : name.startsWith('wildlife_') ? 'characters' : 'props';
  const source = JSON.parse(readFileSync(new URL(`../../assets/${category}/${name}.sprite.json`, import.meta.url), 'utf8')) as { size: [number,number]; anchor: [number,number] };
  return { id: stableAssetId(name), width: source.size[0], height: source.size[1], anchor: source.anchor };
};
const result = composeHearthContentMap(createLiveIslandMapDocument(), assetFor, 'source-fixture');
if (result.document === null) throw new Error(result.conflicts.join(','));
const document = result.document, compiled = compileMapDocument(terrainDocumentForMapV3(document));
const supplyCache=runtimeHearthSupplyCache(bootstrapContentRegistry());
if(supplyCache===null)throw new Error('missing authored supply cache');
const base = collisionMapForCompiledMapDocument(compiled), obstacles: CollisionObstacle[] = [];
const cells = document.objects.flatMap(object => mapObjectCollisionCells(document, object));
for (const cell of cells) for (let bit = 0; bit < 16; bit++) {
  if ((cell.collisionMask & (1 << bit)) === 0) continue;
  const left = cell.tileX * TILE_SIZE_FIXED + bit % 4 * TILE_SIZE_FIXED / 4;
  const top = cell.tileY * TILE_SIZE_FIXED + Math.floor(bit / 4) * TILE_SIZE_FIXED / 4;
  obstacles.push({ left, top, right: left + TILE_SIZE_FIXED / 4 - 1, bottom: top + TILE_SIZE_FIXED / 4 - 1 });
}
const collision = { ...base, obstacles: [...(base.obstacles ?? []), ...obstacles] };
it('keeps every complete Cinder foundation on open terrain at its authored elevation', () => {
  expect(result.conflicts).toEqual([]);
  const objects = document.objects.filter(object => object.id.startsWith('hearth-cinder-'));
  expect(objects).toHaveLength(22);
  for (const object of objects.filter(row => row.id !== 'hearth-cinder-ferry-boat')) for (const cell of mapObjectCollisionCells(document, object)) {
    expect(compiled.elevations[cell.tileY * compiled.width + cell.tileX], object.id).toBe(object.elevation);
    expect(mapCollisionAtPlane(compiled, cell.tileX, cell.tileY, object.elevation), object.id).toBe('open');
  }
  expect(HEARTH_CINDER_SCENERY_PLACEMENTS.filter(row => row.asset.includes('blossom'))).toHaveLength(2);
});
it('preserves all six harvest rings and bidirectional safe-arrival routes with scenery and node bases combined', () => {
  const ids = HEARTH_RESOURCE_SITES.map(site => site.id);
  const combined = hearthResourceInstallationGeometry(collision, ids);
  expect(combined).not.toBeNull();
  expect(hearthResourceInstallationRoutes(combined!, ids, { x: 652.5 * TILE_SIZE_FIXED, y: 211.5 * TILE_SIZE_FIXED }, {
    spaceId: 0, regions: document.combatRegions ?? [],
  })).toBe(true);
  for (const camp of HEARTH_ENCOUNTERS) for (const member of camp.members) {
    expect(positionCollides({ x: (member.tileX + .5) * TILE_SIZE_FIXED, y: (member.tileY + .5) * TILE_SIZE_FIXED }, combined!), camp.id).toBe(false);
  }
}, 30_000);

it('covers the native anchored bottom-six-row width including eastern pillar and tower feet', () => {
  for (const [name, bounds] of Object.entries(HEARTH_CINDER_NATIVE_BASES)) {
    const category = name.startsWith('building_') ? 'buildings' : 'props';
    const source = JSON.parse(readFileSync(new URL(`../../assets/${category}/${name}.sprite.json`, import.meta.url), 'utf8')) as {
      anchor: [number, number]; frames: { base: string[][] }; sourcePalette: Record<string, string> };
    const xs: number[] = [];
    for (let y = source.anchor[1] - 5; y <= source.anchor[1]; y++) {
      for (const [x, key] of [...source.frames.base[0]![y]!].entries()) {
        if (key !== '.' && source.sourcePalette[key]?.length === 7) xs.push(x);
      }
    }
    expect(Math.min(...xs), name).toBe(bounds.left);
    expect(Math.max(...xs), name).toBe(bounds.right);
    for (const placement of HEARTH_CINDER_SCENERY_PLACEMENTS.filter(row => row.asset === name)) {
      const object = document.objects.find(row => row.id === `hearth-cinder-${placement.id}`)!;
      const foundation = mapObjectCollisionCells(document, object);
      const occupied = (pixelX: number, pixelY: number) => {
        const tileX = Math.floor(pixelX / 16), tileY = Math.floor(pixelY / 16);
        const bit = Math.floor((pixelY - tileY * 16) / 4) * 4 + Math.floor((pixelX - tileX * 16) / 4);
        return foundation.some(cell => cell.tileX === tileX && cell.tileY === tileY && (cell.collisionMask & (1 << bit)) !== 0);
      };
      const left = object.tileX * 16 + 8 - source.anchor[0] + bounds.left;
      const right = object.tileX * 16 + 8 - source.anchor[0] + bounds.right;
      const bottom = (object.tileY + 1) * 16;
      for (let x = left; x <= right; x++) for (let y = bottom - bounds.depth; y < bottom; y++) {
        expect(occupied(x, y), `${name} native foundation ${x},${y}`).toBe(true);
      }
      // Do not expand the conservative horizontal base to entire edge tiles.
      expect(occupied(Math.floor(left / 4) * 4 - 1, bottom - 1), name).toBe(false);
      expect(occupied((Math.floor(right / 4) + 1) * 4, bottom - 1), name).toBe(false);
      const prefab = document.prefabs.find(row => row.id === object.prefabId)!;
      expect(prefab.id).not.toContain('_');
      expect(prefab.width).toBe(name === 'building_cf_cinder_tower' ? 7 : name === 'prop_cf_cinder_broad_pillar' ? 3 : 2);
    }
  }
});

it('keeps the protected ferry return reachable and the moored boat seaward of the walkable quay', () => {
  const safe = (x: number, y: number) => x >= 634 && x <= 668 && y >= 192 && y <= 224;
  const cinderwake=runtimeHearthFerryNetwork(bootstrapContentRegistry())!.byId.get('cinderwake')!;
  expect(hearthFerryLanding(cinderwake, collision, safe)).toEqual({ tileX: 652, tileY: 211 });
  for (const [x, y] of [[642,211],[643,211],[644,211],[650,204]] as const) {
    expect(positionCollides({ x: (x + .5) * TILE_SIZE_FIXED, y: (y + .5) * TILE_SIZE_FIXED }, collision), `${x},${y}`).toBe(false);
  }
  // Test terrain without the boat's own obstacle: it cannot create fake land.
  expect(positionCollides({ x: 640.5 * TILE_SIZE_FIXED, y: 211.5 * TILE_SIZE_FIXED }, base)).toBe(true);
  // A foot centered directly south of the chest still overlaps its full-cell
  // body; the usable frontage is two rows south.
  expect(positionCollides({ x: 650.5 * TILE_SIZE_FIXED, y: 203.5 * TILE_SIZE_FIXED }, collision)).toBe(true);
  expect(hearthSupplyCacheInstalled(supplyCache,document)).toBe(true);
  expect(hearthSupplyCacheApproachClear(supplyCache,{ x: 650.5 * TILE_SIZE_FIXED, y: 204.5 * TILE_SIZE_FIXED }, collision)).toBe(true);
  const wall = { left: 650 * TILE_SIZE_FIXED, right: 651 * TILE_SIZE_FIXED - 1,
    top: 203 * TILE_SIZE_FIXED, bottom: 203 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 4 - 1 };
  expect(hearthSupplyCacheApproachClear(supplyCache,{ x: 650.5 * TILE_SIZE_FIXED, y: 204.5 * TILE_SIZE_FIXED },
    { ...collision, obstacles: [...collision.obstacles, wall] })).toBe(false);
  const cache = document.objects.find(row => row.id === 'hearth-cinder-supply-cache')!;
  expect(cache).toMatchObject({ tileX: 650, tileY: 202, elevation: 0, prefabId: 'hearth-prop-cf-chest' });
});

it('keeps four full-body lanes through each gate and ends paving on the protected side', () => {
  const policy = new CombatRegionPolicy(document.combatRegions ?? []);
  for (const [key, cell] of Object.entries(document.cells)) {
    const [tileX, tileY] = key.split(',').map(Number);
    if (tileX! < 608 || tileY! > 239 || cell.biome !== 'paving') continue;
    expect(policy.regionAt({ spaceId: 0, tileX: tileX! + .5, tileY: tileY! + .5 })?.policy, key).toBe('sanctuary');
  }

  for (let lane = 0; lane < 4; lane++) for (let pixel = 0; pixel <= 6 * 16; pixel++) {
    const north = { x: (664.5 + lane) * TILE_SIZE_FIXED, y: (190.5 + pixel / 16) * TILE_SIZE_FIXED };
    const east = { x: (666.5 + pixel / 16) * TILE_SIZE_FIXED, y: (205.5 + lane) * TILE_SIZE_FIXED };
    expect(positionCollides(north, collision), `north lane${lane} pixel${pixel}`).toBe(false);
    expect(positionCollides(east, collision), `east lane${lane} pixel${pixel}`).toBe(false);
  }
  for (let x = 664; x <= 667; x++) {
    expect(document.cells[`${x},192`]?.biome).toBe('paving');
    expect(document.cells[`${x},191`]?.biome).toBe('volcanic_ash');
  }
  for (let y = 205; y <= 208; y++) {
    expect(document.cells[`668,${y}`]?.biome).toBe('paving');
    expect(document.cells[`669,${y}`]?.biome).toBe('volcanic_ash');
  }
});
