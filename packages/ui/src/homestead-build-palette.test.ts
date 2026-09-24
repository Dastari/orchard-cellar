import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { bootstrapContentRegistry, HEARTH_CONSTRUCTION_TOOLS } from '@orchard/sim';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomesteadBuildPalette, type HomesteadBuildPaletteModel } from './homestead-build-palette.js';
import { GameUiRuntime } from './game-host/runtime.js';
import { uiTestArt, uiTestAsset } from './kit/lab/testing/art.js';
import type { LoadedAsset } from './assets.js';
import type { UiKitArt } from './kit/components/art.js';
import { scrollUiElement } from './kit/layout/scroll.js';

let art: UiKitArt;
const fonts = new WeakMap<object, string>();
let glyphFonts: string[] = [];
function canvas(width: number, height: number) {
  const image = createCanvas(width, height), context = image.getContext('2d'), original = context.drawImage.bind(context);
  context.drawImage = ((...args: Parameters<typeof context.drawImage>) => {
    const font = fonts.get(args[0]);
    if (font && args.length === 9) {
      if (args[3] === 5 && args[4] === 7 || args[3] === 8 && args[4] === 12) glyphFonts.push(font);
      else if (args[3] === args[0].width && args[4] === args[0].height) fonts.set(image, font);
    }
    return original(...args);
  }) as typeof context.drawImage;
  return image;
}
const palettes: HomesteadBuildPalette[] = [];
beforeAll(async () => {
  art = await uiTestArt(); fonts.set(art.pixel.font.image, 'font_5x7'); fonts.set(art.pixel.headerFont.image, 'font_8x12');
  vi.stubGlobal('document', { createElement: (tag: string) => { if (tag !== 'canvas') throw new Error(`Unexpected DOM ${tag}`); return canvas(1, 1); } });
});
afterEach(() => { palettes.splice(0).forEach(palette => palette.dispose()); });
afterAll(() => vi.unstubAllGlobals());
const base: HomesteadBuildPaletteModel = { scope: 'identity:session:home', width: 640, height: 480, furnishing: true,
  counts: {}, upgrades: [], upgradeRanks: {}, balanceBronze: 300000n, residenceRank: 0, residenceOwner: true,
  entries: Array.from({ length: 32 }, (_, index) => ({ itemKind: `piece_${index}`, displayName: `Furniture ${index}`, layer: 'prop', iconAnimation: 'base' })) };
function fixture(model: HomesteadBuildPaletteModel = base, ready?: () => void, artwork: Readonly<Record<string, LoadedAsset>> = {}) {
  const palette = new HomesteadBuildPalette(art, artwork, ready); palettes.push(palette); palette.setModel(model); return palette;
}
function control(palette: HomesteadBuildPalette, id: string) {
  palette.root.arrange();
  const result = palette.root.entries().find(entry => entry.element.id === `build.${id}`)?.element;
  expect(result, id).toBeDefined(); return result!;
}
function key(palette: HomesteadBuildPalette, id: string) {
  const node = control(palette, id);
  if (node.disabled) { expect(palette.root.focus.set(node)).toBe(false); return; }
  palette.root.focus.set(node); palette.root.key({ key: 'Enter' });
}
function point(palette: HomesteadBuildPalette, id: string) {
  const node = control(palette, id);
  for (let parent = node.parent; parent; parent = parent.parent) if (parent.style.overflow?.includes('scroll')) {
    scrollUiElement(parent, 0, parent.scroll.y + node.rect.y - parent.contentRect.y); palette.root.arrange();
  }
  return { x: node.clip.x + Math.min(4, node.clip.width / 2), y: node.clip.y + Math.min(4, node.clip.height / 2) };
}
function click(palette: HomesteadBuildPalette, id: string, pointerType = 'mouse') {
  const p = point(palette, id);
  palette.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0, pointerType });
  palette.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0, pointerType });
}

describe('production build palette retained host', () => {
  it('mounts the actual shared composition, keeps root/controls/focus/scroll across snapshots and collapses furnishing', () => {
    const palette = fixture({ ...base, width: 320, height: 180 });
    expect(palette.root.scale).toBe(1);
    expect(palette.root.entries().some(entry => entry.element.id === 'game.build-palette')).toBe(true);
    const slot = control(palette, 'item.piece_20'), root = palette.root;
    const scroll = control(palette, 'scroll'); scrollUiElement(scroll, 0, 60); palette.root.focus.set(slot);
    palette.setModel({ ...base, width: 320, height: 180, counts: { piece_20: 1 } }); palette.root.arrange();
    expect(palette.root).toBe(root); expect(control(palette, 'item.piece_20')).toBe(slot);
    expect(palette.root.focus.current).toBe(slot); expect(scroll.scroll.y).toBeGreaterThan(0);
    click(palette, 'item.piece_20'); expect(palette.selection).toEqual({ kind: 'place', itemKind: 'piece_20' });
    expect(palette.bounds.height).toBe(100);
    expect(palette.root.pointer({ type: 'down', point: { x: 160, y: 176 }, pointerId: 2, button: 0 })).toBe(false);
    key(palette, 'change'); expect(palette.selection).toEqual({ kind: 'place', itemKind: 'piece_20' });
    expect(palette.bounds.height).toBe(172);
  });

  it('queues one action on pointer release or keyboard, while cancel/outside release never commands', () => {
    const ready = vi.fn(), palette = fixture(base, ready);
    const p = point(palette, 'item.piece_1');
    palette.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 }); expect(ready).not.toHaveBeenCalled();
    palette.setModel({ ...base, counts: { piece_1: 2 } });
    palette.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(ready).toHaveBeenCalledTimes(1);
    key(palette, 'change'); ready.mockClear();
    const next = point(palette, 'item.piece_2');
    palette.root.pointer({ type: 'down', point: next, pointerId: 2, button: 0 });
    palette.root.pointer({ type: 'cancel', point: next, pointerId: 2, button: 0 }); expect(ready).not.toHaveBeenCalled();
    palette.root.pointer({ type: 'down', point: next, pointerId: 3, button: 0 });
    palette.root.pointer({ type: 'up', point: { x: 0, y: 0 }, pointerId: 3, button: 0 }); expect(ready).not.toHaveBeenCalled();
    key(palette, 'move'); expect(ready).toHaveBeenCalledTimes(1); expect(palette.selection).toEqual({ kind: 'move' });
  });

  it('preserves guarded undo and removes stale content selection', () => {
    const palette = fixture(); key(palette, 'undo'); expect(palette.takeUndoMoveRequest()).toBe(false);
    palette.setModel({ ...base, canUndoMove: true }); key(palette, 'undo');
    expect(palette.takeUndoMoveRequest()).toBe(true); expect(palette.takeUndoMoveRequest()).toBe(false);
    palette.setModel({ ...base, furnishing: false, entries: [] }); expect(palette.selection).toEqual({ kind: 'remove' });
    palette.setModel({ ...base, entries: [{ ...base.entries[0]!, itemKind: 'renamed_piece' }] });
    expect(palette.selection).toEqual({ kind: 'place', itemKind: 'renamed_piece' });
  });

  it('uses authoritative construction preview/pending state and resets tools on scope changes', () => {
    const palette = fixture(); key(palette, 'construction');
    for (const tool of HEARTH_CONSTRUCTION_TOOLS) expect(control(palette, `tool.${tool.id}`).label).toBe(tool.label);
    key(palette, 'tool.doorway_ew'); expect(palette.constructionTool).toBe('doorway_ew');
    palette.setModel({ ...base, constructionCanApply: true, constructionStatus: { footprint: 4, materials: ['USE 16 WOOD'], notice: 'Checked on apply' } });
    key(palette, 'apply'); expect(palette.takeConstructionApply()).toBe(true); expect(palette.takeConstructionApply()).toBe(false);
    palette.setModel({ ...base, constructionCanApply: true, constructionPending: true });
    key(palette, 'apply'); key(palette, 'cancel'); expect(palette.takeConstructionApply()).toBe(false); expect(palette.takeConstructionCancel()).toBe(false);
    expect(control(palette, 'change').disabled).toBe(true);
    palette.setModel({ ...base, constructionCanApply: true }); key(palette, 'cancel'); expect(palette.takeConstructionCancel()).toBe(true);
    palette.setModel({ ...base, scope: 'new-session' }); expect(palette.constructionTool).toBeNull();
  });

  it('requires an explicit owner purchase and authoritative rank change; rejection tokens cannot unlock newer requests', () => {
    const palette = fixture(); key(palette, 'expansion'); expect(palette.takeExpansionRequest()).toBeNull();
    click(palette, 'purchase-expansion', 'touch'); const first = palette.takeExpansionRequest()!;
    expect(first).toEqual({ token: 1, rank: 0, scope: base.scope });
    key(palette, 'purchase-expansion'); expect(palette.takeExpansionRequest()).toBeNull();
    palette.expansionFailed('other', 0, first.token); key(palette, 'purchase-expansion'); expect(palette.takeExpansionRequest()).toBeNull();
    palette.expansionFailed(first.scope, first.rank, first.token); key(palette, 'purchase-expansion');
    const second = palette.takeExpansionRequest()!; expect(second.token).toBe(2);
    palette.expansionFailed(first.scope, first.rank, first.token); key(palette, 'purchase-expansion'); expect(palette.takeExpansionRequest()).toBeNull();
    palette.setModel({ ...base, residenceRank: 1, balanceBronze: 240000n }); key(palette, 'purchase-expansion');
    expect(palette.takeExpansionRequest()).toEqual({ token: 3, rank: 1, scope: base.scope });
  });

  it.each([{ residenceOwner: false }, { balanceBronze: 59999n }, { residenceRank: 2 }])('blocks a locked expansion %o', change => {
    const palette = fixture({ ...base, ...change }); key(palette, 'expansion'); key(palette, 'purchase-expansion');
    expect(control(palette, 'purchase-expansion').disabled).toBe(true); expect(palette.takeExpansionRequest()).toBeNull();
  });

  it('does not activate a control captured before reconnect/scope change', () => {
    const ready = vi.fn(), palette = fixture(base, ready), root = palette.root;
    key(palette, 'expansion'); ready.mockClear(); const p = point(palette, 'purchase-expansion');
    root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
    palette.setModel({ ...base, scope: 'another-session' });
    root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 });
    expect(palette.root).toBe(root); expect(palette.takeExpansionRequest()).toBeNull(); expect(ready).not.toHaveBeenCalled();
  });

  it('guards current upgrade costs and drains requests inside the ready callback', () => {
    const upgrade = Object.values(bootstrapContentRegistry().compiled.upgrades)[0]!, requests: string[] = [];
    const palette = fixture({ ...base, furnishing: false, upgrades: [upgrade] }, () => { const request = palette.takePurchaseRequest(); if (request) requests.push(request); });
    key(palette, `upgrade.${upgrade.kind}`); expect(requests).toEqual([upgrade.kind]); expect(palette.takePurchaseRequest()).toBeNull();
    palette.setModel({ ...base, furnishing: false, upgrades: [upgrade], balanceBronze: 0n }); key(palette, `upgrade.${upgrade.kind}`);
    palette.setModel({ ...base, furnishing: false, upgrades: [upgrade], upgradeRanks: { [upgrade.kind]: upgrade.maximumRank } }); key(palette, `upgrade.${upgrade.kind}`);
    expect(requests).toEqual([upgrade.kind]);
  });

  it('uses runtime ownership for outside world input, cancellation, and teardown', () => {
    const ready = vi.fn(), palette = fixture(base, ready), runtime = new GameUiRuntime(); let active = true;
    const unregister = runtime.register({ id: 'build-palette', priority: 1, root: palette.root, active: () => active, blocking: () => false });
    const p = point(palette, 'item.piece_2');
    expect(runtime.pointer({ type: 'down', point: { x: 1, y: 1 }, pointerId: 4, button: 0 })).toBe(false);
    expect(runtime.pointer({ type: 'down', point: p, pointerId: 5, button: 0 })).toBe(true);
    active = false; runtime.reconcile();
    expect(runtime.pointer({ type: 'up', point: p, pointerId: 5, button: 0 })).toBe(true); expect(ready).not.toHaveBeenCalled();
    unregister(); runtime.dispose(); palette.dispose(); expect(palette.root.disposed).toBe(true);
  });

  it('drains one purchase for a held activation key through the production runtime', () => {
    const upgrade = Object.values(bootstrapContentRegistry().compiled.upgrades)[0]!, requests: string[] = [];
    const palette = fixture({ ...base, furnishing: false, upgrades: [upgrade] }, () => {
      const request = palette.takePurchaseRequest(); if (request) requests.push(request);
    });
    const runtime = new GameUiRuntime();
    runtime.register({ id: 'build-palette', priority: 200, root: palette.root, active: () => true, blocking: () => false });
    runtime.focus('build-palette'); palette.root.focus.set(control(palette, `upgrade.${upgrade.kind}`));
    try {
      expect(runtime.key({ key: 'Enter' }, 'build-palette')).toBe(true);
      expect(runtime.key({ key: 'Enter', repeat: true }, 'build-palette')).toBe(true);
      expect(runtime.key({ key: 'Enter', repeat: true }, 'build-palette')).toBe(true);
      expect(requests).toEqual([upgrade.kind]);
      runtime.key({ key: 'Enter', repeat: false }, 'build-palette');
      expect(requests).toEqual([upgrade.kind, upgrade.kind]);
    } finally { runtime.dispose(); }
  });

  it.each([false, true])('arbitrates secondary touch on the actual nonmodal palette (other control: %s)', otherControl => {
    const upgrades = Object.values(bootstrapContentRegistry().compiled.upgrades).slice(0, 2), upgrade = upgrades[0]!, requests: string[] = [];
    const palette = fixture({ ...base, furnishing: false, upgrades }, () => {
      const request = palette.takePurchaseRequest(); if (request) requests.push(request);
    });
    const runtime = new GameUiRuntime();
    runtime.register({ id: 'build-palette', priority: 200, root: palette.root, active: () => true, blocking: () => false });
    const p = point(palette, `upgrade.${upgrade.kind}`), primary = { point: p, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true };
    const secondary = { ...primary, point: otherControl ? point(palette, `upgrade.${upgrades[1]!.kind}`) : p, pointerId: 2, isPrimary: false };
    try {
      expect(runtime.pointer({ ...primary, type: 'down' })).toBe(true);
      expect(runtime.pointer({ ...secondary, type: 'down' })).toBe(true);
      expect(runtime.pointer({ ...secondary, type: 'up' })).toBe(true);
      expect(requests).toEqual([]); expect(runtime.tracksPointer(1)).toBe(true);
      expect(runtime.pointer({ ...primary, type: 'down', pointerId: 3, isPrimary: false, point: { x: 1, y: 1 } })).toBe(false);
      runtime.pointer({ ...primary, type: 'up' }); expect(requests).toEqual([upgrade.kind]);
      runtime.pointer({ ...primary, type: 'down' });
      palette.setModel({ ...base, furnishing: false, upgrades, scope: 'reconnected' });
      runtime.pointer({ ...primary, type: 'up' }); expect(requests).toEqual([upgrade.kind]);
    } finally { runtime.dispose(); }
  });

  it.each(['catalogue', 'empty', 'construction', 'review', 'pending', 'expansion', 'locked', 'error'] as const)('renders real %s art with 5x7 glyphs across compact/wide scales and fractional DPR', view => {
    const directory = process.env['ORCHARD_BUILD_PALETTE_EVIDENCE'];
    for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25]) for (const width of [320, 640]) {
      let model: HomesteadBuildPaletteModel = { ...base, width, height: width === 320 ? 180 : 480,
        entries: view === 'empty' ? [] : [{ ...base.entries[0]!, displayName: 'A very long furnishing name with authoritative quantity' }], counts: { piece_0: 17 }, residenceOwner: view !== 'locked' };
      const palette = fixture(model, undefined, { piece_0: uiTestAsset('prop_cf_furniture_rustic_dining_table', 'props') });
      if (['construction', 'review', 'pending', 'error'].includes(view)) {
        key(palette, 'construction');
        if (view !== 'construction') {
          key(palette, 'tool.doorway_ew');
          model = { ...model, constructionCanApply: view !== 'error', constructionPending: view === 'pending',
            constructionStatus: { footprint: 4, materials: ['Use 16 wood', 'Return 4 stone'], notice: view === 'error' ? 'Doorway support needs clear wall space' : 'Reach, space and bags checked on apply' } };
          palette.setModel(model);
        }
      } else if (view === 'expansion' || view === 'locked') key(palette, 'expansion');
      const image = canvas(Math.round(width * scale * dpr), Math.round((width === 320 ? 180 : 480) * scale * dpr));
      const context = image.getContext('2d'); context.scale(scale * dpr, scale * dpr);
      glyphFonts = [];
      palette.draw(context as unknown as CanvasRenderingContext2D);
      expect(new Set(glyphFonts)).toEqual(new Set(['font_5x7'])); expect(palette.root.scale).toBe(1);
      expect(palette.bounds.x + palette.bounds.width).toBeLessThanOrEqual(width - 4);
      if (directory && dpr === 1.25) { mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/${view}-${width}-scale${scale}.png`, image.toBuffer('image/png')); }
    }
  });
});
