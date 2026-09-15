import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as sim from '@orchard/sim';
import { decodeDirection } from '../world-rules.js';
import { executeToolSwing } from './tool-swing.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function production(name: string, dependencies: Record<string, unknown>) {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing ${name}`);
  const code = ts.transpileModule(node.getText(source) + `\nreturn ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
}
const registry = sim.bootstrapContentRegistry();

function fixture(kind = 'axe') {
  let position = { x: 2048, y: 2048, facing: 'right', spaceId: 0, actionStartedTick: 1n };
  const slot = { itemKind: kind, durability: 1 };
  const npc = (id: bigint, dx: number, dy = 0) => ({ id, x: position.x + dx, y: position.y + dy, health: 10 });
  const npcs = [npc(1n, 180), npc(2n, 250, 180), npc(3n, -100), npc(4n, 400), npc(5n, 100, 250), npc(6n, 200, -40)];
  const empty = { by_chunk: { filter: () => [] } };
  const ctx = { sender: { toHexString: () => 'player' }, senderAuth: { jwt: null }, db: {
    membership: { identity: { find: () => null } },
    player_position: { identity: { find: () => position, update: (row: typeof position) => { position = row; } } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    world_clock: { id: { find: () => ({ authorityTick: 20n }) } },
    inventory_slot: { id: { find: () => slot } },
    world_npc: { by_chunk: { filter: () => npcs } },
    world_resource: empty, world_chest: empty, world_combat_target: empty, world_placeable: empty,
  } };
  const hits: bigint[] = [];
  const spend = vi.fn();
  const wear = vi.fn((_ctx: unknown, _slot: unknown, count: number) => {
    expect(slot.durability).toBe(1);
    slot.durability = Math.max(0, slot.durability - count);
  });
  const dependencies = {
    ...sim, parseDirection: decodeDirection, executeToolSwing, SenderError: Error,
    TOOL_SWING_RESISTANCE: new Set(['target_not_ready']),
    requireAuthorizedSender: vi.fn(), requireUsableTool: vi.fn(), handsOccupiedFor: () => false,
    mountedNpcFor: () => null, contentRegistry: () => registry,
    collisionForSpace: () => ({ obstacles: [] }), combatElevationAt: () => 0,
    combatSegmentObstructed: (_a: unknown, point: { y: number }) => point.y < position.y,
    validateToolVigourSpend: vi.fn(), spendToolVigour: spend, wearInventoryTool: wear,
    nextActionStartedTick: (_old: bigint, tick: bigint) => tick, recordPlayerStatistic: vi.fn(),
    applySwordMeleeLifecycle: (_ctx: unknown, target: { id: bigint }, write: boolean, contact: unknown) => {
      expect(contact).toEqual({ prepaid: true });
      if (write) { expect(slot.durability).toBe(1); hits.push(target.id); }
    },
  };
  return { ctx, slot, hits, spend, wear, dependencies, position: () => position };
}

describe('production server swing discovery', () => {
  it('hits all forward contacts, excludes rear/outside/terrain-blocked contacts, and charges once before deferred wear', () => {
    const f = fixture();
    production('applyToolSwingLifecycle', f.dependencies)(f.ctx);
    expect(f.hits).toEqual([1n, 2n]);
    expect(f.spend).toHaveBeenCalledTimes(1);
    expect(f.wear).toHaveBeenCalledExactlyOnceWith(f.ctx, f.slot, 2);
    expect(f.slot.durability).toBe(0);
    expect(f.position()).toMatchObject({ facing: 'right', actionKind: 'swing_axe', actionStartedTick: 20n });
  });
  it('continues across mixed contacts when a resource resists, wearing once per contact', () => {
    const f = fixture();
    const resource = { id: 7n, tileX: 8, tileY: 8, spaceId: 0, depleted: false };
    const placeable = { id: 8n, tileX: 8, tileY: 8 };
    const ctx = { ...f.ctx, db: { ...f.ctx.db,
      world_resource: { by_chunk: { filter: () => [resource] } },
      world_placeable: { by_chunk: { filter: () => [placeable] }, id: { find: () => placeable } },
    } };
    const placedHit = vi.fn();
    production('applyToolSwingLifecycle', { ...f.dependencies,
      TOOL_SWING_RESISTANCE: new Set(['wrong_tool']),
      runtimeResourceDefinition: () => ({}), liveMapGeneratedResourceSuppressed: () => false,
      runtimeResourceTargetVector: () => ({ x: 100, y: 0 }),
      playerInteractionOrigin: (point: unknown) => point,
      authoredHitsDamageable: () => ({}), genericChest: () => false,
      applyHarvestResourceLifecycle: () => { throw new Error('wrong_tool'); },
      applyHarvestPlaceableLifecycle: (_ctx: unknown, id: bigint, write: boolean) => { if (write) placedHit(id); },
    })(ctx);
    expect(f.hits).toEqual([1n, 2n]);
    expect(placedHit).toHaveBeenCalledExactlyOnceWith(8n);
    expect(f.spend).toHaveBeenCalledTimes(1);
    expect(f.wear).toHaveBeenCalledExactlyOnceWith(ctx, f.slot, 4);
  });
  it('uses the smaller pick arc and keeps preflight free of mutations', () => {
    const f = fixture('pickaxe');
    const apply = production('applyToolSwingLifecycle', f.dependencies);
    apply(f.ctx, false);
    expect(f.hits).toEqual([]);
    expect(f.spend).not.toHaveBeenCalled();
    expect(f.wear).not.toHaveBeenCalled();
    apply(f.ctx);
    expect(f.hits).toEqual([1n]);
    expect(f.wear).toHaveBeenCalledExactlyOnceWith(f.ctx, f.slot, 1);
  });
  it.each(['axe', 'pickaxe', 'hoe', 'sword'])('allows %s damage without a melee-weapon tag in a validated swing', kind => {
    const f = fixture(kind);
    const sheep = { id: 1n, kind: 'sheep', spaceId: 0, health: 10, x: 2048, y: 2048 };
    const ctx = { ...f.ctx, db: { ...f.ctx.db,
      world_npc: { id: { find: () => sheep } },
      world_wildlife_profile: { npcId: { find: () => ({ species: 'sheep' }) } },
      rogue_enemy_profile: { npcId: { find: () => null } },
      world_seed: { id: { find: () => ({ seed: 1 }) } },
    } };
    const damage = vi.fn();
    const apply = production('applySwordMeleeLifecycle', { ...f.dependencies,
      decodeDirection,
      outdoorEnemyDamageAllowed: () => false,
      advancePlayerStats: () => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
      activePlayerModifiers: () => [], activeCharacterCombatBalance: () => ({}),
      resolveStatsWithProfile: () => ({ attributes: { str: 10 } }),
      resolveCombatDamageWithProfile: (_profile: unknown, attack: { weaponBaseCenti: number }) => ({ damageCenti: attack.weaponBaseCenti, critical: false }),
      damageHuntableWildlife: damage,
    });
    apply(ctx, { kind: 'npc', id: 1n }, true, { prepaid: true });
    expect(damage).toHaveBeenCalledTimes(1);
    expect(damage.mock.calls[0]?.[3]).toBeGreaterThan(0);
    expect(f.spend).not.toHaveBeenCalled();
    expect(f.wear).not.toHaveBeenCalled();
  });
});
