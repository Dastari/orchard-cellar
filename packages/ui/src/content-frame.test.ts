import { UiRoot } from './kit/runtime/root.js';
import { uiContentFrame } from './kit/components/content-frame.js';
import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapContentDefinitions,
  type FrameContentDefinition,
  type ItemContentDefinition,
  type ProcessContentDefinition,
} from '@orchard/sim';
import {
  contentFramePaneVisible,
  frameRestrictions,
  resolveFramePaneSlots,
  resolveFrameSlotRestriction,
} from './content-frame.js';
import { contentFrameDefinitionForSurface } from './game/index.js';

const definitions = bootstrapContentDefinitions();
const frames = definitions.filter((definition): definition is FrameContentDefinition => definition.kind === 'frame');
const registry = {
  items: new Map(definitions.filter((definition): definition is ItemContentDefinition => definition.kind === 'item')
    .map((definition) => [definition.id, definition] as const)),
  processes: new Map(definitions.filter((definition): definition is ProcessContentDefinition => definition.kind === 'process')
    .map((definition) => [definition.id, definition] as const)),
};
const aliases = {
  entity: 'placeable', backpack: 'backpack', hotbar: 'hotbar',
  equipment: 'equipment', crafting: 'crafting', merchant: 'merchant',
} as const;

function frame(id: string) {
  const result = frames.find((candidate) => candidate.id === `frame:${id}`);
  if (result === undefined) throw new Error(`missing ${id} frame`);
  return result;
}

describe('content frame runtime', () => {
  it('lays out all G1-G5 frames inside the logical viewport at UI scales 1-3', () => {
    for (const [physicalWidth, physicalHeight, scale] of [
      [480, 270, 1], [960, 540, 2], [1_440, 810, 3],
    ] as const) {
      const viewport = { width: physicalWidth / scale, height: physicalHeight / scale };
      for (const definition of frames) {
        const root = new UiRoot({ scale }); root.resize(physicalWidth, physicalHeight);
        const composed = root.mount(uiContentFrame({ definition, aliases, registry })); root.arrange();
        expect(composed.rect).toEqual({ x: 0, y: 0, ...viewport });
        const entries = root.entries().map(entry => entry.element);
        expect(entries.filter(node => node.props['pane'] !== undefined).map(node => node.props['pane']))
          .toEqual(definition.panes.filter(pane => contentFramePaneVisible(pane)).map(pane => pane.id));
        for (const node of entries) {
          if (node.clip.width === 0 || node.clip.height === 0) continue;
          expect(node.clip.x).toBeGreaterThanOrEqual(0);
          expect(node.clip.y).toBeGreaterThanOrEqual(0);
          expect(node.clip.x + node.clip.width).toBeLessThanOrEqual(viewport.width);
          expect(node.clip.y + node.clip.height).toBeLessThanOrEqual(viewport.height);
        }
        root.dispose();
      }
    }
  });

  it('binds entity and self slots without hardcoded window-specific container logic', () => {
    const furnace = frame('furnace');
    const input = furnace.panes.find(({ id }) => id === 'input')!;
    const backpack = furnace.panes.find(({ id }) => id === 'backpack')!;
    expect(resolveFramePaneSlots(input, aliases, registry)).toEqual([{
      containerId: 'placeable', index: 0, restriction: { acceptedKinds: ['copper_ore', 'gold_ore', 'iron_ore'] },
    }]);
    expect(resolveFramePaneSlots(backpack, aliases, registry)).toHaveLength(20);
    expect(resolveFramePaneSlots(backpack, aliases, registry)[0]).toMatchObject({ containerId: 'backpack', index: 0 });
  });

  it('derives process input, fuel and output allow-lists from the content registry', () => {
    const furnace = frame('furnace');
    const restrictions = frameRestrictions(furnace, registry);
    expect(restrictions[0]).toEqual({ acceptedKinds: ['copper_ore', 'gold_ore', 'iron_ore'] });
    expect(restrictions[1]).toEqual({ requiredTags: ['fuel.furnace'] });
    expect(restrictions[2]).toEqual({ readOnly: true });

    const derivedOutput = resolveFrameSlotRestriction({
      acceptedFrom: { stationTag: 'station.furnace', role: 'output' }, readOnly: true,
    }, registry);
    expect(derivedOutput).toEqual({ acceptedKinds: ['copper_bar', 'gold_bar', 'iron_bar'], readOnly: true });
  });

  it('derives the barrel input family without embedding crop ids in the UI', () => {
    const barrel = frame('barrel');
    const restrictions = frameRestrictions(barrel, registry);
    expect(restrictions[0]?.acceptedKinds).toContain('carrot');
    expect(restrictions[0]?.acceptedKinds).toContain('wheat');
    expect(Object.keys(restrictions)).toHaveLength(8);
  });

  it('uses authored state predicates for generic frame buttons', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(480,270);
    const invoke = vi.fn(), definition = frame('barrel');
    const composed = uiContentFrame({ definition, aliases, registry, state: { sealed: false }, onInvoke: invoke });
    root.mount(composed);
    root.arrange();
    const button = root.entries().find(entry => entry.element.label === definition.buttons![0]!.label)!.element;
    root.focus.set(button, 'keyboard'); root.key({ key: 'Enter' });
    expect(invoke).toHaveBeenCalledWith('seal');
    invoke.mockClear();
    composed.updateState({ sealed: true }); root.arrange();
    expect(button.visible).toBe(false);
    root.key({ key: 'Enter' });
    expect(invoke).not.toHaveBeenCalled(); root.dispose();
  });

  it('uses authored pane visibility and surface metadata for arbitrary renamed frames', () => {
    const source = frame('furnace');
    const renamed = {
      ...source,
      id: 'frame:moon_engine',
      title: 'MOON ENGINE',
      presentation: { surface: 'entity', entityContainer: 'placeable' },
      panes: source.panes.map((pane, index) => index === 0
        ? { ...pane, visibleWhen: { state: 'charged', equals: true } } : pane),
    } as const;
    const renamedFrames = new Map([[renamed.id, renamed]]);
    expect(contentFrameDefinitionForSurface(renamedFrames, 'entity')?.id).toBe('frame:moon_engine');
    expect(contentFramePaneVisible(renamed.panes[0]!, { charged: false })).toBe(false);
    expect(contentFramePaneVisible(renamed.panes[0]!, { charged: true })).toBe(true);
  });

});
