import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { EQUIPMENT_SLOTS, bootstrapContentRegistry, runtimePlayerAppearanceCatalog } from '@orchard/sim';
import { CharacterScreen, cycleAppearanceValue, progressionWindowRect, type CharacterScreenModel } from './character-screen.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import { UI_TEXT_METRICS } from './kit/tokens.js';
import { uiSlot, uiSlotIconRect } from './kit/components/inventory.js';
import { UiRoot } from './kit/runtime/root.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
const screens: CharacterScreen[] = [];
afterEach(() => { screens.splice(0).forEach(screen => screen.dispose()); vi.unstubAllGlobals(); });
const appearance = { hairKind: 'hair_1_brown', shirtKind: 'farmer_green', pantsKind: 'farmer_white_brown', shoesKind: 'brown' } as const;
const catalog = runtimePlayerAppearanceCatalog(bootstrapContentRegistry())!;
function model(): CharacterScreenModel {
  return { playerId: 'self', displayName: 'Mara', appearance, appearanceCatalog: catalog,
    baseAttributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, resolvedAttributes: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    health: 8000, maxHealth: 10000, mana: 5000, maxMana: 10000, vigour: 9000, maxVigour: 10000,
    tracks: [{ track: 'combat', experience: 9007199254740993n }], effects: ['Rested'],
    equipment: EQUIPMENT_SLOTS.map(slot => ({ slot: slot.index, itemKind: 'wood', quantity: 3, durability: 17, lit: false })) };
}
function fixture(setAppearance = vi.fn<(_: CharacterScreenModel['appearance']) => void | Promise<void>>(), width = 640, height = 400) {
  const drawDoll = vi.fn(), drawItem = vi.fn(), navigate = vi.fn(), close = vi.fn();
  const screen = new CharacterScreen(art, { setAppearance }, drawDoll, drawItem, { onNavigate: navigate, onClose: close }); screens.push(screen);
  screen.update(model()); screen.setBounds(progressionWindowRect(width, height), width, height); screen.focus();
  const node = (id: string) => { screen.root.arrange(); return screen.root.entries().find(entry => entry.element.id === id)!.element; };
  const press = (id: string) => { screen.root.focus.set(node(id)); screen.root.key({ key: 'Enter' }); };
  const point = (id: string) => { const element = node(id); screen.root.focus.set(element); screen.root.arrange(); return { x: element.clip.x + element.clip.width / 2, y: element.clip.y + element.clip.height / 2 }; };
  return { screen, node, press, point, drawDoll, drawItem, navigate, close, setAppearance };
}
const nextHair = 'character.appearance.hairKind.next';
describe('production retained character adapter', () => {
  it('keeps full frame bounds inside compact and wide viewports and cycles authored appearance', () => {
    expect(progressionWindowRect(800, 500)).toEqual({ x: 60, y: 55, width: 680, height: 390 });
    for (const [width, height] of [[320, 180], [360, 270], [800, 500]]) { const r = progressionWindowRect(width!, height!); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(width!); expect(r.y + r.height).toBeLessThanOrEqual(height!); }
    expect(cycleAppearanceValue(appearance, catalog, 'hairKind', 1).hairKind).toBe('hair_2_black');
    expect(cycleAppearanceValue(appearance, catalog, 'hairKind', -1).hairKind).toBe('hair_6_brown');
  });
  it('bounds the progression frame at viewport edges and keeps normal layouts byte-for-byte equivalent', () => {
    for (const [width, height] of [[0, 0], [8, 8], [12, 12], [320, 180], [340, 250], [352, 262], [1280, 720]]) {
      const frame = progressionWindowRect(width!, height!);
      expect(frame.width).toBeGreaterThanOrEqual(0); expect(frame.height).toBeGreaterThanOrEqual(0);
      expect(frame.x).toBeGreaterThanOrEqual(0); expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(width!); expect(frame.y + frame.height).toBeLessThanOrEqual(height!);
    }
    for (const width of [352, 360, 480, 680, 800]) for (const height of [262, 270, 390, 500]) {
      const windowWidth = Math.min(680, Math.max(340, width - 12)), windowHeight = Math.min(390, Math.max(250, height - 12));
      expect(progressionWindowRect(width, height)).toEqual({ x: Math.round((width - windowWidth) / 2), y: Math.round((height - windowHeight) / 2), width: windowWidth, height: windowHeight });
    }
  });
  it('issues one appearance command on release and keeps focus/draft across authority updates and resize', () => {
    const f = fixture(), root = f.screen.root, button = f.node(nextHair), p = f.point(nextHair);
    root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 }); expect(f.setAppearance).not.toHaveBeenCalled();
    root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(f.setAppearance).toHaveBeenCalledExactlyOnceWith({ ...appearance, hairKind: 'hair_2_black' });
    f.screen.update({ ...model(), health: 9000 }); f.screen.setBounds(progressionWindowRect(360, 270), 360, 270);
    expect(f.node(nextHair)).toBe(button); expect(root.focus.current).toBe(button); expect(root.scale).toBe(1);
    expect(root.entries().some(entry => entry.element.label === 'BLACK')).toBe(true);
    root.pointer({ type: 'down', point: f.point(nextHair), pointerId: 2, button: 0 }); root.pointer({ type: 'cancel', point: f.point(nextHair), pointerId: 2, button: 0 }); expect(f.setAppearance).toHaveBeenCalledOnce();
  });
  it('rolls back a rejected current preview to latest authority, while ignoring superseded rejections', async () => {
    const rejects: ((reason: Error) => void)[] = [];
    const set = vi.fn<(_: CharacterScreenModel['appearance']) => Promise<void>>(() => new Promise<void>((_resolve, reject) => rejects.push(reject)));
    const f = fixture(set); f.press(nextHair); f.press(nextHair);
    rejects[0]!(new Error('older rejected')); await Promise.resolve();
    const latest = set.mock.calls[1]![0] as CharacterScreenModel['appearance'];
    const latestLabel = latest.hairKind.replace(/^hair_\d+_/, '').toUpperCase();
    expect(f.screen.root.entries().some(entry => entry.element.label === latestLabel)).toBe(true);
    f.screen.update({ ...model(), appearance: { ...appearance, hairKind: 'hair_6_brown' } });
    rejects[1]!(new Error('latest rejected')); await Promise.resolve(); f.screen.root.arrange();
    expect(f.screen.root.entries().some(entry => entry.element.label === 'BROWN')).toBe(true);
    f.press(nextHair); expect(set).toHaveBeenLastCalledWith(appearance);
  });
  it('follows external appearance authority when no preview is pending', () => {
    const f = fixture();
    const next = { ...appearance, hairKind: 'hair_3_blonde' };
    f.screen.update({ ...model(), appearance: next });
    f.press(nextHair);
    expect(f.setAppearance).toHaveBeenLastCalledWith(cycleAppearanceValue(next, catalog, 'hairKind', 1));
  });
  it('follows later authority after rejecting the latest preview even when an older request succeeds', async () => {
    const requests: { resolve: () => void; reject: (error: Error) => void }[] = [];
    const set = vi.fn<(_: CharacterScreenModel['appearance']) => Promise<void>>(() => new Promise<void>((resolve, reject) => requests.push({ resolve, reject })));
    const f = fixture(set); f.press(nextHair); f.press(nextHair);
    requests[1]!.reject(new Error('latest refused')); await Promise.resolve();
    requests[0]!.resolve(); await Promise.resolve();
    const accepted = set.mock.calls[0]![0];
    f.screen.update({ ...model(), appearance: accepted }); f.press(nextHair);
    expect(set).toHaveBeenLastCalledWith(cycleAppearanceValue(accepted, catalog, 'hairKind', 1));
  });
  it('preserves pending intent through old acceptance and echoes, then follows later settled authority', async () => {
    const requests: { resolve: () => void; reject: (error: Error) => void }[] = [];
    const set = vi.fn<(_: CharacterScreenModel['appearance']) => Promise<void>>(() => new Promise<void>((resolve, reject) => requests.push({ resolve, reject })));
    const f = fixture(set); f.press(nextHair); f.press(nextHair);
    const newest = set.mock.calls[1]![0];
    requests[0]!.resolve(); await Promise.resolve();
    f.screen.update({ ...model(), appearance: set.mock.calls[0]![0] });
    f.screen.root.focus.set(null); scrollUiElement(f.node('character.content'), 0, 0);
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    const paint = () => { f.drawDoll.mockClear(); f.screen.draw(createCanvas(640,400).getContext('2d') as unknown as CanvasRenderingContext2D); return f.drawDoll.mock.calls[0]![1]; };
    expect(paint()).toEqual(newest);
    requests[1]!.resolve(); await Promise.resolve();
    f.screen.update({ ...model(), health: 9000 }); expect(paint()).toEqual(newest);
    f.screen.update({ ...model(), appearance: newest }); expect(paint()).toEqual(newest);
    const external = { ...appearance, hairKind: 'hair_6_brown' };
    f.screen.update({ ...model(), appearance: external }); expect(paint()).toEqual(external);
  });
  it('reconciles a settled request with a differing authoritative result', async () => {
    let resolve!: () => void;
    const f = fixture(vi.fn(() => new Promise<void>(accept => { resolve = accept; })));
    f.press(nextHair); resolve(); await Promise.resolve();
    const authoritative = { ...appearance, hairKind: 'hair_6_brown' };
    f.screen.update({ ...model(), appearance: authoritative }); f.press(nextHair);
    expect(f.setAppearance).toHaveBeenLastCalledWith(cycleAppearanceValue(authoritative, catalog, 'hairKind', 1));
  });
  it('ignores previous-player completions while the new player has pending intent', async () => {
    const requests: { resolve: () => void; reject: (error: Error) => void }[] = [];
    const set = vi.fn<(_: CharacterScreenModel['appearance']) => Promise<void>>(() => new Promise<void>((resolve,reject) => requests.push({resolve,reject})));
    const f = fixture(set); f.press(nextHair);
    const other = { ...model(), playerId: 'other', appearance: { ...appearance, hairKind: 'hair_4_red' } };
    f.screen.update(other); f.press(nextHair); const pending = set.mock.calls[1]![0];
    requests[0]!.reject(new Error('previous player')); await Promise.resolve();
    f.screen.update({ ...other, health: 9000 }); f.press(nextHair);
    expect(set).toHaveBeenLastCalledWith(cycleAppearanceValue(pending, catalog, 'hairKind', 1));
  });
  it('ignores a stale failure after authority acknowledges a newer request', async () => {
    const rejects: ((error: Error) => void)[] = [];
    const set = vi.fn<(_: CharacterScreenModel['appearance']) => Promise<void>>(() => new Promise<void>((_resolve,reject) => rejects.push(reject)));
    const f = fixture(set); f.press(nextHair); f.press(nextHair);
    const accepted = set.mock.calls[1]![0];
    f.screen.update({ ...model(), appearance: accepted });
    rejects[0]!(new Error('old refused')); rejects[1]!(new Error('late transport failure after snapshot')); await Promise.resolve();
    const external = { ...appearance, hairKind: 'hair_6_brown' };
    f.screen.update({ ...model(), appearance: external }); f.press(nextHair);
    expect(set).toHaveBeenLastCalledWith(cycleAppearanceValue(external, catalog, 'hairKind', 1));
  });
  it('preserves the default slot durability renderer when content is not overridden', () => {
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    const root = new UiRoot({ art, scale: 1 });
    const slot = uiSlot({ stack: { itemKind: 'axe', quantity: 1 } }); root.mount(slot); root.resize(28,31); root.arrange();
    const context = createCanvas(28,31).getContext('2d'); const fill = vi.spyOn(context,'fillRect');
    // The wear track: 5px in from the sides, 8px above the foot (owner position B), 3px tall.
    try { root.drawInContext(context as unknown as CanvasRenderingContext2D); expect(fill).toHaveBeenCalledWith(slot.rect.x+5,slot.rect.y+slot.rect.height-8,slot.rect.width-10,3); }
    finally { root.dispose(); }
  });
  it('paints worn equipment content once through the authoritative renderer', () => {
    const f = fixture();
    f.screen.update({ ...model(), equipment: [{ slot: 0, itemKind: 'axe', quantity: 3, durability: 17, lit: false }] });
    f.screen.root.focus.set(null); scrollUiElement(f.node('character.content'), 0, 0); f.screen.root.arrange();
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    const context = createCanvas(640, 400).getContext('2d');
    const fill = vi.spyOn(context, 'fillRect');
    f.screen.draw(context as unknown as CanvasRenderingContext2D);
    const bounds = f.node('character.equipment.slot.0').rect;
    // The custom renderer draws only the icon, into the slot's icon well; the slot draws the one wear track.
    const tracks = fill.mock.calls.filter(([x,y,,height]) => x === bounds.x + 5 && y === bounds.y + bounds.height - 8 && height === 3);
    expect(tracks).toHaveLength(1);
    expect(f.drawItem).toHaveBeenCalledExactlyOnceWith(expect.anything(), uiSlotIconRect(bounds), expect.objectContaining({ itemKind: 'axe', quantity: 3, durability: 17, lit: false }));
  });
  it('reads equipment wear from the live registry for items only published or Studio content defines', () => {
    const bootstrap = bootstrapContentRegistry(), source = bootstrap.items.get('item:iron_axe')!;
    const live = { ...bootstrap, items: new Map(bootstrap.items) };
    live.items.set('item:studio_blade', { ...source, id: 'item:studio_blade', durability: { ...source.durability!, max: 100 } });
    expect(bootstrap.items.has('item:studio_blade')).toBe(false);
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    const tracks = (registry?: typeof live) => {
      const screen = new CharacterScreen(art, { setAppearance: vi.fn() }, vi.fn(), vi.fn(), {}, registry && (() => registry)); screens.push(screen);
      screen.update({ ...model(), equipment: [{ slot: 0, itemKind: 'studio_blade', quantity: 1, durability: 25, lit: true }] });
      screen.setBounds(progressionWindowRect(640, 400), 640, 400); screen.root.arrange();
      const context = createCanvas(640, 400).getContext('2d'), fill = vi.spyOn(context, 'fillRect');
      screen.draw(context as unknown as CanvasRenderingContext2D);
      const bounds = screen.root.entries().find(entry => entry.element.id === 'character.equipment.slot.0')!.element.rect;
      return fill.mock.calls.filter(([x, y, , height]) => x === bounds.x + 5 && y === bounds.y + bounds.height - 8 && height === 3).length;
    };
    // The bootstrap fallback knows nothing of the Studio-only blade; the live registry gives it a wear bar.
    expect(tracks()).toBe(0);
    expect(tracks(live)).toBe(1);
  });
  it('cancels stale player gestures and clears pending preview across disconnect/reconnect', async () => {
    let reject!: (error: Error) => void;
    const f = fixture(vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; })));
    f.press(nextHair); const p = f.point(nextHair); f.screen.root.pointer({ type: 'down', point: p, pointerId: 2, button: 0 });
    f.screen.update(null); expect(f.screen.active).toBe(false); const root = f.screen.root;
    f.screen.update({ ...model(), playerId: 'new' }); f.screen.setBounds(progressionWindowRect(640, 400), 640, 400); f.screen.focus();
    f.screen.root.pointer({ type: 'up', point: p, pointerId: 2, button: 0 }); expect(f.setAppearance).toHaveBeenCalledOnce();
    reject(new Error('old connection')); await Promise.resolve(); expect(f.screen.root).toBe(root); expect(f.screen.active).toBe(true);
    f.press(nextHair); expect(f.setAppearance).toHaveBeenLastCalledWith({ ...appearance, hairKind: 'hair_2_black' });
  });
  it('paints authoritative equipment through the existing read-only renderer and real portrait callback', () => {
    const f = fixture(); f.screen.root.focus.set(null); scrollUiElement(f.node('character.content'), 0, 0); f.screen.root.arrange();
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    f.screen.draw(createCanvas(640, 400).getContext('2d') as unknown as CanvasRenderingContext2D);
    expect(f.drawDoll).toHaveBeenCalled(); expect(f.drawDoll.mock.calls[0]![1]).toEqual(appearance);
    expect(f.drawItem).toHaveBeenCalledTimes(10); expect(f.drawItem.mock.calls.map(call => call[2].slot).sort()).toEqual(EQUIPMENT_SLOTS.map(slot => slot.index).sort());
    expect(f.drawItem.mock.calls[0]![2]).toMatchObject({ quantity: 3, durability: 17, lit: false });
    const slots = f.screen.root.entries().filter(entry => entry.element.kind === 'slot'); expect(slots).toHaveLength(10);
    expect(slots.every(entry => !entry.element.focusable)).toBe(true);
  });
  it('delegates navigation/close and preserves compact scrolling and long labels', () => {
    const f = fixture(undefined, 320, 180); f.screen.update({ ...model(), displayName: 'A very long character name '.repeat(3), effects: ['A long effect '.repeat(10)] }); f.screen.root.arrange();
    expect(f.node('character.content').scroll.maxY).toBeGreaterThan(0);
    const stats = f.screen.root.entries().find(entry => entry.element.id === 'book.tab.statistics')!.element;
    f.screen.root.focus.set(stats); f.screen.root.key({ key: 'Enter' }); expect(f.navigate).toHaveBeenCalledExactlyOnceWith('statistics');
    f.screen.root.key({ key: 'Escape' }); expect(f.close).toHaveBeenCalledOnce();
  });
  it('ignores key auto-repeat and gives a primary touch scroll sole ownership of an appearance gesture', () => {
    const f = fixture(undefined, 320, 180), root = f.screen.root;
    f.press(nextHair); root.key({ key: 'Enter', repeat: true }); expect(f.setAppearance).toHaveBeenCalledOnce();
    const point = f.point(nextHair), focused = root.focus.current;
    root.pointer({ type: 'down', point, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    const close = root.entries().find(entry => entry.element.label === 'Close book')!.element;
    const other = { x: close.clip.x + 5, y: close.clip.y + 5 };
    root.pointer({ type: 'down', point: other, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
    expect(root.focus.current).toBe(focused);
    root.pointer({ type: 'up', point: other, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false }); expect(f.close).not.toHaveBeenCalled();
    const moved = { x: point.x, y: point.y - 12 };
    root.pointer({ type: 'move', point: moved, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    root.pointer({ type: 'up', point: moved, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    expect(f.setAppearance).toHaveBeenCalledOnce();
  });
  it.each([1, 2, 3])('renders compact/wide layouts at UI scale %s and fractional DPR', scale => {
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    for (const [width, height] of [[320, 180], [640, 400]]) {
      const f = fixture(undefined, width!, height!);
      const canvas = createCanvas(Math.round(width! * scale * 1.25), Math.round(height! * scale * 1.25)), context = canvas.getContext('2d');
      context.scale(scale * 1.25, scale * 1.25); f.screen.draw(context as unknown as CanvasRenderingContext2D);
      const button = f.node(nextHair); expect(button.clip.height).toBe(button.rect.height); expect(button.clip.width).toBe(button.rect.width);
      for (const { element } of f.screen.root.entries()) if (element.kind === 'text') {
        expect(UI_TEXT_METRICS[element.props['role'] as keyof typeof UI_TEXT_METRICS].font).toBe('body');
      }
    }
  });
});
