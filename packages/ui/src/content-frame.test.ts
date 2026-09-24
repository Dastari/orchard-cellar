import { describe, expect, it, vi } from 'vitest';
import * as pixelUi from './pixel-ui.js';
import * as skin from './skin.js';
import * as storageFrame from './storage-frame.js';
import {
  bootstrapContentDefinitions,
  type FrameContentDefinition,
  type ItemContentDefinition,
  type ProcessContentDefinition,
} from '@orchard/sim';
import {
  contentFrameButtonAt,
  contentFramePaneVisible,
  drawContentFrame,
  frameRestrictions,
  layoutContentFrame,
  resolveFramePaneSlots,
  resolveFrameSlotRestriction,
} from './content-frame.js';
import { contentFrameDefinitionForSurface, overworldUiLayout } from './overworld-ui.js';

const definitions = bootstrapContentDefinitions();
const frames = definitions.filter((definition): definition is FrameContentDefinition => definition.kind === 'frame');
const registry = {
  items: new Map(definitions.filter((definition): definition is ItemContentDefinition => definition.kind === 'item')
    .map((definition) => [definition.id, definition] as const)),
  processes: new Map(definitions.filter((definition): definition is ProcessContentDefinition => definition.kind === 'process')
    .map((definition) => [definition.id, definition] as const)),
};
const liveRegistry = {
  ...registry,
  frames: new Map(frames.map((definition) => [definition.id, definition] as const)),
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
  it('renders a private job state bar independently from processor progress and displays the stored batch label', () => {
    const definition: FrameContentDefinition = {
      id: 'frame:private_batch', kind: 'frame', schemaVersion: 1, title: 'BATCH', style: 'wood',
      panes: [
        { id: 'job', kind: 'bar', bind: { state: 'jobProgress' } },
        { id: 'label', kind: 'text', bind: { state: 'jobLabel' } },
      ],
    };
    const layout = layoutContentFrame({ width: 480, height: 270 }, definition, aliases, registry);
    const fillRect = vi.fn();
    const context = { fillRect } as unknown as CanvasRenderingContext2D;
    vi.spyOn(storageFrame, 'drawStorageFrameChrome').mockImplementation(() => {});
    vi.spyOn(skin, 'drawUiSkinAsset').mockImplementation(() => {});
    const text = vi.spyOn(pixelUi, 'drawPixelTextInRect').mockImplementation((_context, _ui, value, bounds) => ({
      text: value, content: bounds, x: bounds.x, y: bounds.y, renderedWidth: 0, overflowed: false,
    }));
    try {
      drawContentFrame(context, layout, { progress: 0.9, state: { jobProgress: 0.25, jobLabel: '7 × Soup' } }, {
        skin: {} as skin.UiSkin, fonts: {} as pixelUi.PixelUi,
        drawSlot: () => {}, drawButtons: false, drawResizeHandles: false,
      });
      const rect = layout.panes[0]!.layout.grid;
      const height = Math.round((rect.height - 6) * 0.25);
      expect(fillRect).toHaveBeenCalledWith(rect.x + 3, rect.y + rect.height - 3 - height, rect.width - 6, height);
      expect(text).toHaveBeenCalledWith(context, expect.anything(), '7 × Soup', layout.panes[1]!.layout.grid,
        expect.objectContaining({ overflow: 'ellipsis' }));
    } finally { vi.restoreAllMocks(); }
  });
  it('lays out all G1-G5 frames inside the logical viewport at UI scales 1-3', () => {
    for (const [physicalWidth, physicalHeight, scale] of [
      [480, 270, 1], [960, 540, 2], [1_440, 810, 3],
    ] as const) {
      const viewport = { width: physicalWidth / scale, height: physicalHeight / scale };
      for (const definition of frames) {
        const layout = layoutContentFrame(viewport, definition, aliases, registry);
        expect(layout.storage.frame.x).toBeGreaterThanOrEqual(0);
        expect(layout.storage.frame.y).toBeGreaterThanOrEqual(0);
        expect(layout.storage.frame.x + layout.storage.frame.width).toBeLessThanOrEqual(viewport.width);
        expect(layout.storage.frame.y + layout.storage.frame.height).toBeLessThanOrEqual(viewport.height);
        expect(layout.panes.map(({ definition: pane }) => pane.id)).toEqual(definition.panes.map(({ id }) => id));
      }
    }
  });

  it.each(['fermentation', 'barrel'])('shows the %s batch quantity without truncating its input label', (id) => {
    const layout = layoutContentFrame({ width: 480, height: 270 }, frame(id), aliases, registry);
    const input = layout.panes[0]!;
    expect(input.layout.labelPosition.x).toBe(input.layout.region.x);
    expect(pixelUi.measurePixelText(input.definition.label!)).toBeLessThanOrEqual(input.layout.region.width);
  });

  it('binds entity and self slots without hardcoded window-specific container logic', () => {
    const furnace = frame('furnace');
    const input = furnace.panes.find(({ id }) => id === 'input')!;
    const backpack = furnace.panes.find(({ id }) => id === 'backpack')!;
    expect(resolveFramePaneSlots(input, aliases, registry)).toEqual([{
      containerId: 'placeable', index: 0, restriction: { acceptedKinds: ['clay', 'copper_ore', 'gold_ore', 'iron_ore', 'sand', 'silver_ore', 'tin_ore'] },
    }]);
    expect(resolveFramePaneSlots(backpack, aliases, registry)).toHaveLength(20);
    expect(resolveFramePaneSlots(backpack, aliases, registry)[0]).toMatchObject({ containerId: 'backpack', index: 0 });
  });

  it('derives process input, fuel and output allow-lists from the content registry', () => {
    const furnace = frame('furnace');
    const restrictions = frameRestrictions(furnace, registry);
    expect(restrictions[0]).toEqual({ acceptedKinds: ['clay', 'copper_ore', 'gold_ore', 'iron_ore', 'sand', 'silver_ore', 'tin_ore'] });
    expect(restrictions[1]).toEqual({ acceptedKinds: ['coal', 'plank', 'wood'] });
    expect(restrictions[2]).toEqual({ readOnly: true });

    const derivedOutput = resolveFrameSlotRestriction({
      acceptedFrom: { stationTag: 'station.furnace', role: 'output' }, readOnly: true,
    }, registry);
    expect(derivedOutput).toEqual({ acceptedKinds: ['brick', 'copper_bar', 'glass_pane', 'gold_bar', 'iron_bar', 'silver_bar', 'tin_bar'], readOnly: true });
  });

  it('derives the barrel input family without embedding crop ids in the UI', () => {
    const barrel = frame('barrel');
    const restrictions = frameRestrictions(barrel, registry);
    expect(restrictions[0]?.acceptedKinds).toContain('carrot');
    expect(restrictions[0]?.acceptedKinds).toContain('wheat');
    expect(Object.keys(restrictions)).toHaveLength(8);
  });

  it('uses authored state predicates for generic frame buttons', () => {
    const layout = layoutContentFrame({ width: 480, height: 270 }, frame('barrel'), aliases, registry);
    const button = layout.buttons[0]!;
    const point = { x: button.rect.x + 2, y: button.rect.y + 2 };
    expect(contentFrameButtonAt(layout, point, { sealed: false })?.interaction).toBe('seal');
    expect(contentFrameButtonAt(layout, point, { sealed: true })).toBeNull();
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

  it('threads every G1-G5 frame through the Overworld UI when live content is verified', () => {
    const layout = overworldUiLayout(480, 270, { contentRegistry: liveRegistry });
    expect([...layout.contentFrames.keys()].sort()).toEqual(frames.map(({ id }) => id).sort());
    expect(layout.contentFrames.get('frame:furnace')?.definition.title).toBe('FURNACE');
    expect(layout.contentFrames.get('frame:shop')?.definition.presentation?.surface).toBe('merchant');
    expect(overworldUiLayout(480, 270).contentFrames.size).toBe(0);
  });
});
