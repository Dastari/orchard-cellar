import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, createHandlerRegistry, settleProcess } from '@orchard/sim';

import type { WorldReducerContext } from '../index.js';
import { useSelectedBehaviour, type UseSelectedAuthority } from './use-selected.js';

const ctx = {} as WorldReducerContext;

function authority(onFrameAction: (actionId: string) => boolean): UseSelectedAuthority {
  return {
    reject: (message) => { throw new Error(message); },
    authorize: () => undefined,
    resolveTarget: () => null,
    assertTargetReach: () => undefined,
    actorRef: () => ({ entityType: 'player', id: 'actor' }),
    selectedItem: () => { throw new Error('frame action must not resolve a selected item'); },
    equipmentItem: () => null,
    snapshot: () => { throw new Error('frame action must not construct a lifecycle snapshot'); },
    handlers: () => createHandlerRegistry(),
    apply: () => { throw new Error('frame action must not enter the item-effect writer'); },
    tileTarget: () => { throw new Error('frame action must not resolve a tile'); },
    assertTileReach: () => undefined,
    carriedObject: () => null,
    performFrameAction: (_ctx, actionId) => onFrameAction(actionId),
  };
}

describe('authored frame action routing', () => {
  it('preserves cooking completion time and consumes input exactly once through the shared kernel', () => {
    const registry = bootstrapContentRegistry();
    const recipe = [...registry.processes.values()].find((definition) => (
      definition.adapter === 'campfire_cooking' && definition.input.item === 'item:raw_beef'
    ))!;
    const options = { topology: { slotCount: 2, inputSlots: [0], outputSlots: [1], fuelSlots: [] } };
    const startTick = 5n;
    const readyTick = startTick + BigInt(recipe.ticksPerUnit);
    const state = { slots: [{ itemKind: 'raw_beef', quantity: recipe.input.count }, null], startTick, lit: true };
    const early = settleProcess([recipe], 'campfire_cooking', state, readyTick - 1n, options);
    expect(early).toMatchObject({ slots: state.slots, startTick, completed: 0 });
    const completed = settleProcess([recipe], 'campfire_cooking', state, readyTick, options);
    expect(completed).toMatchObject({
      slots: [null, { itemKind: recipe.outputs[0]!.item.slice('item:'.length), quantity: recipe.outputs[0]!.count }],
      startTick: undefined,
      completed: 1,
    });
    expect(settleProcess([recipe], 'campfire_cooking', { ...completed, lit: true }, readyTick, options))
      .toMatchObject({ slots: completed.slots, completed: 0 });
  });

  it('forwards an arbitrary authored semantic through one generic command', () => {
    const actions: string[] = [];
    useSelectedBehaviour(ctx, {
      verb: 'frame_action',
      targetKind: '',
      entityId: 0n,
      tileX: 0,
      tileY: 0,
      actionId: 'ring_bell',
    }, authority((actionId) => {
      actions.push(actionId);
      return true;
    }));
    expect(actions).toEqual(['ring_bell']);
  });

  it('rejects malformed, target-spoofed, and unavailable frame commands', () => {
    let dispatches = 0;
    const unavailable = authority(() => {
      dispatches += 1;
      return false;
    });
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'frame_action', targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
      actionId: '../seal',
    }, unavailable)).toThrow('behaviour_frame_action_invalid');
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'frame_action', targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
      actionId: 'a'.repeat(129),
    }, unavailable)).toThrow('behaviour_frame_action_invalid');
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'frame_action', targetKind: 'placeable', entityId: 7n, tileX: 0, tileY: 0,
      actionId: 'seal',
    }, unavailable)).toThrow('behaviour_frame_action_invalid');
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'frame_action', targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
      actionId: 'unknown_action',
    }, unavailable)).toThrow('behaviour_frame_action_unavailable');
    expect(dispatches).toBe(1);
  });

  it('routes the barrel button through authored-frame validation and preserves processor kernels', () => {
    const world = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    const selected = readFileSync(new URL('./use-selected.ts', import.meta.url), 'utf8');
    const client = readFileSync(
      new URL('../../../client/src/net/overworld-connection.ts', import.meta.url),
      'utf8',
    );
    const ui = readFileSync(new URL('../../../ui/src/overworld-ui.ts', import.meta.url), 'utf8');
    const cooking = readFileSync(new URL('./cooking.ts', import.meta.url), 'utf8');
    const processors = readFileSync(new URL('./processors.ts', import.meta.url), 'utf8');
    const frameActionStart = world.indexOf('performFrameAction: (ctx, actionId) =>');
    const authoredCheck = world.indexOf('authoredFrameAction(frame, actionId)', frameActionStart);
    const effectDispatch = world.indexOf("'sealContainer' in result.effects[0]!", authoredCheck);
    expect(frameActionStart).toBeGreaterThanOrEqual(0);
    expect(authoredCheck).toBeGreaterThan(frameActionStart);
    expect(effectDispatch).toBeGreaterThan(authoredCheck);
    expect(world).not.toContain("actionId === 'seal'");
    expect(selected).toContain("request.verb === 'frame_action'");
    expect(world).not.toContain("request.verb === 'process_seal'");
    expect(client).toContain("return this.useSelected('frame_action', { actionId });");
    expect(client).not.toMatch(/'process_(?:start|collect|cancel|seal)'/u);
    expect(ui).toContain('this.callbacks.frameAction?.(frameButton.interaction);');
    expect(ui).not.toContain('sealBarrel?:');
    expect(ui).not.toMatch(/readonly (?:start|collect|cancel)Cooking\??:/u);
    expect(cooking.indexOf('dependencies.authorize(ctx)')).toBeLessThan(cooking.indexOf('dependencies.loadOpenBarrel(ctx)'));
    expect(cooking).toContain('processorRuntimeForPlaceableBehaviour(dependencies.contentRegistry(ctx), placeable)');
    expect(cooking.indexOf("throw new SenderError('barrel_batch_invalid')"))
      .toBeLessThan(cooking.indexOf('ctx.db.world_placeable.id.update('));
    expect(processors).toContain('settleProcess(definitions, adapter');
    expect(processors).toContain('settled.completed > 0');
    expect(processors).toContain('startTick: startTickFor(placeable, adapter)');
    expect(processors).toContain('}, authorityTick, processorOptions(');
    expect(processors).toContain('writeSettledSlots(ctx, rows, before, settled.slots, dependencies)');
    expect(processors).toContain('const cookStartedBy = settled.startTick === undefined ? undefined : placeable.cookStartedBy');
    expect(processors).toContain('cookStartTick: settled.startTick');
    expect(processors.indexOf('settleProcess(definitions, adapter'))
      .toBeLessThan(processors.indexOf('writeSettledSlots(ctx, rows, before, settled.slots, dependencies)'));
  });
});
