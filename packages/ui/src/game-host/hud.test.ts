import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { bootstrapContentRegistry } from '@orchard/sim';
import { GameHud, gameHudArrangement, gameHudCharacterTop, type GameHudModel, type GameHudSurface } from './hud.js';
import { uiPurseWidth } from '../kit/components/purse.js';
import { touchControlLayout } from '../touch-control-layout.js';
import { TouchControls } from '../touch-controls.js';
import { QuestTracker } from '../quest-tracker.js';
import { scrollUiElement } from '../kit/layout/scroll.js';
import { GameUiRuntime } from './runtime.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiTestArt } from '../kit/lab/testing/art.js';
import type { UiElement } from '../kit/runtime/element.js';
let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
const hosts: GameHud[] = [];
afterEach(() => { hosts.splice(0).forEach(host => host.dispose()); vi.useRealTimers(); });
function model(): GameHudModel {
  return { sessionKey: 'session-a', zone: { title: 'ORCHARD', onlineCount: 2, moon: { phase: 3, label: 'Waxing moon' } }, minimapTrackingEnabled: true,
    inventory: { rows: [{ slot: 0, stack: { itemKind: 'wood', quantity: 123 } }, { slot: 42, stack: { itemKind: 'stone_axe', quantity: 1, durability: 12 } }], selectedSlot: 0, mainHandIndex: 42, balanceBronze: 9007199254740993n },
    player: { id: 'self', values: { health: 8000, maxHealth: 10000, mana: 2500, maxMana: 10000, vigour: 3000, maxVigour: 10000 }, hunger: { current: 2000, maximum: 10000 } },
    target: { id: 'target-a', name: 'A very long authoritative creature name', values: { health: 8, maxHealth: 10 } },
    effects: [{ id: 'tea', effectKind: 'orchard_tea', name: 'Orchard tea', remainingTicks: 200, durationTicks: 1000, stacks: 2 }], ticksPerSecond: 20,
    controls: { build: true },
  };
}
function fixture(width = 320, height = 180) {
  const callbacks = { selectHotbar: vi.fn(), toggleInventory: vi.fn(), toggleCrafting: vi.fn(), toggleBuild: vi.fn(), openSystem: vi.fn(), openOnlinePlayers: vi.fn(), clearTarget: vi.fn(), focusSurface: vi.fn<(surface: GameHudSurface) => void>() };
  const painters = { itemLabel: (stack: { itemKind: string; quantity: number }) => `${stack.itemKind} x${stack.quantity}`, drawItem: vi.fn(), drawPlayerHead: vi.fn(), drawTargetPortrait: vi.fn(), drawMinimap: vi.fn(), drawMoon: vi.fn(), drawEffect: vi.fn() };
  const host = new GameHud(art, callbacks, painters); hosts.push(host); host.resize(width, height); host.update(model());
  const node = (surface: GameHudSurface, id: string) => { host.roots[surface].arrange(); const entry = host.roots[surface].entries().find(row => row.element.id === id); expect(entry, id).toBeDefined(); return entry!.element; };
  const point = (element: UiElement) => ({ x: element.clip.x + element.clip.width / 2, y: element.clip.y + element.clip.height / 2 });
  const click = (surface: GameHudSurface, id: string, pointerId = 1) => { const p = point(node(surface, id)), root = host.roots[surface]; root.pointer({ type: 'down', point: p, pointerId, button: 0 }); root.pointer({ type: 'up', point: p, pointerId, button: 0 }); };
  return { host, callbacks, painters, node, point, click };
}
describe('production shared HUD compositions', () => {
  it('routes one selection command and displays only the supplied optimistic/authoritative selection, including rejection', () => {
    const f = fixture(), root = f.host.roots.hotbarVitals;
    f.click('hotbarVitals', 'game.hud.hotbar.slot.2'); expect(f.callbacks.selectHotbar).toHaveBeenCalledExactlyOnceWith(2);
    expect(f.node('hotbarVitals', 'game.hud.hotbar.slot.0').props['selected']).toBe(true);
    const next = model(); f.host.update({ ...next, inventory: { ...next.inventory, selectedSlot: 2 } });
    expect(f.node('hotbarVitals', 'game.hud.hotbar.slot.2').props['selected']).toBe(true);
    f.host.update(model()); expect(f.node('hotbarVitals', 'game.hud.hotbar.slot.0').props['selected']).toBe(true);
    const cell = f.node('hotbarVitals', 'game.hud.hotbar.slot.2'); root.focus.set(cell);
    expect(root.key({ key: '4' })).toBe(false); expect(root.key({ key: 'v' })).toBe(false); expect(f.callbacks.selectHotbar).toHaveBeenCalledTimes(1);
    root.key({ key: 'Enter', repeat: true }); expect(f.callbacks.selectHotbar).toHaveBeenCalledTimes(1);
    root.key({ key: 'Enter' }); expect(f.callbacks.selectHotbar).toHaveBeenCalledTimes(2);
    f.click('hotbarVitals', 'game.hud.weapon'); expect(f.callbacks.selectHotbar).toHaveBeenLastCalledWith(42);
  });
  it('shows the classic target frame without a clear button; its name sits just above the frame', () => {
    const f = fixture(640, 360), root = f.host.roots.targetEffects; root.arrange();
    expect(root.entries().some(row => row.element.id === 'game.hud.clear-target')).toBe(false);
    const frame = f.node('targetEffects', 'game.hud.target'), name = f.node('targetEffects', 'game.hud.target-name');
    expect(name.rect.y + name.rect.height).toBeLessThanOrEqual(frame.rect.y); expect(frame.rect.y - (name.rect.y + name.rect.height)).toBeLessThanOrEqual(2);
    expect(name.rect.x + name.rect.width).toBe(frame.rect.x + frame.rect.width);
  });
  it('retains map focus and zoom on harmless snapshots, clamps endpoints, and scopes collapse/online commands', () => {
    const f = fixture(), root = f.host.roots.zoneMinimap, zoom = f.node('zoneMinimap', 'hud.minimap.zoom-in');
    root.focus.set(zoom); root.key({ key: 'Enter' }); f.host.update({ ...model(), zone: { ...model().zone, onlineCount: 5 } });
    expect(root.focus.current).toBe(zoom); expect(root.entries().some(row => row.element.label === 'MAP 3X')).toBe(true);
    root.key({ key: 'Enter' }); expect(zoom.disabled).toBe(true); expect(root.entries().some(row => row.element.label === 'MAP 4X')).toBe(true);
    f.click('zoneMinimap', 'hud.online-players'); expect(f.callbacks.openOnlinePlayers).toHaveBeenCalledOnce();
    f.click('zoneMinimap', 'hud.zone'); expect(f.node('zoneMinimap', 'hud.zone.expand')).toBe(root.focus.current);
    expect(f.host.minimapBounds.width).toBe(128); f.click('zoneMinimap', 'hud.minimap'); expect(f.host.minimapBounds.width).toBe(28);
    expect(root.focus.current).toBe(f.node('zoneMinimap', 'hud.minimap.expand')); root.key({ key: 'Enter' }); expect(f.host.minimapBounds.width).toBe(128);
  });
  it('keeps background drawing separate from input eligibility and passes uncovered world gestures through', () => {
    const f = fixture(), runtime = new GameUiRuntime(); let eligible = true;
    for (const surface of Object.keys(f.host.roots) as GameHudSurface[]) runtime.register({ id: surface, priority: 10, root: f.host.roots[surface], active: () => eligible && f.host.isVisible(surface), blocking: () => false });
    expect(runtime.pointer({ type: 'down', point: { x: 180, y: 45 }, pointerId: 1, button: 0, pointerType: 'touch' })).toBe(false);
    const p = f.point(f.node('hotbarVitals', 'game.hud.hotbar.slot.0'));
    expect(runtime.pointer({ type: 'down', point: p, pointerId: 2, button: 0, pointerType: 'touch' })).toBe(true);
    eligible = false; runtime.reconcile(); expect(f.host.isVisible('hotbarVitals')).toBe(true);
    expect(runtime.pointer({ type: 'up', point: p, pointerId: 2, button: 0, pointerType: 'touch' })).toBe(true);
    expect(f.callbacks.selectHotbar).toHaveBeenCalledOnce();
    f.host.draw(createCanvas(320, 180).getContext('2d') as unknown as CanvasRenderingContext2D); expect(f.painters.drawPlayerHead).toHaveBeenCalled(); runtime.dispose();
  });
  it('scrolls long effect strips by touch and wheel without changing authority, with secondary touches isolated', () => {
    const f = fixture(), root = f.host.roots.targetEffects, effects = Array.from({ length: 12 }, (_, index) => ({ ...model().effects[0]!, id: `effect-${index}` }));
    f.host.update({ ...model(), effects, zone: { ...model().zone, watch: { time: '06:00', date: 'Spring 1', moon: 'Full' } } });
    const strip = f.node('targetEffects', 'game.hud.effect-scroll'), start = { x: strip.rect.x + 60, y: strip.rect.y + 10 };
    expect(strip.scroll.maxX).toBeGreaterThan(100);
    root.pointer({ type: 'down', point: start, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    const focus = root.focus.current;
    root.pointer({ type: 'down', point: f.point(f.node('targetEffects', 'game.hud.target')), pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
    root.pointer({ type: 'move', point: { x: start.x - 30, y: start.y }, pointerId: 1, button: 0, pointerType: 'touch' }); root.arrange();
    expect(strip.scroll.x).toBe(30); expect(root.focus.current).toBe(focus);
    root.pointer({ type: 'up', point: start, pointerId: 2, button: 0, pointerType: 'touch' }); expect(f.callbacks.clearTarget).not.toHaveBeenCalled();
    root.pointer({ type: 'up', point: start, pointerId: 1, button: 0, pointerType: 'touch' });
    root.wheel({ point: start, deltaX: 0, deltaY: 20 }); root.arrange(); expect(strip.scroll.x).toBe(50);
    f.host.update({ ...model(), effects }); expect(strip.scroll.x).toBe(50); expect(effects[0]!.remainingTicks).toBe(200);
  });
  it('reads hotbar wear from the live registry for items only published or Studio content defines', () => {
    const bootstrap = bootstrapContentRegistry(), source = bootstrap.items.get('item:iron_axe')!;
    const live = { ...bootstrap, items: new Map(bootstrap.items) };
    live.items.set('item:studio_blade', { ...source, id: 'item:studio_blade', durability: { ...source.durability!, max: 100 } });
    expect(bootstrap.items.has('item:studio_blade')).toBe(false);
    const tracks = (registry?: typeof live) => {
      const callbacks = { selectHotbar: vi.fn(), toggleInventory: vi.fn(), toggleCrafting: vi.fn(), toggleBuild: vi.fn(), openSystem: vi.fn(), openOnlinePlayers: vi.fn(), clearTarget: vi.fn(), focusSurface: vi.fn() };
      const painters = { itemLabel: () => 'BLADE', drawItem: vi.fn(), drawPlayerHead: vi.fn(), drawTargetPortrait: vi.fn(), drawMinimap: vi.fn(), drawMoon: vi.fn(), drawEffect: vi.fn(),
        ...(registry ? { contentRegistry: () => registry } : {}) };
      const host = new GameHud(art, callbacks, painters); hosts.push(host); host.resize(320, 180);
      const base = model(); host.update({ ...base, inventory: { ...base.inventory, rows: [{ slot: 1, stack: { itemKind: 'studio_blade', quantity: 1, durability: 25 } }] } });
      const context = createCanvas(320, 180).getContext('2d'), fill = vi.spyOn(context, 'fillRect');
      host.draw(context as unknown as CanvasRenderingContext2D);
      host.roots.hotbarVitals.arrange();
      const slot = host.roots.hotbarVitals.entries().find(row => row.element.id === 'game.hud.hotbar.slot.1')!.element.rect;
      return fill.mock.calls.filter(([x, y, , height]) => x === slot.x + 5 && y === slot.y + slot.height - 7 && height === 3).length;
    };
    // The bootstrap fallback knows nothing of the Studio-only blade; the live registry gives it a wear bar.
    expect(tracks()).toBe(0);
    expect(tracks(live)).toBe(1);
  });
  it('uses actual item, portrait, moon, map and effect painters once, preserving stack metadata and authoritative time', () => {
    vi.useFakeTimers(); const f = fixture(), context = createCanvas(320, 180).getContext('2d') as unknown as CanvasRenderingContext2D;
    f.host.draw(context);
    expect(f.painters.drawItem.mock.calls.map(call => call[2])).toEqual(model().inventory.rows.map(row => row.stack));
    expect(f.painters.drawPlayerHead).toHaveBeenCalledExactlyOnceWith(context, 'self', expect.any(Object));
    expect(f.painters.drawTargetPortrait).toHaveBeenCalledExactlyOnceWith(context, 'target-a', expect.any(Object));
    expect(f.painters.drawMinimap).toHaveBeenCalledExactlyOnceWith(context, expect.any(Object), 2, true);
    expect(f.painters.drawMoon).toHaveBeenCalledExactlyOnceWith(context, expect.any(Object), 3);
    expect(f.painters.drawEffect).toHaveBeenCalledExactlyOnceWith(context, expect.any(Object), 'orchard_tea');
    const effect = f.node('targetEffects', 'game.hud.effects:tea'); expect(effect.label).toBe('Orchard tea x2 10s');
    vi.advanceTimersByTime(60000); f.host.draw(context); expect(effect.label).toBe('Orchard tea x2 10s');
    f.host.update({ ...model(), effects: [{ ...model().effects[0]!, remainingTicks: 21 }] }); expect(effect.label).toBe('Orchard tea x2 2s');
  });
  it('shows watch details only when supplied and keeps actual item/resource tooltips and bigint currency', () => {
    const f = fixture(), zoneRoot = f.host.roots.zoneMinimap, hotRoot = f.host.roots.hotbarVitals;
    expect(zoneRoot.entries().some(row => row.element.kind === 'badge')).toBe(false);
    f.host.update({ ...model(), zone: { ...model().zone, watch: { time: '06:00', date: 'Spring 1', moon: 'Full moon' } } });
    expect(zoneRoot.entries().some(row => row.element.kind === 'badge' && row.element.label === '06:00 Spring 1 Full moon')).toBe(true);
    hotRoot.focus.set(f.node('hotbarVitals', 'game.hud.hotbar.slot.0')); hotRoot.arrange();
    // The hotbar tip names the item in caps, centred just above the focused slot (not the bar's corner).
    expect(hotRoot.entries().some(row => row.element.label === 'WOOD X123' && row.element.kind === 'text')).toBe(true);
    const slot = f.node('hotbarVitals', 'game.hud.hotbar.slot.0').rect;
    const popup = hotRoot.entries().find(row => row.element.kind === 'tooltip-popup' && row.element.visible)!.element.rect;
    expect(popup.y + popup.height).toBeLessThanOrEqual(slot.y);
    expect(Math.abs(popup.x + popup.width / 2 - (slot.x + slot.width / 2))).toBeLessThanOrEqual(1);
    // It follows focus to the next filled slot and closes over an empty one.
    f.host.update({ ...model(), inventory: { ...model().inventory, rows: [...model().inventory.rows, { slot: 3, stack: { itemKind: 'stone', quantity: 4 } }] } });
    const context = createCanvas(320, 180).getContext('2d') as unknown as CanvasRenderingContext2D;
    hotRoot.focus.set(f.node('hotbarVitals', 'game.hud.hotbar.slot.3')); f.host.draw(context);
    const fourth = f.node('hotbarVitals', 'game.hud.hotbar.slot.3').rect;
    const moved = hotRoot.entries().find(row => row.element.kind === 'tooltip-popup' && row.element.visible)!.element.rect;
    expect(Math.abs(moved.x + moved.width / 2 - (fourth.x + fourth.width / 2))).toBeLessThanOrEqual(1);
    expect(hotRoot.entries().some(row => row.element.label === 'STONE X4' && row.element.kind === 'text')).toBe(true);
    // It re-fits to each label: a longer name widens the frame instead of wrapping or clipping in the first size.
    expect(moved.width).toBeLessThan(popup.width + 1);
    f.host.update({ ...model(), inventory: { ...model().inventory, rows: [...model().inventory.rows, { slot: 3, stack: { itemKind: 'reinforced_iron_pickaxe', quantity: 1 } }] } });
    f.host.draw(context);
    const long = hotRoot.entries().find(row => row.element.kind === 'tooltip-popup' && row.element.visible)!.element;
    const longText = hotRoot.entries().find(row => row.element.label === 'REINFORCED_IRON_PICKAXE X1' && row.element.kind === 'text')!.element;
    expect(long.rect.width).toBeGreaterThan(moved.width);
    expect(longText.rect.height).toBeLessThanOrEqual(long.rect.height);
    expect(long.scroll.maxY).toBe(0);
    hotRoot.focus.set(f.node('hotbarVitals', 'game.hud.hotbar.slot.5')); f.host.draw(context);
    expect(hotRoot.entries().some(row => row.element.kind === 'tooltip-popup' && row.element.visible)).toBe(false);
    hotRoot.focus.set(f.node('hotbarVitals', 'game.hud.player:health')); hotRoot.arrange();
    expect(hotRoot.entries().some(row => row.element.label === 'HEALTH 80.0 / 100.0')).toBe(true);
    expect(f.node('hotbarVitals', 'game.hud.purse').props['balance']).toBe(9007199254740993n);
    f.host.update(model()); expect(zoneRoot.entries().some(row => row.element.kind === 'badge')).toBe(false);
  });
  it('keeps compact target actions clear of the map, currency and shortcuts with a watch equipped', () => {
    const f = fixture(); f.host.update({ ...model(), zone: { ...model().zone, watch: { time: '06:00', date: 'Spring 1', moon: 'Full moon' } } });
    const intersects = (a: UiElement, b: UiElement) => a.rect.x < b.rect.x + b.rect.width && a.rect.x + a.rect.width > b.rect.x && a.rect.y < b.rect.y + b.rect.height && a.rect.y + a.rect.height > b.rect.y;
    const target = ['game.hud.target-name', 'game.hud.target'].map(id => f.node('targetEffects', id));
    const shortcuts = ['game.hud.weapon', 'game.hud.crafting', 'game.hud.build', 'game.hud.system', 'game.hud.purse'].map(id => f.node('hotbarVitals', id));
    for (const name of target) for (const button of shortcuts) expect(intersects(name, button), `${name.id}/${button.id}`).toBe(false);
    const root = f.host.roots.targetEffects; root.focus.set(target[0]!); root.arrange();
    expect(root.entries().some(row => row.element.kind === 'text' && row.element.label === model().target!.name)).toBe(true);
  });
  it.each([1, 2, 3])('keeps actionable compact/wide geometry in logical bounds at host scale %i and fractional DPR', scale => {
    for (const [width, height] of [[320, 180], [800, 500]]) {
      const f = fixture(width, height), canvas = createCanvas(Math.round(width! * scale * 1.25), Math.round(height! * scale * 1.25));
      const ctx = canvas.getContext('2d'); ctx.scale(scale * 1.25, scale * 1.25); f.host.draw(ctx as unknown as CanvasRenderingContext2D);
      for (const root of Object.values(f.host.roots)) {
        expect(root.scale).toBe(1);
        for (const { element } of root.entries()) if (element.focusable && !element.disabled) {
          expect(element.rect.width, element.id).toBeGreaterThan(0); expect(element.rect.height, element.id).toBeGreaterThan(0);
          expect(element.clip, element.id).toEqual(element.rect);
        }
      }
      const slots = f.host.roots.hotbarVitals.entries().filter(row => row.element.id.startsWith('game.hud.hotbar.slot.'));
      // The classic hotbar wraps to two rows of five below 420 logical px.
      expect(slots).toHaveLength(10); expect(new Set(slots.map(row => row.element.rect.y)).size).toBe(width! < 420 ? 2 : 1);
    }
  });
});


describe('desktop HUD arrangement', () => {
  it.each([[480, 270], [640, 360], [960, 540]])('gives keyboard play the approved one-row HUD at the game\'s desktop logical size %sx%s', (width, height) => {
    const f = fixture(width, height), node = (id: string) => f.node('hotbarVitals', id);
    const slot = node('game.hud.hotbar.slot.0'), system = node('game.hud.system'), crafting = node('game.hud.crafting'), weapon = node('game.hud.weapon');
    // The shortcuts are small round buttons anchored to the bottom-left corner, clear of the hotbar.
    for (const control of [system, crafting, weapon]) { expect(control.rect, control.id).toMatchObject({ width: 25, height: 28 }); expect(control.rect.x + control.rect.width).toBeLessThan(slot.rect.x); }
    expect(system.rect.x).toBe(6); expect(Math.max(...[system, crafting, weapon].map(control => control.rect.y + control.rect.height))).toBe(height - 6);
    // The character card and purse never overlap the row.
    const intersects = (a: UiElement, b: UiElement) => a.rect.x < b.rect.x + b.rect.width && a.rect.x + a.rect.width > b.rect.x && a.rect.y < b.rect.y + b.rect.height && a.rect.y + a.rect.height > b.rect.y;
    for (const id of ['game.hud.character', 'game.hud.purse']) for (const control of [system, crafting, slot, weapon]) expect(intersects(node(id), control), `${id}/${control.id}`).toBe(false);
  });
  it.each([[480, 270], [640, 360], [960, 540]])('keeps the classic placement at %sx%s: cards over the hotbar ends, purse in the corner', (width, height) => {
    const f = fixture(width, height), node = (id: string) => f.node('hotbarVitals', id);
    f.host.update({ ...model(), inventory: { ...model().inventory, balanceBronze: 33_912n } });
    const first = node('game.hud.hotbar.slot.0'), last = node('game.hud.hotbar.slot.9');
    const card = node('game.hud.character'), target = f.node('targetEffects', 'game.hud.target'), purse = node('game.hud.purse');
    // Player card directly above the hotbar's left end, target card level with it above the right end.
    expect(card.rect.x).toBe(first.rect.x); expect(card.rect.y + card.rect.height).toBe(first.rect.y - 4);
    expect([card.rect.width, card.rect.height, target.rect.width, target.rect.height]).toEqual([72, 29, 72, 29]);
    expect(target.rect.y).toBe(card.rect.y); expect(target.rect.x + target.rect.width).toBeLessThanOrEqual(last.rect.x + last.rect.width);
    expect(target.rect.x).toBeGreaterThanOrEqual(card.rect.x + card.rect.width);
    // Purse and bag button hug the right edge with every coin shown; it only rises above the row when the corner is too narrow.
    expect(purse.rect.x + purse.rect.width).toBe(width - 8); expect(purse.rect.width).toBe(uiPurseWidth(33_912n));
    if (width >= 640) expect(purse.rect.y + purse.rect.height).toBe(height - 6);
    else expect(purse.rect.y + purse.rect.height).toBeLessThanOrEqual(first.rect.y - 6);
    for (const other of [card, target, first, last]) expect(purse.rect.x >= other.rect.x + other.rect.width || purse.rect.y >= other.rect.y + other.rect.height || purse.rect.y + purse.rect.height <= other.rect.y, other.id).toBe(true);
  });
  it.each([[320, 180], [400, 225], [480, 270], [640, 360]])('tells the chat where the hunger strip really starts at %sx%s, in both arrangements', (width, height) => {
    const f = fixture(width, height), hunger = f.node('hotbarVitals', 'game.hud.hunger'), card = f.node('hotbarVitals', 'game.hud.character');
    expect(gameHudArrangement(width, false)).toBe(width < 480 ? 'stacked' : 'row');
    // The chat stands on the hunger strip, not 37px higher where the shortcuts used to sit.
    expect(gameHudCharacterTop(width, height)).toBe(hunger.rect.y); expect(hunger.rect.y + 10).toBe(card.rect.y);
  });
  it('caps a huge balance at a plate that still clears the target card', () => {
    const f = fixture(480, 270), purse = f.node('hotbarVitals', 'game.hud.purse'), target = f.node('targetEffects', 'game.hud.target');
    expect(purse.rect.x + purse.rect.width).toBe(472); expect(purse.rect.x).toBeGreaterThanOrEqual(target.rect.x + target.rect.width);
  });
  it('keeps the one-row HUD for touch when it fits between the thumb banks, and two rows on a narrow phone', () => {
    const touch = { ...model(), touchControls: { enabled: true, preferences: { swapped: false, bottomOffset: 0 } } };
    const wide = fixture(844, 390); wide.host.update(touch);
    const wideSlots = [0, 9].map(index => wide.node('hotbarVitals', `game.hud.hotbar.slot.${index}`));
    expect(wideSlots[0]!.rect.y).toBe(wideSlots[1]!.rect.y);
    // The round shortcuts stay in the bottom-left corner with the thumb controls (and their offset) above them.
    for (const bottomOffset of [0, 120]) {
      wide.host.update({ ...touch, touchControls: { enabled: true, preferences: { swapped: false, bottomOffset } } });
      const layout = touchControlLayout(844, 390, { swapped: false, bottomOffset }), system = wide.node('hotbarVitals', 'game.hud.system');
      expect(system.rect.x).toBe(6); expect(system.rect.y + system.rect.height).toBe(390 - 6);
      expect(system.rect.y).toBeGreaterThanOrEqual(layout.joystickCenter.y + layout.joystickRadius + 8);
    }
    const phone = fixture(390, 844); phone.host.update(touch);
    const first = phone.node('hotbarVitals', 'game.hud.hotbar.slot.0'), sixth = phone.node('hotbarVitals', 'game.hud.hotbar.slot.5');
    expect(sixth.rect.x).toBe(first.rect.x); expect(sixth.rect.y).toBeGreaterThan(first.rect.y);
    // The frames stand over the rows' ends and the purse sits beside the second row, whole.
    expect(phone.node('hotbarVitals', 'game.hud.character').rect.x).toBe(first.rect.x);
    const purse = phone.node('hotbarVitals', 'game.hud.purse');
    expect(purse.rect.y + purse.rect.height).toBe(838); expect(purse.rect.x).toBeGreaterThanOrEqual(phone.node('hotbarVitals', 'game.hud.hotbar.slot.9').rect.x + 28);
  });
});

describe('BUG-029 combined compact touch and HUD', () => {
 const intersects = (a: {x:number;y:number;width:number;height:number}, b: {x:number;y:number;width:number;height:number}) => a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 && a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height;
 function touchModel(swapped=false,bottomOffset=0):GameHudModel { const original=model(); return {...original, trackedQuestCount:1, touchControls:{enabled:true,preferences:{swapped,bottomOffset}}, zone:{...original.zone,watch:{time:'12:00',date:'Summer 24',moon:'Waxing moon'}}}; }
 it.each([false,true])('separates real full-model HUD, quest and thumb captures across scales/offsets, swapped=%s',swapped=>{
  const f=fixture(), controls=new TouchControls(art,vi.fn(),true), quest=new QuestTracker(art,vi.fn(),null);
  try { for(const bottomOffset of [0,120]) for(const scale of [1,2,3]) {
   f.host.update(touchModel(swapped,bottomOffset)); controls.setPreferences({swapped,bottomOffset});controls.setBounds(320,180);
   const region=f.host.questTrackerRegion!; expect(region.height).toBe(38); expect(region.width).toBeGreaterThanOrEqual(120);
   quest.update({width:320,height:180,layoutRegion:region,entries:[{id:'q0',title:'Long pinned quest',complete:false,objectives:['Find the orchard entrance','Read every line']}]});
   const l=touchControlLayout(320,180,{swapped,bottomOffset}),r=l.joystickRadius+8,thumbs=[{x:l.joystickCenter.x-r,y:l.joystickCenter.y-r,width:r*2,height:r*2},l.blockButton,l.dodgeButton,l.interactButton,l.jumpButton,l.secondaryButton];
   for(const page of ['you','status','zone','map'] as const) {
    if(page==='you'||page==='status') f.click('zoneMinimap',`game.hud.compact.tab.${page}`); else f.click('zoneMinimap',`game.hud.compact.toggle-${page}`);
    for(const surface of Object.keys(f.host.roots) as GameHudSurface[]) { f.host.roots[surface].arrange(); for(const {element} of f.host.roots[surface].entries()) if(element.focusable) for(const thumb of thumbs) expect(intersects(element.clip,thumb),`${page}:${element.id}`).toBe(false); }
    for(const thumb of thumbs) expect(intersects(quest.currentBounds,thumb)).toBe(false);
    const canvas=createCanvas(Math.round(320*scale*1.25),Math.round(180*scale*1.25)),context=canvas.getContext('2d');context.scale(scale*1.25,scale*1.25);controls.draw(context as unknown as CanvasRenderingContext2D);f.host.draw(context as unknown as CanvasRenderingContext2D);quest.draw(context as unknown as CanvasRenderingContext2D,1000);
    expect(context.getImageData(0,0,canvas.width,canvas.height).data.some(v=>v!==0)).toBe(true);
    const evidence=process.env['ORCHARD_TOUCH_HUD_EVIDENCE'];if(evidence&&(scale===1||page==='you')){mkdirSync(evidence,{recursive:true});writeFileSync(`${evidence}/compact-${page}-swap${swapped}-offset${bottomOffset}-scale${scale}-dpr1.25.png`,canvas.toBuffer('image/png'));}
   }
  } } finally { controls.dispose();quest.dispose(); }
 });
 it('scrolls every full-size utility/status control into view without firing down actions, and preserves focus/scroll on echoes',()=>{
  const f=fixture();f.host.update(touchModel()); const root=f.host.roots.hotbarVitals;
  const area=f.node('hotbarVitals','game.hud.compact.you'); expect(area.scroll.maxY).toBeGreaterThan(50);
  const character=f.node('hotbarVitals','game.hud.character'); expect(character.rect.width).toBe(72);expect(character.rect.height).toBe(29);
  const show=(surface:GameHudSurface,id:string,area:UiElement)=>{const element=f.node(surface,id); f.host.roots[surface].focus.set(element,'keyboard');f.host.roots[surface].arrange();expect(element.clip.height).toBeGreaterThanOrEqual(Math.min(element.rect.height,area.contentRect.height));return element;};
  const purse=show('hotbarVitals','game.hud.purse:button',area),start=f.point(purse);
  root.pointer({type:'down',point:start,pointerId:1,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.toggleInventory).not.toHaveBeenCalled();
  root.pointer({type:'move',point:{x:start.x,y:start.y+8},pointerId:1,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'up',point:start,pointerId:1,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.toggleInventory).not.toHaveBeenCalled();
  const tap=f.point(show('hotbarVitals','game.hud.purse:button',area));root.pointer({type:'down',point:tap,pointerId:2,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.toggleInventory).not.toHaveBeenCalled();root.pointer({type:'up',point:tap,pointerId:2,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.toggleInventory).toHaveBeenCalledOnce();
  const saved=area.scroll.y,focused=root.focus.current;f.host.update({...touchModel(),inventory:{...model().inventory,balanceBronze:12n}});expect(area.scroll.y).toBe(saved);expect(root.focus.current).toBe(focused);
  for(const id of ['game.hud.weapon','game.hud.crafting','game.hud.build','game.hud.system']) show('hotbarVitals',id,area);
  f.click('zoneMinimap','game.hud.compact.tab.status');const status=f.node('targetEffects','game.hud.compact.status');expect(status.scroll.maxY).toBeGreaterThan(0);show('targetEffects','game.hud.target-name',status);
  scrollUiElement(status,0,status.scroll.maxY);f.host.roots.targetEffects.arrange();const effects=f.node('targetEffects','game.hud.effect-scroll');expect(effects.clip.height).toBe(28);
 });

 it.each([[844,390],[390,844]])('keeps real noncompact touch status and hotbar clear at%s×%s', (width,height)=>{
  const f=fixture(width,height);
  for(const swapped of [false,true])for(const bottomOffset of [0,120]){
   f.host.update(touchModel(swapped,bottomOffset));
   const layout=touchControlLayout(width,height,{swapped,bottomOffset}),r=layout.joystickRadius+8;
   const thumbs=[{x:layout.joystickCenter.x-r,y:layout.joystickCenter.y-r,width:r*2,height:r*2},layout.blockButton,layout.dodgeButton,layout.interactButton,layout.jumpButton,layout.secondaryButton];
   for(const surface of Object.keys(f.host.roots) as GameHudSurface[]) for(const {element} of f.host.roots[surface].entries()) if(element.focusable) for(const thumb of thumbs) expect(intersects(element.clip,thumb),`${width}×${height} ${element.id}`).toBe(false);
   for(const [surface,id] of [['hotbarVitals','game.hud.character'],['hotbarVitals','game.hud.hotbar.slot.0'],['hotbarVitals','game.hud.hotbar.slot.9'],['targetEffects','game.hud.target'],['targetEffects','game.hud.target-name']] as const){const element=f.node(surface,id);for(const thumb of thumbs)expect(intersects(element.clip,thumb),`${width}×${height} swap=${swapped} offset=${bottomOffset}: ${id}`).toBe(false);}
   const controls=new TouchControls(art,vi.fn(),true),tracker=new QuestTracker(art,vi.fn(),null);try{controls.setBounds(width,height);controls.setPreferences({swapped,bottomOffset});tracker.update({width,height,layoutRegion:f.host.questTrackerRegion,anchorRect:f.host.minimapBounds,entries:[{id:'q0',title:'Pinned quest',complete:false,objectives:['Read the full objective']}]});for(const thumb of thumbs)expect(intersects(tracker.currentBounds,thumb)).toBe(false);
    for(const scale of [1,2,3]){const canvas=createCanvas(Math.round(width*scale*1.25),Math.round(height*scale*1.25)),ctx=canvas.getContext('2d');ctx.scale(scale*1.25,scale*1.25);controls.draw(ctx as unknown as CanvasRenderingContext2D);f.host.draw(ctx as unknown as CanvasRenderingContext2D);tracker.draw(ctx as unknown as CanvasRenderingContext2D,1000);expect(ctx.getImageData(0,0,canvas.width,canvas.height).data.some(v=>v!==0)).toBe(true);const evidence=process.env['ORCHARD_TOUCH_HUD_EVIDENCE'];if(evidence){mkdirSync(evidence,{recursive:true});writeFileSync(`${evidence}/touch-${width}x${height}-swap${swapped}-offset${bottomOffset}-scale${scale}-dpr1.25.png`,canvas.toBuffer('image/png'));}}
   }finally{controls.dispose();tracker.dispose();}
  }
 });
 it.each([[639,180],[640,180],[800,180],[639,229],[640,229],[640,230],[640,330],[640,294],[640,295],[320,354],[320,355]])('fits full touch status across responsive boundaries at%s×%s', (width,height)=>{
  const f=fixture(width,height),quest=new QuestTracker(art,vi.fn(),null);
  try{for(const swapped of [false,true])for(const bottomOffset of [0,120]){
   f.host.update(touchModel(swapped,bottomOffset));
   const layout=touchControlLayout(width,height,{swapped,bottomOffset}),r=layout.joystickRadius+8,thumbs=[{x:layout.joystickCenter.x-r,y:layout.joystickCenter.y-r,width:r*2,height:r*2},layout.blockButton,layout.dodgeButton,layout.interactButton,layout.jumpButton,layout.secondaryButton];
   for(const surface of Object.keys(f.host.roots) as GameHudSurface[])for(const {element} of f.host.roots[surface].entries())if(element.focusable)for(const thumb of thumbs)expect(intersects(element.clip,thumb),`${width}×${height} swap${swapped} offset${bottomOffset}: ${element.id}`).toBe(false);
   const zoneNodes=f.host.roots.zoneMinimap.entries().filter(({element})=>['hud.zone','hud.online-players','hud.minimap','hud.minimap.expand'].includes(element.id));
   for(const [surface,id] of [['hotbarVitals','game.hud.character'],['hotbarVitals','game.hud.hunger'],['targetEffects','game.hud.target'],['targetEffects','game.hud.target-name']] as const){const element=f.host.roots[surface].entries().find(row=>row.element.id===id)?.element;if(element)for(const zone of zoneNodes)expect(intersects(element.clip,zone.element.clip),`${id} versus ${zone.element.id}`).toBe(false);}
   quest.update({width,height,anchorRect:f.host.minimapBounds,layoutRegion:f.host.questTrackerRegion,visible:f.host.questTrackerVisible,entries:[{id:'q0',title:'Boundary quest',complete:false,objectives:['Reach every line']}]});
   for(const thumb of thumbs)expect(intersects(quest.currentBounds,thumb)).toBe(false);
  }}finally{quest.dispose();}
 });
 it('hands actual runtime keyboard ownership into STATUS/YOU and Escape back to the selected tab',()=>{
  const f=fixture(),runtime=new GameUiRuntime();f.host.update(touchModel());
  try{for(const surface of Object.keys(f.host.roots) as GameHudSurface[])runtime.register({id:`hud-${surface}`,root:f.host.roots[surface],priority:40,active:()=>true,blocking:()=>false});
   f.callbacks.focusSurface.mockImplementation(surface=>{runtime.focus(`hud-${surface}`);});
   const status=f.point(f.node('zoneMinimap','game.hud.compact.tab.status'));
   runtime.pointer({type:'down',point:status,pointerId:1,button:0,pointerType:'mouse'});runtime.pointer({type:'up',point:status,pointerId:1,button:0,pointerType:'mouse'});
   expect(f.callbacks.focusSurface).toHaveBeenLastCalledWith('targetEffects');
   for(let i=0;i<12&&runtime.focusedElement?.id!=='game.hud.target-name';i++)runtime.key({key:'Tab'});
   expect(runtime.focusedElement?.id).toBe('game.hud.target-name');
   expect(runtime.key({key:'Escape'})).toBe(true);expect(runtime.focusedElement?.id).toBe('game.hud.compact.tab.status');
   runtime.key({key:'Tab',shiftKey:true});expect(runtime.focusedElement?.id).toBe('game.hud.compact.tab.you');runtime.key({key:'Enter'});expect(f.callbacks.focusSurface).toHaveBeenLastCalledWith('hotbarVitals');
   for(let i=0;i<16&&runtime.focusedElement?.id!=='game.hud.purse:button';i++)runtime.key({key:'Tab'});
   expect(runtime.focusedElement?.id).toBe('game.hud.purse:button');runtime.key({key:'Enter',repeat:true});expect(f.callbacks.toggleInventory).not.toHaveBeenCalled();runtime.key({key:'Enter'});expect(f.callbacks.toggleInventory).toHaveBeenCalledOnce();
   const focus=runtime.focusedElement,scroll=f.node('hotbarVitals','game.hud.compact.you').scroll.y,requests=f.callbacks.focusSurface.mock.calls.length;f.host.update({...touchModel(),inventory:{...model().inventory,balanceBronze:1n}});expect(runtime.focusedElement).toBe(focus);expect(f.node('hotbarVitals','game.hud.compact.you').scroll.y).toBe(scroll);expect(f.callbacks.focusSurface).toHaveBeenCalledTimes(requests);
   runtime.key({key:'Escape'});expect(runtime.focusedElement?.id).toBe('game.hud.compact.tab.you');
  }finally{runtime.dispose();}
 });
 it('suppresses held compact utility tails across preference and responsive-scope changes',()=>{
  const f=fixture(),runtime=new GameUiRuntime();f.host.update(touchModel());
  try{for(const surface of Object.keys(f.host.roots) as GameHudSurface[])runtime.register({id:`hud-${surface}`,root:f.host.roots[surface],priority:40,active:()=>true,blocking:()=>false});f.callbacks.focusSurface.mockImplementation(surface=>{runtime.focus(`hud-${surface}`);});
   const tab=f.point(f.node('zoneMinimap','game.hud.compact.tab.you'));runtime.pointer({type:'down',point:tab,pointerId:1,button:0});runtime.pointer({type:'up',point:tab,pointerId:1,button:0});
   for(let i=0;i<16&&runtime.focusedElement?.id!=='game.hud.purse:button';i++)runtime.key({key:'Tab'});
   const p=f.point(f.node('hotbarVitals','game.hud.purse:button'));runtime.pointer({type:'down',point:p,pointerId:2,button:0,pointerType:'touch',isPrimary:true});f.host.update(touchModel(true,120));runtime.pointer({type:'up',point:p,pointerId:2,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.toggleInventory).not.toHaveBeenCalled();
   const q=f.point(f.node('hotbarVitals','game.hud.purse:button'));runtime.pointer({type:'down',point:q,pointerId:3,button:0,pointerType:'touch',isPrimary:true});f.host.resize(800,600);runtime.pointer({type:'up',point:f.point(f.node('hotbarVitals','game.hud.purse:button')),pointerId:3,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.toggleInventory).not.toHaveBeenCalled();
  }finally{runtime.dispose();}
 });
 it('captures a blank compact viewport swipe before world input and preserves single-primary policy',()=>{
  const f=fixture();f.host.update(touchModel());const runtime=new GameUiRuntime();
  try {for(const surface of Object.keys(f.host.roots) as GameHudSurface[]) runtime.register({id:surface,root:f.host.roots[surface],priority:40,active:()=>true,blocking:()=>false});
   const area=f.node('hotbarVitals','game.hud.compact.you'),p={x:area.contentRect.x+110,y:area.contentRect.y+10};
   expect(runtime.pointer({type:'down',point:p,pointerId:1,button:0,pointerType:'touch',isPrimary:true})).toBe(true);
   expect(runtime.tracksPointer(1)).toBe(true);const focused=f.host.roots.hotbarVitals.focus.current;
   expect(runtime.pointer({type:'down',point:{x:p.x-50,y:p.y},pointerId:2,button:0,pointerType:'touch',isPrimary:false})).toBe(true);expect(f.host.roots.hotbarVitals.focus.current).toBe(focused);
   runtime.pointer({type:'move',point:{x:p.x,y:p.y-8},pointerId:1,button:0,pointerType:'touch',isPrimary:true});expect(area.scroll.y).toBe(8);
   runtime.pointer({type:'up',point:p,pointerId:2,button:0,pointerType:'touch',isPrimary:false});runtime.pointer({type:'up',point:p,pointerId:1,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.toggleInventory).not.toHaveBeenCalled();expect(f.callbacks.selectHotbar).not.toHaveBeenCalled();
  }finally{runtime.dispose();}
 });
 it.each(['game.hud.weapon','game.hud.crafting','game.hud.build','game.hud.system'] as const)('arbitrates scroll before compact %s activation and retains one tap/keyboard command',id=>{
  const f=fixture();f.host.update(touchModel());const root=f.host.roots.hotbarVitals;
  const command=id.endsWith('weapon')?f.callbacks.selectHotbar:id.endsWith('crafting')?f.callbacks.toggleCrafting:id.endsWith('build')?f.callbacks.toggleBuild:f.callbacks.openSystem;
  const show=()=>{const element=f.node('hotbarVitals',id);root.focus.set(element,'keyboard');root.arrange();return f.point(element);};
  let p=show();root.pointer({type:'down',point:p,pointerId:1,button:0,pointerType:'touch',isPrimary:true});expect(command).not.toHaveBeenCalled();root.pointer({type:'move',point:{x:p.x,y:p.y+5},pointerId:1,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'up',point:p,pointerId:1,button:0,pointerType:'touch',isPrimary:true});expect(command).not.toHaveBeenCalled();
  p=show();root.pointer({type:'down',point:p,pointerId:2,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'cancel',point:p,pointerId:2,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'up',point:p,pointerId:2,button:0,pointerType:'touch',isPrimary:true});expect(command).not.toHaveBeenCalled();
  p=show();root.pointer({type:'down',point:p,pointerId:3,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'up',point:p,pointerId:3,button:0,pointerType:'touch',isPrimary:true});expect(command).toHaveBeenCalledOnce();root.key({key:'Enter',repeat:true});expect(command).toHaveBeenCalledOnce();root.key({key:'Enter'});expect(command).toHaveBeenCalledTimes(2);
 });
 it('keeps default purse and zone commands on down and restores original layout after compact resize',()=>{
  const f=fixture(800,600),root=f.host.roots.hotbarVitals,p=f.point(f.node('hotbarVitals','game.hud.purse:button'));
  root.pointer({type:'down',point:p,pointerId:1,button:0});expect(f.callbacks.toggleInventory).toHaveBeenCalledOnce();root.pointer({type:'up',point:p,pointerId:1,button:0});expect(f.callbacks.toggleInventory).toHaveBeenCalledOnce();
  const before={...f.node('hotbarVitals','game.hud.character').rect};f.host.resize(320,180);f.host.update(touchModel());f.click('zoneMinimap','game.hud.compact.tab.status');f.host.resize(800,600);f.host.update(model());expect(f.node('hotbarVitals','game.hud.character').rect).toEqual(before);
  const online=f.node('zoneMinimap','hud.online-players'),q=f.point(online);f.host.roots.zoneMinimap.pointer({type:'down',point:q,pointerId:2,button:0});expect(f.callbacks.openOnlinePlayers).toHaveBeenCalledOnce();f.host.roots.zoneMinimap.pointer({type:'up',point:q,pointerId:2,button:0});expect(f.callbacks.openOnlinePlayers).toHaveBeenCalledOnce();
 });
 it('defers scrollable zone/map release intent, keeps secondary touch inert and preserves ordinary default-down controls',()=>{
  const f=fixture(); f.click('hotbarVitals','game.hud.purse:button');expect(f.callbacks.toggleInventory).toHaveBeenCalledOnce();f.callbacks.toggleInventory.mockClear();// The compact zone page scrolls once its lines outgrow the view: a danger status adds one.
  f.host.update({...touchModel(),zone:{...touchModel().zone,subtitle:'Hearth danger rising'}});
  f.click('zoneMinimap','game.hud.compact.toggle-zone'); const root=f.host.roots.zoneMinimap,area=f.node('zoneMinimap','game.hud.compact.zone');
  const online=f.node('zoneMinimap','hud.online-players');root.focus.set(online,'keyboard');root.arrange();const p=f.point(online);
  root.pointer({type:'down',point:p,pointerId:1,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.openOnlinePlayers).not.toHaveBeenCalled();
  root.pointer({type:'move',point:{x:p.x,y:p.y-8},pointerId:1,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'up',point:p,pointerId:1,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.openOnlinePlayers).not.toHaveBeenCalled();
  root.focus.set(online,'keyboard');root.arrange();const q=f.point(online);root.pointer({type:'down',point:q,pointerId:2,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'down',point:q,pointerId:3,button:0,pointerType:'touch',isPrimary:false});root.pointer({type:'up',point:q,pointerId:3,button:0,pointerType:'touch',isPrimary:false});expect(f.callbacks.openOnlinePlayers).not.toHaveBeenCalled();root.pointer({type:'up',point:q,pointerId:2,button:0,pointerType:'touch',isPrimary:true});expect(f.callbacks.openOnlinePlayers).toHaveBeenCalledOnce();
  root.key({key:'Enter',repeat:true});expect(f.callbacks.openOnlinePlayers).toHaveBeenCalledOnce();expect(area.scroll.maxY).toBeGreaterThan(0);
  f.click('zoneMinimap','game.hud.compact.toggle-map');const mapArea=f.node('zoneMinimap','game.hud.compact.map');expect(mapArea.scroll.maxY).toBeGreaterThan(0);const map=f.node('zoneMinimap','hud.minimap'),m=f.point(map);
  root.pointer({type:'down',point:m,pointerId:4,button:0,pointerType:'touch',isPrimary:true});expect(f.node('zoneMinimap','game.hud.compact.map')).toBe(mapArea);root.pointer({type:'move',point:{x:m.x,y:m.y-8},pointerId:4,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'up',point:m,pointerId:4,button:0,pointerType:'touch',isPrimary:true});expect(f.node('zoneMinimap','game.hud.compact.map')).toBe(mapArea);
 });
});
