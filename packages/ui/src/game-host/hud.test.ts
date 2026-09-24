import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { GameHud, type GameHudModel, type GameHudSurface } from './hud.js';
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
  const callbacks = { selectHotbar: vi.fn(), toggleInventory: vi.fn(), toggleCrafting: vi.fn(), toggleBuild: vi.fn(), openSystem: vi.fn(), openOnlinePlayers: vi.fn(), clearTarget: vi.fn() };
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
  it('cancels target replacement, reconnect and explicit cancellation tails before any successor clear action', () => {
    const f = fixture(), root = f.host.roots.targetEffects;
    const down = (id: number) => root.pointer({ type: 'down', point: f.point(f.node('targetEffects', 'game.hud.clear-target')), pointerId: id, button: 0 });
    const up = (id: number) => root.pointer({ type: 'up', point: f.point(f.node('targetEffects', 'game.hud.clear-target')), pointerId: id, button: 0 });
    down(1); const next = model(); f.host.update({ ...next, target: { ...next.target!, id: 'target-b' } }); up(1); expect(f.callbacks.clearTarget).not.toHaveBeenCalled();
    down(2); f.host.update(null); f.host.update({ ...next, sessionKey: 'session-b' }); up(2); expect(f.callbacks.clearTarget).not.toHaveBeenCalled();
    down(3); root.input.cancelPointers(); up(3); expect(f.callbacks.clearTarget).not.toHaveBeenCalled();
    down(4); up(4); expect(f.callbacks.clearTarget).toHaveBeenCalledExactlyOnceWith('target-a');
  });
  it('retains map focus and zoom on harmless snapshots, clamps endpoints, and scopes collapse/online commands', () => {
    const f = fixture(), root = f.host.roots.zoneMinimap, zoom = f.node('zoneMinimap', 'hud.minimap.zoom-in');
    root.focus.set(zoom); root.key({ key: 'Enter' }); f.host.update({ ...model(), zone: { ...model().zone, onlineCount: 5 } });
    expect(root.focus.current).toBe(zoom); expect(root.entries().some(row => row.element.label === 'MAP 3X')).toBe(true);
    root.key({ key: 'Enter' }); expect(zoom.disabled).toBe(true); expect(root.entries().some(row => row.element.label === 'MAP 4X')).toBe(true);
    f.click('zoneMinimap', 'hud.online-players'); expect(f.callbacks.openOnlinePlayers).toHaveBeenCalledOnce();
    f.click('zoneMinimap', 'hud.zone'); expect(f.node('zoneMinimap', 'hud.zone.expand')).toBe(root.focus.current);
    expect(f.host.minimapBounds.width).toBe(116); f.click('zoneMinimap', 'hud.minimap'); expect(f.host.minimapBounds.width).toBe(28);
    expect(root.focus.current).toBe(f.node('zoneMinimap', 'hud.minimap.expand')); root.key({ key: 'Enter' }); expect(f.host.minimapBounds.width).toBe(116);
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
    root.pointer({ type: 'down', point: f.point(f.node('targetEffects', 'game.hud.clear-target')), pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
    root.pointer({ type: 'move', point: { x: start.x - 30, y: start.y }, pointerId: 1, button: 0, pointerType: 'touch' }); root.arrange();
    expect(strip.scroll.x).toBe(30); expect(root.focus.current).toBe(focus);
    root.pointer({ type: 'up', point: start, pointerId: 2, button: 0, pointerType: 'touch' }); expect(f.callbacks.clearTarget).not.toHaveBeenCalled();
    root.pointer({ type: 'up', point: start, pointerId: 1, button: 0, pointerType: 'touch' });
    root.wheel({ point: start, deltaX: 0, deltaY: 20 }); root.arrange(); expect(strip.scroll.x).toBe(50);
    f.host.update({ ...model(), effects }); expect(strip.scroll.x).toBe(50); expect(effects[0]!.remainingTicks).toBe(200);
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
    expect(hotRoot.entries().some(row => row.element.label === '1 · wood x123' && row.element.kind === 'text')).toBe(true);
    hotRoot.focus.set(f.node('hotbarVitals', 'game.hud.player:health')); hotRoot.arrange();
    expect(hotRoot.entries().some(row => row.element.label === 'HEALTH 80.0 / 100.0')).toBe(true);
    expect(f.node('hotbarVitals', 'game.hud.purse').props['balance']).toBe(9007199254740993n);
    f.host.update(model()); expect(zoneRoot.entries().some(row => row.element.kind === 'badge')).toBe(false);
  });
  it('keeps compact target actions clear of the map, currency and shortcuts with a watch equipped', () => {
    const f = fixture(); f.host.update({ ...model(), zone: { ...model().zone, watch: { time: '06:00', date: 'Spring 1', moon: 'Full moon' } } });
    const intersects = (a: UiElement, b: UiElement) => a.rect.x < b.rect.x + b.rect.width && a.rect.x + a.rect.width > b.rect.x && a.rect.y < b.rect.y + b.rect.height && a.rect.y + a.rect.height > b.rect.y;
    const target = ['game.hud.target-name', 'game.hud.clear-target'].map(id => f.node('targetEffects', id));
    const shortcuts = ['game.hud.weapon', 'game.hud.crafting', 'game.hud.build', 'game.hud.system', 'game.hud.purse'].map(id => f.node('hotbarVitals', id));
    for (const name of target) for (const button of shortcuts) expect(intersects(name, button), `${name.id}/${button.id}`).toBe(false);
    expect(intersects(target[0]!, target[1]!)).toBe(false);
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
      expect(slots).toHaveLength(10); expect(new Set(slots.map(row => row.element.rect.y)).size).toBe(1);
    }
  });
});
