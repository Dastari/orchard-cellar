import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as sim from '@orchard/sim';

const sourceText = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('index.ts', sourceText, ts.ScriptTarget.Latest, true);

function declaration(name: string): string {
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(source);
    if (!ts.isVariableStatement(node)) continue;
    for (const row of node.declarationList.declarations) {
      if (row.name.getText(source) !== name || !row.initializer || !ts.isCallExpression(row.initializer)) continue;
      const callback = row.initializer.arguments.find(ts.isArrowFunction);
      if (callback !== undefined) return `const ${name}=${callback.getText(source)};`;
    }
  }
  throw new Error(`missing production declaration:${name}`);
}

const bootstrap = sim.bootstrapContentRegistry();
const original = bootstrap.npcs.get('npc:willow_storekeeper')!;
const renamed = { ...original, id: 'npc:harbour_provisioner' as const };
const activeNpcs = new Map(bootstrap.npcs);
activeNpcs.delete(original.id);
activeNpcs.set(renamed.id, renamed);
const activeRegistry = { ...bootstrap, npcs: activeNpcs };

const npc = Object.freeze({
  id: BigInt(original.runtimeId),
  kind: original.runtimeKind ?? original.id.slice('npc:'.length),
  displayName: original.displayName,
  x: 0,
  y: 0,
  homeX: 0,
  homeY: 0,
  chunkX: 0,
  chunkY: 0,
  facing: 'down',
  moving: true,
  rider: undefined,
  wanderDirection: 'walk',
  nextDecisionTick: 1n,
  authorityTick: 1n,
  health: 100,
  spaceId: 0,
  lastHitCritical: false,
  panicUntilTick: undefined,
  panicSource: undefined,
  panicSourceX: 0,
  panicSourceY: 0,
});

function registryWithNpc(retired: boolean | 'missing') {
  const npcs = new Map(activeNpcs);
  if (retired === 'missing') npcs.delete(renamed.id);
  else npcs.set(renamed.id, { ...renamed, retired });
  return { ...activeRegistry, npcs };
}

describe('active NPC runtime authority', () => {
  it('resolves behaviour identity through active authored content without synthesizing a fallback id', () => {
    const code = ts.transpileModule(
      `${declaration('behaviourNpcSnapshot')}\n${declaration('resolvedBehaviourTarget')}\nreturn resolvedBehaviourTarget;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    let registry = activeRegistry;
    const resolve = new Function(
      'contentRegistry',
      'runtimeNpcDefinition',
      'TILE_SIZE_FIXED',
      code,
    )(
      () => registry,
      sim.runtimeNpcDefinition,
      sim.TILE_SIZE_FIXED,
    ) as (ctx: unknown, kind: string, id: bigint) => { ref: { definitionId: string } } | null;
    const ctx = { db: { world_npc: { id: { find: (id: bigint) => id === npc.id ? npc : null } } } };

    expect(resolve(ctx, 'npc', npc.id)?.ref.definitionId).toBe(renamed.id);
    registry = registryWithNpc(true);
    expect(resolve(ctx, 'npc', npc.id)).toBeNull();
    registry = registryWithNpc('missing');
    expect(resolve(ctx, 'npc', npc.id)).toBeNull();
    expect(sourceText).not.toContain("runtimeNpcDefinition(contentRegistry(ctx), npc)?.id ?? `npc:${npc.kind}`");
  });

  it('revalidates an open merchant session before consulting its shop dialogue', () => {
    const code = ts.transpileModule(
      `${declaration('activeMerchantSession')}\nreturn activeMerchantSession;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    let registry = activeRegistry;
    const dialogue = vi.fn(sim.runtimeDialogueDefinition);
    const session = new Function(
      'SenderError',
      'contentRegistry',
      'runtimeNpcDefinition',
      'runtimeDialogueDefinition',
      'npcWithinInteractionReach',
      code,
    )(
      Error,
      () => registry,
      sim.runtimeNpcDefinition,
      dialogue,
      () => true,
    ) as (ctx: unknown, requireShop: boolean) => { npc: typeof npc };
    const active = { npcId: npc.id, dialogueId: 'willow_storekeeper', nodeId: 'shop' };
    const ctx = { sender: 'player', db: {
      active_dialogue: { identity: { find: () => active } },
      player_position: { identity: { find: () => ({ spaceId: 0 }) } },
      world_merchant: { npcId: { find: () => ({ dialogueId: active.dialogueId }) } },
      world_npc: { id: { find: () => npc } },
    } };

    expect(session(ctx, true).npc).toBe(npc);
    dialogue.mockClear();
    registry = registryWithNpc(true);
    expect(() => session(ctx, true)).toThrow('npc_not_interactable');
    expect(dialogue).not.toHaveBeenCalled();
    registry = registryWithNpc('missing');
    expect(() => session(ctx, true)).toThrow('npc_not_interactable');
    expect(dialogue).not.toHaveBeenCalled();
  });

  it('opens renamed active NPC dialogue and rejects retired or missing content before every write', () => {
    const code = ts.transpileModule(
      `${declaration('interactNpc')}\nreturn interactNpc;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    let registry = activeRegistry;
    const updateNpc = vi.fn();
    const insertDialogue = vi.fn();
    const clearStash = vi.fn();
    const statistic = vi.fn();
    const interact = new Function(
      'requireAuthorizedSender', 'mountedNpcFor', 'npcWithinInteractionReach',
      'contentRegistry', 'runtimeNpcDefinition', 'runtimeDialogueDefinition',
      'updateWorldNpc', 'npcFacingTowardPoint', 'parseNpcFacing',
      'clearActiveHearthStash', 'recordPlayerStatistic', 'SenderError', code,
    )(
      () => {}, () => null, () => true,
      () => registry, sim.runtimeNpcDefinition, sim.runtimeDialogueDefinition,
      updateNpc, () => 'left', () => 'down',
      clearStash, statistic, Error,
    ) as (ctx: unknown, request: { npcId: bigint }) => void;
    const ctx = { sender: { toHexString: () => 'player' }, senderAuth: { jwt: null }, db: {
      membership: { identity: { find: () => null } },
      player_position: { identity: { find: () => ({ spaceId: 0, x: 0, y: 0 }) } },
      world_npc: { id: { find: () => npc } },
      world_merchant: { npcId: { find: () => ({ dialogueId: 'willow_storekeeper' }) } },
      world_clock: { id: { find: () => ({ authorityTick: 12n }) } },
      active_dialogue: { identity: { find: () => null }, insert: insertDialogue },
    } };

    interact(ctx, { npcId: npc.id });
    expect(updateNpc).toHaveBeenCalledOnce();
    expect(insertDialogue).toHaveBeenCalledOnce();
    expect(clearStash).toHaveBeenCalledOnce();
    expect(statistic).toHaveBeenCalledTimes(2);

    for (const unavailable of [registryWithNpc(true), registryWithNpc('missing')]) {
      registry = unavailable;
      updateNpc.mockClear();
      insertDialogue.mockClear();
      clearStash.mockClear();
      statistic.mockClear();
      expect(() => interact(ctx, { npcId: npc.id })).toThrow('npc_not_interactable');
      expect(updateNpc).not.toHaveBeenCalled();
      expect(insertDialogue).not.toHaveBeenCalled();
      expect(clearStash).not.toHaveBeenCalled();
      expect(statistic).not.toHaveBeenCalled();
    }
  });
});
