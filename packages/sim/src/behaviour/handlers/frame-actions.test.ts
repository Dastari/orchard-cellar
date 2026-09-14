import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from '../../content/bootstrap-registry.js';
import { parseFrameDefinition } from '../../content/frame-definition.js';
import { createHandlerRegistry } from '../registry.js';
import { createReadOnlySnapshot } from '../snapshot.js';
import { raiseEvent } from '../raise.js';
import { frameActionHandlerRegistrations } from './frame-actions.js';

const actor = { entityType: 'player', id: 'original-owner' } as const;
const snapshot = createReadOnlySnapshot({ tick: 5n,
  registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
  space: { id: 'space:test', kind: 'overworld', tags: [] },
  calendar: { minuteOfDay: 0, season: 'spring' }, nearbyObjects: [] });
function frame(id = 'frame:renamed', action = 'recover_custody') {
  return parseFrameDefinition({ id, kind: 'frame', schemaVersion: 1, title: 'CUSTODY', style: 'wood',
    panes: [{ id: 'status', kind: 'label', bind: { state: 'processJobLabel' } }],
    buttons: [{ label: 'RETURN INPUT', interaction: action, onInvoke: { claimProcessJob: 'cancel' } }] });
}

describe('authored frame lifecycle callbacks', () => {
  it('resolves renamed frames/actions without an entity target or selected item', () => {
    const definition = frame();
    const registry = createHandlerRegistry(frameActionHandlerRegistrations([frame('frame:other'), definition]));
    expect(raiseEvent(registry, { type: 'frameAction', actor,
      frameId: definition.id, actionId: 'recover_custody' }, snapshot))
      .toEqual({ effects: [{ claimProcessJob: { action: 'cancel' } }] });
    for (const [frameId, actionId] of [[definition.id, 'forged'], ['frame:missing', 'recover_custody']]) {
      expect(raiseEvent(registry, { type: 'frameAction', actor, frameId: frameId!, actionId: actionId! }, snapshot))
        .toEqual({ effects: [] });
    }
  });

  it('has no callback for retired frames or presentation-only buttons', () => {
    const definition = frame();
    expect(frameActionHandlerRegistrations([{ ...definition, retired: true }])).toEqual([]);
    expect(frameActionHandlerRegistrations([{ ...definition,
      buttons: [{ label: 'DISPLAY', interaction: 'display' }] }])).toEqual([]);
  });

  it('authors both station collection and anywhere inventory cancellation', () => {
    const content = bootstrapContentRegistry();
    const registry = createHandlerRegistry(frameActionHandlerRegistrations(content.frames.values()));
    const cooking = content.frames.get('frame:cooking')!;
    const inventory = [...content.frames.values()].find((entry) => entry.presentation?.surface === 'inventory')!;
    for (const [definition, action] of [[cooking, 'collect'], [cooking, 'cancel'], [inventory, 'cancel']] as const) {
      const button = definition.buttons!.find((entry) => entry.onInvoke?.claimProcessJob === action)!;
      expect(raiseEvent(registry, { type: 'frameAction', actor, frameId: definition.id,
        actionId: button.interaction }, snapshot)).toEqual({ effects: [{ claimProcessJob: { action } }] });
    }
    expect(inventory.buttons?.some((entry) => entry.onInvoke?.claimProcessJob === 'collect')).toBe(false);
  });

  it('strictly rejects ambiguous or unbounded callback bindings and duplicate action ids', () => {
    const definition = frame();
    for (const onInvoke of [null, {}, { claimProcessJob: 'start' },
      { claimProcessJob: 'cancel', outputKind: 'forged' }, { eval: 'code' }]) {
      expect(() => parseFrameDefinition({ ...definition,
        buttons: [{ ...definition.buttons![0], onInvoke }] })).toThrow();
    }
    expect(() => parseFrameDefinition({ ...definition,
      buttons: [definition.buttons![0], definition.buttons![0]] })).toThrow('unique interaction');
  });
});
