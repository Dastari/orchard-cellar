import { beforeEach, describe, expect, it, vi } from 'vitest';

const render = vi.hoisted(() => ({
  button: vi.fn(),
  icon: vi.fn(),
  symbol: vi.fn(),
  frame: vi.fn(),
  slot: vi.fn(),
  slotSelectorRect: vi.fn((rect: unknown) => rect),
  text: vi.fn(),
  selector: vi.fn(),
  tooltip: vi.fn(),
  ribbon: vi.fn(),
  loadFonts: vi.fn(async () => ({ font: 'fonts' })),
  loadSkin: vi.fn(async (keys: readonly string[]) => Object.fromEntries(
    keys.map((key) => [key, { name: key }]),
  )),
  loadIcons: vi.fn(async (names: readonly string[]) => Object.fromEntries(
    names.map((name) => [name, { image: name, width: 24, height: 24 }]),
  )),
}));

vi.mock('../design-system/fantasy-controls.js', () => ({
  drawFantasyButton: render.button,
  drawFantasyIconCell: render.icon,
}));
vi.mock('../design-system/frame.js', () => ({
  drawUiFrame: render.frame,
  uiFrameContentRect: vi.fn((bounds: unknown) => bounds),
}));
vi.mock('../design-system/inventory.js', () => ({
  drawUiInventorySlotBacking: render.slot,
  uiInventorySelectorRect: render.slotSelectorRect,
}));
vi.mock('../pixel-ui.js', () => ({
  drawPixelTextInRect: render.text,
  loadPixelUi: render.loadFonts,
}));
vi.mock('../selector.js', () => ({ drawSemanticSelector: render.selector }));
vi.mock('../ribbon.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ribbon.js')>()),
  Ribbon: class {
    drawSingle = render.ribbon;
  },
}));
vi.mock('../skin.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../skin.js')>()),
  drawUiIconAsset: render.symbol,
  drawUiLabelPlate: render.tooltip,
  loadUiGeneratedSkin: render.loadSkin,
  loadUiIconSet: render.loadIcons,
}));
vi.mock('./skin.js', () => ({
  STUDIO_SKIN_TOKENS: {
    backdrop: '#backdrop',
    danger: '#danger',
    greenDark: '#green',
    ink: '#ink',
    mutedInk: '#muted',
  },
}));

import {
  drawStudioCanvasShell,
  drawStudioCanvasShellNodes,
  drawStudioCanvasAlphaGrid,
  loadStudioCanvasShellArt,
  type StudioCanvasShellArt,
  type StudioCanvasShellModel,
} from './canvas-shell.js';

function fakeContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D;
}

const art = { fonts: { font: 'fonts' }, skin: {
  frame: 'skin', icons: { visibility: { image: 'visibility', width: 24, height: 24 } },
} } as unknown as StudioCanvasShellArt;

describe('Studio canvas shell UI-Lab primitive adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the production bitmap fonts and UI skin together', async () => {
    await expect(loadStudioCanvasShellArt()).resolves.toEqual({
      fonts: { font: 'fonts' },
      skin: expect.objectContaining({
        panelWood: { name: 'panelWood' },
        buttonWideChamfered: { name: 'buttonWideChamfered' },
        slot: { name: 'slot' },
        selectorDeny: { name: 'selectorDeny' },
        icons: expect.objectContaining({ visibility: { image: 'visibility', width: 24, height: 24 } }),
      }),
    });
    expect(render.loadFonts).toHaveBeenCalledOnce();
    expect(render.loadSkin).toHaveBeenCalledOnce();
    expect(render.loadIcons).toHaveBeenCalledOnce();
    expect(render.loadIcons.mock.calls[0]?.[0]).toContain('visibility');
    expect(render.loadSkin.mock.calls[0]?.[0]).toHaveLength(18);
    expect(render.loadSkin.mock.calls[0]?.[0]).toContain('panelWood');
    expect(render.loadSkin.mock.calls[0]?.[0]).toContain('selectorDeny');
    expect(render.loadSkin.mock.calls[0]?.[0]).toContain('ribbon');
    expect(render.loadSkin.mock.calls[0]?.[0]).toContain('sliderHandle');
  });

  it('routes every shell node through the shared canvas primitives', () => {
    const context = fakeContext();
    const model: StudioCanvasShellModel = {
      width: 320,
      height: 180,
      production: true,
      nodes: [
        { id: 'wood', kind: 'wood_panel', bounds: { x: 0, y: 0, width: 50, height: 50 } },
        { id: 'paper', kind: 'parchment_panel', bounds: { x: 50, y: 0, width: 50, height: 50 } },
        { id: 'inset', kind: 'thin_panel', bounds: { x: 100, y: 0, width: 50, height: 50 } },
        { id: 'alpha', kind: 'alpha_grid', bounds: { x: 150, y: 0, width: 32, height: 32 } },
        { id: 'ribbon', kind: 'ribbon', bounds: { x: 182, y: 0, width: 78, height: 21 }, label: 'TOOLS' },
        { id: 'save', kind: 'button', bounds: { x: 0, y: 50, width: 60, height: 18 }, label: 'Save', glyph: 'star', state: 'hover' },
        { id: 'danger', kind: 'tab', bounds: { x: 60, y: 50, width: 60, height: 18 }, label: 'Live', tone: 'danger', state: 'pressed' },
        { id: 'route', kind: 'button', bounds: { x: 120, y: 50, width: 40, height: 40 }, icon: { frame: 4, outline: 19 }, state: 'active' },
        { id: 'eye', kind: 'button', bounds: { x: 160, y: 50, width: 40, height: 40 }, symbol: 'visibility' },
        { id: 'field', kind: 'field', bounds: { x: 0, y: 70, width: 90, height: 18 }, label: 'Value' },
        { id: 'source', kind: 'field', bounds: { x: 200, y: 70, width: 100, height: 42 },
          label: 'line one\nline two', multiline: true, textScale: 1 },
        { id: 'slot', kind: 'slot', bounds: { x: 90, y: 70, width: 20, height: 20 },
          clip: { x: 94, y: 72, width: 16, height: 18 }, label: '1', state: 'active' },
        { id: 'preview-slot', kind: 'slot', bounds: { x: 112, y: 70, width: 40, height: 40 },
          preview: { image: { atlas: true } as unknown as CanvasImageSource,
            frame: { x: 16, y: 32, width: 16, height: 16, durationTicks: 0 } } },
        { id: 'heading', kind: 'heading', bounds: { x: 0, y: 92, width: 90, height: 18 }, label: 'Objects' },
        { id: 'label', kind: 'label', bounds: { x: 0, y: 112, width: 90, height: 18 }, label: 'Selected' },
        { id: 'tooltip', kind: 'tooltip', bounds: { x: 120, y: 92, width: 120, height: 24 }, label: 'Map Editor' },
      ],
    };

    drawStudioCanvasShell(context, art, model);

    expect(render.frame.mock.calls.map((call) => call[3])).toEqual([
      'thin',
      'wood',
      'wood_parchment',
      'thin',
      'thin',
      'thin',
    ]);
    expect(render.button).toHaveBeenCalledTimes(5);
    expect(render.ribbon).toHaveBeenCalledWith(expect.anything(), '',
      { x: 182, y: 0, width: 78, height: 21 });
    expect(render.button.mock.calls[0]?.[4]).toMatchObject({
      label: 'Save', glyph: 'star', shape: 'chamfered', tone: 'peach', hovered: true,
    });
    expect(render.button.mock.calls[1]?.[4]).toMatchObject({
      label: 'Live', shape: 'square', tone: 'red', state: 'pressed',
    });
    expect(render.icon.mock.calls.map((call) => call[3])).toEqual([19, 4]);
    expect(render.symbol).toHaveBeenCalledOnce();
    expect(render.slot).toHaveBeenCalledTimes(2);
    expect(render.selector).toHaveBeenCalledOnce();
    expect(render.selector.mock.calls[0]?.[3]).toBe('confirm');
    expect(render.text).toHaveBeenCalledTimes(8);
    expect(render.text.mock.calls.find((call) => call[2] === 'TOOLS')?.[4]).toMatchObject({ scale: 1 });
    expect(render.text.mock.calls.filter((call) => call[2] === 'line one' || call[2] === 'line two'))
      .toHaveLength(2);
    expect(render.text.mock.calls.find((call) => call[2] === 'line one')?.[4]).toMatchObject({
      verticalAlign: 'top', scale: 1,
    });
    expect(render.tooltip).not.toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledWith(150, 0, 32, 32);
    expect((context.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(2);
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.rect).toHaveBeenCalledWith(94, 72, 16, 18);
    expect(context.drawImage).toHaveBeenCalledWith(
      { atlas: true }, 16, 32, 16, 16, 118, 76, 28, 28,
    );
  });

  it('caches the alpha checker as one repeated canvas pattern', () => {
    const context = fakeContext() as CanvasRenderingContext2D & { createPattern: ReturnType<typeof vi.fn> };
    const tileContext = fakeContext();
    vi.stubGlobal('document', { createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => tileContext),
    })) });
    const pattern = { kind: 'checker' } as unknown as CanvasPattern;
    context.createPattern = vi.fn(() => pattern);
    drawStudioCanvasAlphaGrid(context, { x: 0, y: 0, width: 1_920, height: 1_080 });
    drawStudioCanvasAlphaGrid(context, { x: 10, y: 10, width: 1_000, height: 700 });
    expect(context.createPattern).toHaveBeenCalledOnce();
    expect(context.fillRect).toHaveBeenCalledTimes(2);
    expect(context.fillStyle).toBe(pattern);
    vi.unstubAllGlobals();
  });

  it('rejects ambiguous retained nodes before rendering', () => {
    const context = fakeContext();
    expect(() => drawStudioCanvasShell(context, art, {
      width: 10,
      height: 10,
      production: false,
      nodes: [
        { id: 'same', kind: 'label', bounds: { x: 0, y: 0, width: 4, height: 4 } },
        { id: 'same', kind: 'button', bounds: { x: 4, y: 0, width: 4, height: 4 } },
      ],
    })).toThrow('studio_canvas_shell_node_id_invalid:same');
    expect(render.frame).not.toHaveBeenCalled();
    expect(render.button).not.toHaveBeenCalled();

    expect(() => drawStudioCanvasShell(context, art, {
      width: 10,
      height: 10,
      production: false,
      nodes: [{ id: 'clipped', kind: 'label', bounds: { x: 0, y: 0, width: 4, height: 4 },
        clip: { x: 0, y: 0, width: -1, height: 4 } }],
    })).toThrow('studio_canvas_shell_node_clip_invalid:clipped');
  });

  it('places a small ribbon over the frame border when requested', () => {
    drawStudioCanvasShellNodes(fakeContext(), art, [{
      id: 'border-title', kind: 'ribbon', ribbonPlacement: 'top-border',
      bounds: { x: 20, y: 30, width: 180, height: 30 }, label: 'LAYERS',
    }]);
    expect(render.ribbon).toHaveBeenCalledWith(expect.anything(), '',
      { x: 20, y: 18, width: 180, height: 30 });
    expect(render.text.mock.calls.find((call) => call[2] === 'LAYERS')?.[4]).toMatchObject({ scale: 1 });
  });

  it('draws topmost overlay nodes without repainting the shell backdrop', () => {
    const context = fakeContext();
    drawStudioCanvasShellNodes(context, art, [{
      id: 'overlay-tip', kind: 'tooltip', bounds: { x: 12, y: 14, width: 120, height: 24 }, label: 'Map Editor',
    }]);
    expect(render.tooltip).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(render.button).toHaveBeenCalledOnce();
    expect(render.button.mock.calls[0]?.[4]).toMatchObject({ shape: 'pill' });
    expect(render.frame).not.toHaveBeenCalled();
  });
});
