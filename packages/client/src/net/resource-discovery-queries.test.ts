import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRegistry, instanceSpaceRowFor, runtimeResourcePerception,
  SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE, TILE_SIZE_FIXED,
} from '@orchard/sim';
import { tables } from '@orchard/world-bindings';
import { clientSpaceDefinition, spaceStreamingKey } from '../content/space-authority.js';
import {
  outsideRegionCenterDeadband, regionSubscriptionQueryCount,
  REGION_CENTER_DEADBAND_TILES, subscriptionChunkBounds, viewRadiusForViewport,
} from './overworld-connection.js';
import { resourceDiscoveryQueries, resourceDiscoveryRadii } from './resource-discovery-queries.js';

const registry = bootstrapContentRegistry();
const ownedRanks = { prospector: 1, ore_sense: 1, deep_ore_sense: 1, ore_identification: 1, ore_mapping: 1, seasoned_angler: 1, fishing_mapping: 1 };
const radii = resourceDiscoveryRadii(runtimeResourcePerception(registry, ownedRanks));

describe('resource-only discovery subscriptions', () => {
  it('uses actual SDK OR predicates only for enabled ore and fish resources in the same bounded space', () => {
    const [ore, fish] = resourceDiscoveryQueries(12, 20, 20, 832, radii, 8).map((query) => query.toSql());
    expect(ore).toContain('"space_id" = 12');
    expect(ore).toContain('"chunk_x" >= 15');
    expect(ore).toContain('"chunk_x" <= 25');
    expect(ore?.match(/"kind" = 'ore_/gu)).toHaveLength(10);
    expect(ore).toContain(' OR ');
    expect(fish).toContain('"kind" = \'fish_pool\'');
    for (const sql of [ore, fish]) {
      expect(sql).toContain('SELECT * FROM "world_resource"');
      expect(sql).not.toMatch(/tree_|world_npc|world_placeable/gu);
    }
  });

  it.each([0.5, 1, 2, 3, 6])('covers all 60 tiles through the center deadband at zoom %s without widening the viewport', (zoom) => {
    const original = viewRadiusForViewport(1280, 800, zoom);
    const queries = resourceDiscoveryQueries(0, 20, 20, 832, radii, REGION_CENTER_DEADBAND_TILES);
    expect(queries).toHaveLength(2);
    const sql = queries[0]!.toSql();
    const minimum = Number(sql.match(/"chunk_x" >= (\d+)/u)?.[1]) * SURVIVAL_CHUNK_TILES;
    const maximum = (Number(sql.match(/"chunk_x" <= (\d+)/u)?.[1]) + 1) * SURVIVAL_CHUNK_TILES - 1;
    for (let offset = 0; offset < SURVIVAL_CHUNK_TILES; offset += 1) {
      const start = 20 * SURVIVAL_CHUNK_TILES + offset;
      expect(minimum).toBeLessThanOrEqual(start - 8 - 60);
      expect(maximum).toBeGreaterThanOrEqual(start + 8 + 60);
    }
    expect(viewRadiusForViewport(1280, 800, zoom)).toEqual(original);
  });

  it('shrinks query membership from current server-owned ranks and clips world boundaries', () => {
    expect(resourceDiscoveryQueries(0, 0, 0, 32,
      resourceDiscoveryRadii(runtimeResourcePerception(registry, {})), 8)).toEqual([]);
    const fishOnly = resourceDiscoveryQueries(0, 0, 0, 32,
      resourceDiscoveryRadii(runtimeResourcePerception(registry, { seasoned_angler: 1, fishing_mapping: 1 })), 8);
    expect(fishOnly).toHaveLength(1);
    expect(fishOnly[0]!.toSql()).toContain('"chunk_x" >= 0');
    expect(fishOnly[0]!.toSql()).toContain('"chunk_x" <= 1');
    expect(fishOnly[0]!.toSql()).not.toContain("'ore_");
  });

  it('replaces discovery queries through the actual atomic region handover and counts both subscriptions', () => {
    const source = ts.createSourceFile('overworld-connection.ts', readFileSync(new URL('./overworld-connection.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    let method: ts.MethodDeclaration | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'subscribeRegion') method = node;
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (method?.body === undefined) throw new Error('region method missing');
    const javascript = ts.transpileModule(`function subscribeRegion(connection, position, force = false) ${method.body.getText(source)}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    type Handle = { sql: string[]; active: boolean; closed: boolean; apply: () => void; isActive: () => boolean; unsubscribe: () => void };
    const handles: Handle[] = [];
    const connection = { subscriptionBuilder: () => {
      let onApplied: (() => void) | undefined;
      const builder = {
        onApplied: (callback: () => void) => { onApplied = callback; return builder; },
        onError: () => builder,
        subscribe: (queries: readonly { toSql: () => string }[]) => {
          const handle: Handle = {
            sql: queries.map((query) => query.toSql()), active: false, closed: false,
            apply: () => { handle.active = true; onApplied?.(); },
            isActive: () => handle.active && !handle.closed,
            unsubscribe: () => { if (!handle.active) throw new Error('early unsubscribe'); handle.closed = true; },
          };
          handles.push(handle); return handle;
        },
      };
      return builder;
    } };
    const position = { spaceId: 0, x: 320 * TILE_SIZE_FIXED, y: 320 * TILE_SIZE_FIXED, chunkX: 20, chunkY: 20 };
    const state = {
      content: { state: { registry } }, skillNodes: Object.entries(ownedRanks).map(([nodeId, rank]) => ({ nodeId, rank })),
      rogueRun: null, homesteads: new Map(), viewRadius: { x: 2, y: 2 }, chunkRuntimeMode: 'off',
      subscribedSpaceId: 0, region: [0, 0], subscribedRadius: { x: 0, y: 0 },
      subscribedSpaceDefinitionKey: '', subscribedCenterTiles: null, pendingRegion: null,
      regionSubscription: null, regionAuxiliarySubscription: null,
      pendingRegionQueryCount: 0, activeRegionQueryCount: 0, handoverCount: 0, resourceRevisionValue: 0,
      subscribeCellarExcavations: () => undefined, updateChunkRuntime: () => undefined, ownPosition: () => position,
      currentConnection: (candidate: typeof connection) => candidate === connection,
      incoming: (candidate: typeof connection, fn: () => void) => { if (candidate === connection) fn(); },
      initialRegionHydrated: false, maybeGameplayReady: () => undefined, onChanged: () => undefined,
      subscribeRegion: (_connection: typeof connection, _position: typeof position, force = false) => { void force; },
    };
    const dependencies = {
      clientSpaceDefinition, spaceStreamingKey, instanceSpaceRowFor, runtimeResourcePerception,
      resourceDiscoveryRadii, resourceDiscoveryQueries, tables, TILE_SIZE_FIXED, SURVIVAL_WORLD_SIZE,
      SURVIVAL_CHUNK_TILES, REGION_CENTER_DEADBAND_TILES, TOPSIDE_SPACE_ID: 0,
      outsideRegionCenterDeadband, subscriptionChunkBounds, regionSubscriptionQueryCount,
    };
    const subscribe = new Function(...Object.keys(dependencies), `${javascript}; return subscribeRegion;`)(...Object.values(dependencies)) as (this: typeof state, conn: typeof connection, row: typeof position, force?: boolean) => void;
    state.subscribeRegion = (conn, row, force = false) => subscribe.call(state, conn, row, force);
    state.subscribeRegion(connection, position);
    expect(state.pendingRegionQueryCount).toBe(21);
    handles[0]!.apply(); handles[1]!.apply();
    expect(state.activeRegionQueryCount).toBe(21);
    expect(handles[1]!.sql.filter((sql) => sql.startsWith('SELECT * FROM "world_resource"'))).toHaveLength(3);
    state.skillNodes = [];
    state.subscribeRegion(connection, position, true);
    expect(state.pendingRegionQueryCount).toBe(19);
    expect(state.activeRegionQueryCount).toBe(21);
    expect(handles[1]!.closed).toBe(false);
    handles[2]!.apply(); handles[3]!.apply();
    expect(handles[1]!.closed).toBe(true);
    expect(state.activeRegionQueryCount).toBe(19);
    expect(state.pendingRegionQueryCount).toBe(0);
    expect(handles[3]!.sql.filter((sql) => sql.startsWith('SELECT * FROM "world_resource"'))).toHaveLength(1);
    expect(state.resourceRevisionValue).toBe(2);
  });
});
