import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRows,
  buildContentRegistry,
  type FrameContentDefinition,
  type ObjectContentDefinition,
} from '@orchard/sim';
import { activeObjectFrameId, activeObjectFrameState, processJobFrameState, processJobMatchesFrame } from './frame-presentation.js';

describe('authored object frame presentation adapter', () => {
  it('keeps persisted batch quantity and timing while resolving only its display name from content', () => {
    const registry = buildContentRegistry(bootstrapContentRows()).registry;
    const job = { outputKind: 'cooked_fish', quantity: 7, startedTick: 10n, readyTick: 30n };
    expect(processJobFrameState(registry, job, 20n)).toMatchObject({
      processJobPending: true, processJobReady: false, processJobProgress: 0.5,
      processJobQuantity: 7,
      processJobOutputLabel: registry.items.get('item:cooked_fish')?.displayName ?? 'cooked_fish',
    });
    expect(processJobFrameState(registry, job, 0n).processJobProgress).toBe(0);
    expect(processJobFrameState(registry, job, 40n)).toMatchObject({ processJobReady: true, processJobProgress: 1 });
    expect(processJobFrameState(registry, { ...job, outputKind: 'historical_output' }, 20n))
      .toMatchObject({ processJobPending: true, processJobOutputLabel: 'historical_output', processJobQuantity: 7 });
    expect(processJobFrameState(registry, null, 20n)).toEqual({ processJobPending: false, processJobReady: false });
  });

  it('does not expose station collection for unrelated or unproven legacy targets', () => {
    const target = { id: 9n, spaceId: 2, tileX: 14, tileY: 20 };
    const job = { targetKind: 'placeable', targetId: target.id, spaceId: target.spaceId };
    expect(processJobMatchesFrame(job, target, undefined)).toBe(true);
    expect(processJobMatchesFrame(job, { ...target, id: 10n }, undefined)).toBe(false);
    expect(processJobMatchesFrame(job, { ...target, spaceId: 3 }, undefined)).toBe(false);
    expect(processJobMatchesFrame(job, null, undefined)).toBe(false);
    expect(processJobMatchesFrame({ ...job, targetKind: 'landmark' }, target, undefined)).toBe(false);
    expect(processJobMatchesFrame({ ...job, targetKind: 'landmark' }, target, target)).toBe(true);
    expect(processJobMatchesFrame({ ...job, targetKind: 'landmark' }, target, { ...target, tileX: 15 })).toBe(false);
    expect(processJobMatchesFrame({ ...job, targetKind: 'npc' }, target, target)).toBe(false);
  });
  it('resolves an arbitrary renamed object and frame without kind-specific dispatch', () => {
    const frame: FrameContentDefinition = {
      id: 'frame:moon_engine', kind: 'frame', schemaVersion: 1,
      title: 'MOON ENGINE', style: 'wood_parchment',
      presentation: { surface: 'entity', entityContainer: 'placeable' },
      panes: [{
        id: 'catalyst', kind: 'slots', label: 'CATALYST', columns: 1, rows: 1,
        bind: { entitySlots: [7] },
      }],
      buttons: [{ label: 'CHARGE', interaction: 'charge', visibleWhen: { state: 'charged', equals: false } }],
    };
    const object: ObjectContentDefinition = {
      id: 'object:lunar_apparatus', kind: 'object', schemaVersion: 1,
      displayName: 'Lunar Apparatus', components: { frame: { ref: frame.id } },
    };
    const registry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: frame.id, kind: frame.kind, json: frame },
      { id: object.id, kind: object.kind, json: object },
    ]).registry;
    expect(activeObjectFrameId(registry, {
      kind: 'unrelated_runtime_name', definitionId: object.id,
    })).toBe(frame.id);
  });

  it('fails closed for missing frame metadata and filters non-primitive state', () => {
    const registry = buildContentRegistry(bootstrapContentRows()).registry;
    expect(activeObjectFrameId(registry, { kind: 'unknown', definitionId: 'object:unknown' })).toBeNull();
    expect(activeObjectFrameState({
      stateJson: '{"charged":true,"mode":"night","nested":{"unsafe":true}}',
      lit: false,
      barrelSealedTick: undefined,
    })).toEqual({ charged: true, mode: 'night', lit: false, sealed: false });
  });
});
