import { beforeAll, describe, expect, it } from 'vitest';
import {
  CombatRegionPolicy, collisionCellIndex, collisionTileIsBlocked, collisionTileIsBlockedAtPlane, findPlayerJumpLanding,
  movementPositionAllowed, positionCollides, positionCollidesOnlyHorseJumpableTerrain, projectileTraversalCollision, runtimeActorCollision,
  runtimePlaceableBlocksMovement, traversalSolidGeometry,
  terrainPlaneAtPosition, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID,
  type CollisionMap, type CollisionObstacle, type ContentRegistry,
} from '@orchard/sim';
import { buildChunkWindowCollision, composeChunkWindowCollision, type ChunkCollisionRect, type ChunkWindowCollision } from '@orchard/sim/chunk-collision';
import { WORLD_CHUNK_SIZE, WORLD_CHUNK_VOID } from '@orchard/sim/world-chunk';
import { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import { buildChunkTerrainWindow, chunkWindowPinBounds } from '@orchard/engine/chunk-terrain-window';
import { prepareLightTerrainOcclusion } from '@orchard/engine/light-occlusion';
import { clientLiveRowObstacles, type CollisionWorldPlaceable } from '@orchard/engine/collision';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { composeChunkIslandCollision } from '../packages/world/src/content/chunk-authority-runtime.js';
import {
  chunkRuntimeParityFixture, liveBaseObstacles, liveRowsFixture, type ChunkRuntimeParityFixture, type LiveRowsFixture,
} from './world-chunk-runtime-parity.js';

/**
 * Static world S4d: the client's chunk-native collision (mode `on`) against the
 * server. For windows tiling all 169 chunks (corners, edges, centre), the
 * client's window collision, built from the published chunks resident in a
 * BoundedChunkTerrainStore, must answer every cell exactly as the real server
 * composition (`liveMapCollisionForSpace` over the compiled runtime, with live
 * resource, chest and placeable rows) and the S1b assembled chunk runtime
 * (`composeChunkIslandCollision`) do: flat ground and water blocking, every
 * terrain plane, elevation, horse-jump, traversal media, the ordered obstacle
 * list (suppression and finding B included), transitions, combat regions and
 * generated suppressions. Movement, jumps and boats agree at sampled positions.
 * Tiles outside the window and cells of a missing chunk are blocked.
 */

const T = TILE_SIZE_FIXED;
/** Windows tiling the 13 x 13 chunk map: every chunk, the four corners and edges. */
export const TILING_WINDOWS: readonly ChunkCollisionRect[] = [0, 4, 8].flatMap(cy => [0, 4, 8].map(cx => ({ cx, cy, columns: 5, rows: 5 })));
/** SW-D1: boat-enterable in the authority water channel. */
export const WATERFALL = Array.from({ length: 15 }, (_, index) => ({ tileX: 414 + index % 3, tileY: 357 + Math.floor(index / 3) }));

interface ParityContext extends ChunkRuntimeParityFixture {
  readonly registry: ContentRegistry;
  readonly live: LiveRowsFixture;
  /** Client-shaped placeables standing in for the fixture's server placeable rows. */
  readonly clientPlaceables: readonly CollisionWorldPlaceable[];
  readonly server: ChunkRuntimeParityFixture['server'];
  readonly serverGround: CollisionMap;
  readonly serverWater: CollisionMap;
  readonly assembledGround: CollisionMap;
  readonly assembledWater: CollisionMap;
}

/** A blocking one-tile placeable and an open gate for the fixture's server rows. */
function clientPlaceablesFor(rows: LiveRowsFixture['rows']['placeables'], registry: ContentRegistry): CollisionWorldPlaceable[] {
  return rows.map(row => row.blocksMovement
    ? { kind: 'anvil', tileX: row.tileX, tileY: row.tileY, open: false }
    : { kind: 'fence_gate', tileX: row.tileX, tileY: row.tileY, open: true, stateJson: JSON.stringify({ open: true }) })
    .map(row => {
      if (runtimePlaceableBlocksMovement(registry, row) !== rows.find(({ tileX, tileY }) => tileX === row.tileX && tileY === row.tileY)!.blocksMovement) {
        throw new Error(`Placeable stand-in ${row.kind} no longer matches its server row`);
      }
      return row;
    });
}

function windowStore(published: ChunkRuntimeParityFixture['published'], blobs: ReadonlyMap<string, Uint8Array>, rect: ChunkCollisionRect,
  skip: ReadonlySet<string> = new Set()): BoundedChunkTerrainStore {
  const store = new BoundedChunkTerrainStore(published.manifest);
  store.pinView(...chunkWindowPinBounds(rect));
  for (const key of store.pinnedKeys) {
    if (skip.has(key)) continue;
    const [cx, cy] = key.split(':').map(Number) as [number, number];
    const head = published.manifest.chunks.find(candidate => candidate.cx === cx && candidate.cy === cy)!;
    store.install(blobs.get(head.contentHash)!, cx, cy);
  }
  return store;
}

const anchor = (obstacle: CollisionObstacle): string =>
  `${Math.floor(Math.floor(obstacle.left / T) / WORLD_CHUNK_SIZE)}:${Math.floor(Math.floor(obstacle.top / T) / WORLD_CHUNK_SIZE)}`;

/** The client window's composed ground and water for the fixture's live rows. */
function clientWindow(context: ParityContext, store: BoundedChunkTerrainStore, rect: ChunkCollisionRect): {
  readonly collision: ChunkWindowCollision; readonly ground: CollisionMap; readonly water: CollisionMap;
} {
  const collision = buildChunkWindowCollision(store, rect);
  const live = clientLiveRowObstacles(context.live.rows.resources, context.live.rows.chests, context.clientPlaceables,
    collision.generatedSuppressions, context.registry);
  return { collision,
    ground: composeChunkWindowCollision(collision, 'ground', live.entries.filter(({ furniture }) => !furniture).map(({ obstacle }) => obstacle)),
    water: composeChunkWindowCollision(collision, 'water') };
}

/** Every cell of the window against a whole-map reference (the server or the assembled runtime). */
function expectCellsEqual(label: string, client: { ground: CollisionMap; water: CollisionMap }, reference: { ground: CollisionMap; water: CollisionMap },
  collision: ChunkWindowCollision, skip: ReadonlySet<string> = new Set()): number {
  const { ground, water } = client, whole = reference.ground.width * reference.ground.height, local = ground.width * ground.height;
  const planes = reference.ground.terrainPlaneBlocked!.length / whole;
  expect(ground.terrainPlaneBlocked!.length / local, `${label} planes`).toBe(planes);
  expect(ground.terrainMinimumElevation, `${label} minimum elevation`).toBe(reference.ground.terrainMinimumElevation);
  expect(ground.traversalChannels === undefined, `${label} traversal channels`).toBe(reference.ground.traversalChannels === undefined);
  expect(water.traversalChannels === undefined, `${label} water traversal channels`).toBe(reference.water.traversalChannels === undefined);
  let cells = 0;
  const mismatches: string[] = [];
  for (let tileY = collision.originY; tileY < collision.originY + collision.height; tileY++) {
    for (let tileX = collision.originX; tileX < collision.originX + collision.width; tileX++) {
      if (skip.has(`${Math.floor(tileX / WORLD_CHUNK_SIZE)}:${Math.floor(tileY / WORLD_CHUNK_SIZE)}`)) continue;
      const index = tileY * reference.ground.width + tileX, cell = collisionCellIndex(ground, tileX, tileY);
      const differs = ground.blocked[cell] !== reference.ground.blocked[index]
        || water.blocked[cell] !== reference.water.blocked[index]
        || ground.elevations![cell] !== reference.ground.elevations![index]
        || ground.horseJumpableTerrain![cell] !== reference.ground.horseJumpableTerrain![index]
        || water.horseJumpableTerrain![cell] !== reference.water.horseJumpableTerrain![index]
        || (reference.ground.traversalChannels !== undefined && (ground.traversalChannels!.medium[cell] !== reference.ground.traversalChannels.medium[index]
          || ground.traversalChannels!.solidBlocked[cell] !== reference.ground.traversalChannels.solidBlocked[index]))
        || Array.from({ length: planes }, (_, plane) => plane).some(plane =>
          ground.terrainPlaneBlocked![plane * local + cell] !== reference.ground.terrainPlaneBlocked![plane * whole + index]);
      if (differs && mismatches.length < 8) mismatches.push(`${tileX},${tileY}`);
      cells++;
    }
  }
  expect(mismatches, `${label} cells`).toEqual([]);
  return cells;
}

/** The reference's obstacles and transitions anchored in the window's present chunks, in order. */
function expectRecordsEqual(label: string, client: { ground: CollisionMap; water: CollisionMap }, reference: { ground: CollisionMap; water: CollisionMap },
  collision: ChunkWindowCollision): void {
  for (const medium of ['ground', 'water'] as const) {
    const inside = (obstacle: CollisionObstacle) => collision.present.has(anchor(obstacle));
    expect(client[medium].obstacles!.filter(inside), `${label} ${medium} obstacles`).toEqual(reference[medium].obstacles!.filter(inside));
  }
  const transitionInside = (transition: { lowerTileX: number; lowerTileY: number }) =>
    collision.present.has(`${Math.floor(transition.lowerTileX / WORLD_CHUNK_SIZE)}:${Math.floor(transition.lowerTileY / WORLD_CHUNK_SIZE)}`);
  expect(client.ground.terrainTransitions, `${label} transitions`).toEqual(reference.ground.terrainTransitions!.filter(transitionInside));
}

/** Only the obstacles near the window: the same answers for interior positions, far fewer boxes to scan. */
function nearWindow(map: CollisionMap, collision: ChunkWindowCollision): CollisionMap {
  const left = (collision.originX - 8) * T, top = (collision.originY - 8) * T;
  const right = (collision.originX + collision.width + 8) * T, bottom = (collision.originY + collision.height + 8) * T;
  return { ...map, obstacles: (map.obstacles ?? []).filter(box => box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom) };
}

/** Movement, jumps, horse-jump terrain and boats at sampled positions inside the window (away from its edge). */
function expectMovementEqual(label: string, client: { ground: CollisionMap; water: CollisionMap }, reference: { ground: CollisionMap; water: CollisionMap },
  collision: ChunkWindowCollision, mapWidth: number, mapHeight: number): number {
  const ground = nearWindow(reference.ground, collision), water = nearWindow(reference.water, collision);
  const inset = (origin: number, size: number, map: number) => [origin === 0 ? 1 : origin + 12, origin + size >= map ? map - 2 : origin + size - 12] as const;
  const [minX, maxX] = inset(collision.originX, collision.width, mapWidth), [minY, maxY] = inset(collision.originY, collision.height, mapHeight);
  const mismatches: string[] = [];
  let samples = 0;
  for (let tileY = minY; tileY <= maxY; tileY += 6) for (let tileX = minX; tileX <= maxX; tileX += 6) {
    for (const [dx, dy] of [[8, 15], [3, 9]] as const) {
      const position = { x: tileX * T + dx * 16, y: tileY * T + dy * 16 + 1 };
      const same = terrainPlaneAtPosition(position, client.ground) === terrainPlaneAtPosition(position, ground)
        && positionCollides(position, client.ground) === positionCollides(position, ground)
        && positionCollides(position, client.water) === positionCollides(position, water)
        && positionCollidesOnlyHorseJumpableTerrain(position, client.ground) === positionCollidesOnlyHorseJumpableTerrain(position, ground)
        && [[T / 2, 0], [-T / 2, 0], [0, T / 2], [0, -T / 2]].every(([mx, my]) => {
          const to = { x: position.x + mx!, y: position.y + my! };
          return movementPositionAllowed(position, to, client.ground) === movementPositionAllowed(position, to, ground)
            && movementPositionAllowed(position, to, client.water) === movementPositionAllowed(position, to, water);
        })
        && JSON.stringify(findPlayerJumpLanding(position, 'right', client.ground, 2, 2)) === JSON.stringify(findPlayerJumpLanding(position, 'right', ground, 2, 2));
      if (!same && mismatches.length < 8) mismatches.push(`${position.x},${position.y}`);
      samples++;
    }
  }
  expect(mismatches, `${label} movement`).toEqual([]);
  return samples;
}

export function describeChunkCollisionParity(label: string, setup: () => { readonly row: LiveMapDocumentRow; readonly registry: ContentRegistry },
  extra?: (context: () => ParityContext) => void): void {
  describe(`client chunk collision parity (static world S4d): ${label}`, () => {
    let context: ParityContext;
    beforeAll(() => {
      const { row, registry } = setup();
      const fixture = chunkRuntimeParityFixture(row, registry);
      const live = liveRowsFixture(fixture.server, registry);
      const runtime = fixture.assemble();
      const assembled = (medium: 'ground' | 'water') => composeChunkIslandCollision(runtime, medium, liveBaseObstacles(registry, runtime, medium, live.rows).live);
      context = { ...fixture, registry, live, clientPlaceables: clientPlaceablesFor(live.rows.placeables, registry),
        serverGround: fixture.server.composeWithLiveRows('ground', fixture.server.runtime, live.rows),
        serverWater: fixture.server.composeWithLiveRows('water', fixture.server.runtime, live.rows),
        assembledGround: assembled('ground'), assembledWater: assembled('water') };
    }, 180_000);

    it('matches the server and the assembled runtime on every cell, record and movement of windows tiling all 169 chunks', () => {
      const { published, blobs, serverGround, serverWater, assembledGround, assembledWater } = context;
      const covered = new Set<string>();
      let cells = 0, samples = 0;
      for (const rect of TILING_WINDOWS) {
        const store = windowStore(published, blobs, rect);
        const client = clientWindow(context, store, rect);
        const name = `${label} window ${rect.cx}:${rect.cy}`;
        expect(client.collision.issues, name).toEqual([]);
        expect(client.collision.present.size, name).toBe(25);
        for (const key of client.collision.present) covered.add(key);
        cells += expectCellsEqual(`${name} vs server`, client, { ground: serverGround, water: serverWater }, client.collision);
        expectCellsEqual(`${name} vs assembled`, client, { ground: assembledGround, water: assembledWater }, client.collision);
        expectRecordsEqual(`${name} vs server`, client, { ground: serverGround, water: serverWater }, client.collision);
        expectRecordsEqual(`${name} vs assembled`, client, { ground: assembledGround, water: assembledWater }, client.collision);
        samples += expectMovementEqual(name, client, { ground: serverGround, water: serverWater }, client.collision, published.manifest.width, published.manifest.height);
      }
      expect(covered.size).toBe(169);
      expect(cells).toBeGreaterThan(9 * 300 * 300);
      console.info(`[S4d] ${label}: ${cells} cells and ${samples} movement samples match the server over ${TILING_WINDOWS.length} windows`);
    }, 600_000);

    it('carries the manifest combat regions and generated suppressions, and applies finding B to live rows', () => {
      const { published, blobs, server, live } = context;
      const rect = { cx: 4, cy: 4, columns: 5, rows: 5 };
      const client = clientWindow(context, windowStore(published, blobs, rect), rect);
      expect([...client.collision.generatedSuppressions].sort()).toEqual([...server.generatedSuppressions].sort());
      expect(client.collision.combatRegions).toEqual(server.combatRegions);
      const policy = new CombatRegionPolicy(client.collision.combatRegions);
      for (let tileY = 0; tileY < published.manifest.height; tileY += 7) for (let tileX = 0; tileX < published.manifest.width; tileX += 7) {
        const at = { spaceId: TOPSIDE_SPACE_ID, tileX, tileY };
        expect(policy.regionAt(at)?.id).toBe(server.combatPolicy.regionAt(at)?.id);
      }
      // Suppressed live boxes are dropped wherever the client holds their key; kept ones stay.
      const keys = client.collision.suppressedObstacleKeys.ground;
      // The retained base part precedes the authored group (landmarks re-author some suppressed boxes).
      const retained = client.ground.obstacles!.slice(0, client.ground.obstacles!.length - (client.collision.ground.obstacles?.length ?? 0));
      const composed = new Set(retained.map(box => `${box.left}:${box.top}:${box.right}:${box.bottom}`));
      let dropped = 0;
      for (const box of live.suppressedLiveBoxes) {
        const key = `${box.left}:${box.top}:${box.right}:${box.bottom}`;
        if (!keys.has(key)) continue;
        expect(composed.has(key), key).toBe(false);
        dropped++;
      }
      expect(dropped, 'finding B is exercised inside this window').toBeGreaterThan(0);
      for (const box of live.keptLiveBoxes) expect(composed.has(`${box.left}:${box.top}:${box.right}:${box.bottom}`)).toBe(true);
    }, 120_000);

    it('lets a boat onto the 15 waterfall cells exactly as the server (SW-D1)', () => {
      const { published, blobs, serverWater } = context;
      const rect = { cx: 4, cy: 4, columns: 5, rows: 5 };
      const client = clientWindow(context, windowStore(published, blobs, rect), rect);
      for (const { tileX, tileY } of WATERFALL) {
        expect(collisionTileIsBlocked(client.water, tileX, tileY), `${tileX},${tileY}`).toBe(false);
        expect(serverWater.blocked[tileY * serverWater.width + tileX], `${tileX},${tileY}`).toBe(false);
      }
    }, 120_000);

    it('blocks every cell of a missing window chunk and every tile outside the window', () => {
      // Window 4:4 is the island (tiles 256-575); the ring outside it is open ocean for boats.
      const { published, blobs, serverGround, serverWater } = context;
      const rect = { cx: 4, cy: 4, columns: 5, rows: 5 };
      const missing = new Set(['6:5']);
      const client = clientWindow(context, windowStore(published, blobs, rect, missing), rect);
      expect(client.collision.issues).toEqual([{ kind: 'chunk_missing', cx: 6, cy: 5 }]);
      let walkableOnServer = 0;
      for (let tileY = 5 * 64; tileY < 6 * 64; tileY++) for (let tileX = 6 * 64; tileX < 7 * 64; tileX++) {
        const cell = collisionCellIndex(client.ground, tileX, tileY);
        if (!client.ground.blocked[cell] || !client.water.blocked[cell] || client.ground.horseJumpableTerrain![cell]
          || (client.ground.traversalChannels !== undefined && (client.ground.traversalChannels.medium[cell] !== WORLD_CHUNK_VOID
            || client.ground.traversalChannels.solidBlocked[cell] !== 1))) throw new Error(`Missing-chunk cell ${tileX},${tileY} is not void and solid`);
        for (let plane = client.ground.terrainMinimumElevation ?? 0; plane < (client.ground.terrainMinimumElevation ?? 0) + 3; plane++) {
          if (!collisionTileIsBlockedAtPlane(client.ground, tileX, tileY, plane)) throw new Error(`Missing-chunk plane ${plane} at ${tileX},${tileY} is open`);
        }
        if (!serverGround.blocked[tileY * serverGround.width + tileX]) walkableOnServer++;
      }
      expect(walkableOnServer, 'the missing chunk is walkable on the server: the check is not vacuous').toBeGreaterThan(100);
      // The rest of the window is unchanged.
      expectCellsEqual('missing chunk window', client, { ground: serverGround, water: serverWater }, client.collision, missing);
      // Just outside the window: blocked even where the server lets a boat through.
      let outsideOpen = 0;
      const { originX, originY, width, height } = client.collision;
      for (let tileX = originX - 1; tileX <= originX + width; tileX++) for (const tileY of [originY - 1, originY + height]) {
        expect(collisionTileIsBlocked(client.ground, tileX, tileY)).toBe(true);
        expect(collisionTileIsBlocked(client.water, tileX, tileY)).toBe(true);
        if (!serverWater.blocked[tileY * serverWater.width + tileX]) outsideOpen++;
      }
      expect(outsideOpen, 'the ring outside the window is open water on the server').toBeGreaterThan(100);
    }, 120_000);

    it('rebuilds window collision within the 8 ms p95 budget when the window moves (timing is reported)', () => {
      const { published, blobs, registry } = context;
      // A walk across the island: each step moves the window one chunk, as the camera does.
      const rects: ChunkCollisionRect[] = [];
      for (let cy = 2; cy <= 6; cy++) for (let cx = 2; cx <= 6; cx++) rects.push({ cx: cy % 2 === 0 ? cx : 8 - cx, cy, columns: 5, rows: 5 });
      const stores = rects.map(rect => windowStore(published, blobs, rect));
      const stages = { window: [] as number[], collision: [] as number[], compose: [] as number[], traversal: [] as number[], light: [] as number[], total: [] as number[] };
      for (let round = 0; round < 3; round++) rects.forEach((rect, index) => {
        const store = stores[index]!;
        const t0 = performance.now();
        const window = buildChunkTerrainWindow(store, rect);
        const t1 = performance.now();
        const collision = buildChunkWindowCollision(store, rect);
        const t2 = performance.now();
        const live = clientLiveRowObstacles(context.live.rows.resources, context.live.rows.chests, context.clientPlaceables, collision.generatedSuppressions, registry);
        const ground = composeChunkWindowCollision(collision, 'ground', live.entries.filter(({ furniture }) => !furniture).map(({ obstacle }) => obstacle));
        const water = composeChunkWindowCollision(collision, 'water');
        const t3 = performance.now();
        const solid = traversalSolidGeometry(ground, water);
        const walking = runtimeActorCollision(registry, ground, { kind: 'placement', medium: 'ground' }, 0n, solid);
        const boat = runtimeActorCollision(registry, water, { kind: 'placement', medium: 'water' }, 0n, solid);
        runtimeActorCollision(registry, projectileTraversalCollision(walking, boat), { kind: 'projectile' }, 0n, traversalSolidGeometry(walking, boat));
        const t4 = performance.now();
        prepareLightTerrainOcclusion(window.terrain);
        const t5 = performance.now();
        if (round === 0) return; // warm-up
        stages.window.push(t1 - t0); stages.collision.push(t2 - t1); stages.compose.push(t3 - t2);
        stages.traversal.push(t4 - t3); stages.light.push(t5 - t4); stages.total.push(t5 - t0);
      });
      const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))]!;
      const report = Object.entries(stages).map(([stage, values]) => `${stage} p50 ${percentile(values, 0.5).toFixed(2)} / p95 ${percentile(values, 0.95).toFixed(2)} ms`);
      console.info(`[S4d] ${label} window-move rebuild over ${stages.total.length} moves: ${report.join('; ')}`);
      // Loose bound only (the shared host is noisy); the measured figures go in the PR.
      expect(percentile(stages.total, 0.5)).toBeLessThan(200);
    }, 300_000);

    extra?.(() => context);
  });
}
