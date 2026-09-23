import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STUDIO_LIVE_ISLAND_SPACE_ID,
  studioInitialSubscriptionQueries,
  studioLiveIslandSpatialQueries,
  studioSpaceSpatialQueries,
} from './studio-connection.js';

const bounds = { minimumX: 3, minimumY: 4, maximumX: 8, maximumY: 9 } as const;

describe('Studio live-map subscriptions', () => {
  it('subscribes every high-volume spatial projection to one bounded overworld rectangle', () => {
    expect(STUDIO_LIVE_ISLAND_SPACE_ID).toBe(0);
    const sql = studioLiveIslandSpatialQueries(bounds).map((query) => query.toSql());

    expect(sql).toHaveLength(7);
    const tables = [
      'world_placeable', 'world_combat_target', 'world_resource', 'world_surface',
      'world_npc', 'world_wildlife_profile', 'world_crop',
    ];
    expect(sql.map((query) => tables.find((table) => query.startsWith(`SELECT * FROM "${table}"`))))
      .toEqual(tables);
    for (const query of sql) {
      expect(query).toContain('"space_id" = 0');
      expect(query).toContain('"chunk_x" >= 3');
      expect(query).toContain('"chunk_x" <= 8');
      expect(query).toContain('"chunk_y" >= 4');
      expect(query).toContain('"chunk_y" <= 9');
    }
  });

  it('keeps the subscription boundary declarative and free of client-side table scans', () => {
    const source = studioSpaceSpatialQueries.toString();
    expect(source).not.toContain('.iter(');
    expect(source).not.toContain('.filter(');
    expect(source.match(/\.where\(/g)).toHaveLength(35);
  });

  it('keeps spatial rows out of the stable metadata subscription', () => {
    const sql = studioInitialSubscriptionQueries().map((query) => query.toSql());
    for (const table of [
      'world_placeable', 'world_combat_target', 'world_resource',
      'world_surface', 'world_npc', 'world_wildlife_profile', 'world_crop',
    ]) {
      const tableQueries = sql.filter((query) => query.startsWith(`SELECT * FROM "${table}"`));
      expect(tableQueries, table).toHaveLength(0);
    }
    expect(sql.filter((query) => query.startsWith('SELECT * FROM "player_position"'))).toEqual(['SELECT * FROM "player_position"']);
    expect(sql.some((query) => query.startsWith('SELECT * FROM "homestead"'))).toBe(true);
    expect(sql.some((query) => query.startsWith('SELECT * FROM "player_public"'))).toBe(true);
    expect(sql.some((query) => query.startsWith('SELECT * FROM "player_appearance"'))).toBe(true);
  });

  it('supports interior, residence and cellar viewports', () => {
    for (const spaceId of [65532, 20000, 20001]) {
      const sql = studioSpaceSpatialQueries(spaceId, bounds).map((query) => query.toSql());
      expect(sql.every((query) => query.includes(`"space_id" = ${spaceId}`))).toBe(true);
    }
    expect(() => studioSpaceSpatialQueries(65536, bounds)).toThrow('invalid_space_id');
  });

  it('invalidates stale lifecycle callbacks and only unsubscribes an active handle', () => {
    const source = readFileSync(new URL('./studio-connection.ts', import.meta.url), 'utf8');
    expect(source).toContain('const generation = ++this.#connectionGeneration;');
    expect(source).toContain('generation !== this.#connectionGeneration || connection !== this.#connection');
    expect(source).toContain('if (this.#subscription?.isActive()) this.#subscription.unsubscribe();');
  });
});
