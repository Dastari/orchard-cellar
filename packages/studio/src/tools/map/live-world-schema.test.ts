import { gameplayPainterAuditSource } from '../../../../lifecycle-authoring/src/gameplay-painter-audit.test-support.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const canvas = readFileSync(new URL('./canvas.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('./editor-controller.ts', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('./editor-renderer.ts', import.meta.url), 'utf8');
const mapRuntime = `${canvas}\n${controller}\n${renderer}`;
const shellConnection = readFileSync(new URL('../../shell/studio-connection.ts', import.meta.url), 'utf8');
const gameConnection = readFileSync(new URL('../../../../client/src/net/overworld-connection.ts', import.meta.url), 'utf8');
const game = gameplayPainterAuditSource();

describe('Map Editor live player-owned world state', () => {
  it('physically retires the unreachable second connection implementation', () => {
    expect(existsSync(new URL('./legacy-map-live-connection.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('./legacy-map-editor.ts', import.meta.url))).toBe(false);
    const studioSources = readdirSync(new URL('../../', import.meta.url), { recursive: true })
      .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map((name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8'));
    expect(studioSources.filter((source) => source.includes('DbConnection.builder()'))).toEqual([shellConnection]);
  });

  it('subscribes once in the shell and projects its rows into the Map overlay', () => {
    for (const table of ['tables.homestead', 'tables.worldPlaceable', 'tables.worldCombatTarget', 'tables.worldResource', 'tables.worldSurface']) {
      expect(shellConnection).toContain(table);
    }
    expect(shellConnection).not.toContain('tables.worldChest');
    expect(shellConnection).toContain("row.definitionId === 'object:chest'");
    expect(shellConnection).toContain('tables.worldWildlifeProfile');
    expect(shellConnection).toContain('tables.playerAppearance');
    expect(mapRuntime).toContain("mapId === 'live-island' ? context.controller.liveAdapter()?.view() : undefined");
    expect(mapRuntime).toContain('const liveRows = liveView?.rows ?? null');
    expect(mapRuntime).toContain('liveRows?.homesteads');
    expect(mapRuntime).toContain('liveRows?.placeables');
  });

  it('keeps distant live state identifiable below object LOD and propagates committed rows to game clients', () => {
    expect(mapRuntime).toContain("entityKind: 'homestead'");
    expect(mapRuntime).toContain('model.isLayerVisible(marker.layer)');
    expect(mapRuntime).toContain("entityKind: 'chest'");
    expect(mapRuntime).toContain("entityKind: 'npc'");
    expect(mapRuntime).toContain("entityKind: 'player'");
    expect(gameConnection).toContain('connection.db.homestead.onUpdate');
    expect(gameConnection).toContain('this.homesteads.set(row.spaceId, row)');
    expect(game).toContain('homesteadTentPresentationTargets(activeSpaceDefinition, snapshot.homesteads)');
  });

  it('uses authoritative live resource rows when the world subscription is synchronized', () => {
    for (const [table, projection] of [
      ['worldCombatTarget', 'combat_targets'],
      ['worldResource', 'resources'],
      ['worldSurface', 'surfaces'],
    ]) {
      expect(shellConnection).toMatch(new RegExp(
        `\\[\\s*connection\\.db\\.${table}\\s*,\\s*['"]${projection}['"]\\s*\\]`,
      ));
    }
    expect(shellConnection).toContain('this.#rowsProjection.mark(projection)');
    expect(shellConnection).toContain("this.#refreshScheduler.mark('structural_rows')");
    expect(shellConnection).toContain('table.onUpdate(listener)');
    expect(shellConnection).toContain("scan('resources', source.worldResource)");
    expect(mapRuntime).toContain('liveRows?.resources');
  });

  it('requires explicit authenticated shell connection', () => {
    expect(shellConnection).toContain('authentication_required');
    expect(shellConnection).toContain('connect(): void');
  });
});
