import { createCanvas } from '@napi-rs/canvas';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, EQUIPMENT_SLOT_OFFSET } from '@orchard/sim';
import { OverworldUi, overworldUiLayout, type OverworldUiCallbacks, type OverworldUiModel } from './overworld-ui.js';
import type { UiSkin } from './skin.js';
import type { PixelUi } from './pixel-ui.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import { UiRoot } from './kit/runtime/root.js';
import { uiButton } from './kit/components/button.js';
import { GameUiRuntime } from './game-host/runtime.js';
import { DEFAULT_TOUCH_CONTROL_PREFERENCES, touchControlLayout } from './touch-control-layout.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); vi.stubGlobal('document', { createElement: () => createCanvas(1, 1), querySelector: () => null }); });
afterAll(() => vi.unstubAllGlobals());
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));
function fixture() {
  const select = vi.fn(), roster = vi.fn(), clear = vi.fn(), head = vi.fn(), target = vi.fn(), map = vi.fn();
  const callbacks = new Proxy({ selectHotbar: select, toggleOnlinePlayers: roster, clearTarget: clear }, { get(source, key) { return source[key as keyof typeof source] ?? (() => {}); } }) as unknown as OverworldUiCallbacks;
  const ui = new OverworldUi({} as UiSkin, {} as PixelUi, { avatar: art.pixel.panel, missing: art.pixel.panel }, callbacks, head, target, undefined, map);
  let model: OverworldUiModel = { width: 320, height: 180, connected: true, interactionSessionKey: 'player:1', playerCount: 3, selectedSlot: 0,
    inventory: [], hasBackpack: true, audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
    contentRegistry: bootstrapContentRegistry(), vitals: { playerId: 'self', health: 300, maxHealth: 1000, mana: 400, maxMana: 1000, vigour: 500, maxVigour: 1000 },
    targetVitals: { targetId: 'npc:1', displayName: 'Long named creature', health: 9, maxHealth: 12, portrait: { kind: 'combat_target' } } };
  ui.update(model); const runtime = new GameUiRuntime();
  const roots = ui.enableRetainedHud(art, surface => { runtime.focus(surface); });
  for (const surface of ['zoneMinimap','hotbarVitals','targetEffects'] as const) runtime.register({ id: surface, root: roots[surface], priority: 50,
    active: () => ui.retainedHudVisible(surface) && ui.openWindow === null && !ui.blockingUpdatePromptVisible, blocking: () => false });
  cleanup.push(() => { runtime.dispose(); ui.disposeRetainedHud(); });
  return { ui, roots, runtime, select, roster, clear, head, target, map, update(next: Partial<OverworldUiModel>) { model = { ...model, ...next }; ui.update(model); } };
}
function point(root: UiRoot, id: string) {
  root.arrange(); const node = root.entries().find(entry => entry.element.id === id)?.element;
  expect(node, id).toBeDefined(); root.focus.set(node!); root.arrange();
  expect(node!.clip).toEqual(node!.rect);
  return { x: node!.rect.x + node!.rect.width / 2, y: node!.rect.y + node!.rect.height / 2 };
}
it('routes one hotbar selection through the parent and retires the previous hotbar hit nodes', () => {
  const f = fixture(); const slot = f.roots.hotbarVitals.entries().find(entry => entry.element.props['slotIndex'] === 2)?.element
    ?? f.roots.hotbarVitals.entries().find(entry => entry.element.id === 'game.hud.hotbar')!.element.children[2]!;
  const p = point(f.roots.hotbarVitals, slot.id);
  f.runtime.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
  f.runtime.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(f.select).toHaveBeenCalledExactlyOnceWith(2);
  const old = overworldUiLayout(320,180).slots[3]!;
  f.ui.pointerDown({ x: old.x+5, y: old.y+5 }, 0); f.ui.pointerUp({ x: old.x+5, y: old.y+5 }, 0);
  expect(f.select).toHaveBeenCalledOnce();
  f.runtime.key({ key: '3' }); expect(f.select).toHaveBeenCalledOnce();
  f.update({ selectedSlot: 1 }); expect(f.roots.hotbarVitals.entries().find(entry => entry.element.id === 'game.hud.hotbar')!.element.children[1]!.props['selected']).toBe(true);
});
it('uses current painter projections and preserves character/roster/target commands', () => {
  const f = fixture();
  // Draw only the shared HUD; old canvas HUD cannot supply these callback calls.
  const context = createCanvas(320,180).getContext('2d') as unknown as CanvasRenderingContext2D;
  f.ui.draw(context);
  expect(f.head).toHaveBeenCalledWith(context, 'self', expect.any(Object));
  expect(f.target).toHaveBeenCalledWith(context, expect.objectContaining({ targetId:'npc:1', health:9 }), expect.any(Object));
  expect(f.map).toHaveBeenCalledWith(context, expect.any(Object), 2, false);
  const online = point(f.roots.zoneMinimap, 'hud.online-players');
  f.runtime.pointer({ type:'down', point:online, pointerId:2, button:0 }); f.runtime.pointer({ type:'up', point:online, pointerId:2, button:0 }); expect(f.roster).toHaveBeenCalledOnce();
  const player = point(f.roots.hotbarVitals, 'game.hud.character');
  f.runtime.pointer({ type:'down', point:player, pointerId:3, button:0 }); expect(f.ui.openWindow).toBe('character');
});
it('cancels HUD focus and gestures across connection or modal changes while keeping ordinary world points free', () => {
  const f = fixture(); expect(f.runtime.pointer({ type:'down', point:{x:180,y:55}, pointerId:4, button:0 })).toBe(false);
  const p = point(f.roots.zoneMinimap, 'hud.online-players');
  f.runtime.pointer({ type:'down', point:p, pointerId:5, button:0 }); const before = f.roster.mock.calls.length;
  f.update({ connected:false }); f.update({ connected:true, interactionSessionKey:'player:2' });
  f.runtime.pointer({ type:'up', point:p, pointerId:5, button:0 }); expect(f.roster).toHaveBeenCalledTimes(before);
  f.ui.openWindow='inventory'; f.runtime.reconcile();
  expect(f.ui.retainedHudVisible('hotbarVitals')).toBe(false); expect(f.ui.retainedHudVisible('zoneMinimap')).toBe(true);
  expect(f.runtime.pointer({ type:'down', point:p, pointerId:6, button:0 })).toBe(false);
});

it('keeps compact default quests above target controls and restores them after explicit map inspection', async () => {
  const { QuestTracker } = await import('./quest-tracker.js');
  const f = fixture(), open = vi.fn(), tracker = new QuestTracker(art, open, null);
  cleanup.push(() => tracker.dispose());
  const entries = Array.from({length:3}, (_,i) => ({id:`q${i}`,title:`A long tracked quest ${i}`,complete:false,objectives:['0/5 gather objects']}));
  f.update({trackedQuestCount:entries.length, inventory:[{slot:EQUIPMENT_SLOT_OFFSET+2,itemKind:'watch',quantity:1}],
    effects:[{effectKind:'orchard_tea',name:'Orchard tea',stacks:2,remainingTicks:200,durationTicks:1000}]});
  const updateTracker = () => tracker.update({ width:320,height:180,entries, anchorRect:f.ui.minimapBounds,layoutRegion:f.ui.questTrackerRegion,visible:f.ui.questTrackerVisible });
  updateTracker();
  f.runtime.register({id:'quest-tracker',root:tracker.root,priority:100,active:()=>tracker.isActive && f.ui.questTrackerVisible,blocking:()=>false});
  expect(f.ui.minimapBounds.height).toBe(24);
  const bounds = tracker.currentBounds;
  const target = f.roots.targetEffects.entries().find(e=>e.element.id==='game.hud.clear-target')!.element.rect;
  expect(bounds.y+bounds.height).toBeLessThan(target.y);
  const clear = point(f.roots.targetEffects,'game.hud.clear-target');
  f.runtime.pointer({type:'down',point:clear,pointerId:80,button:0}); f.runtime.pointer({type:'up',point:clear,pointerId:80,button:0});
  expect(f.clear).toHaveBeenCalledExactlyOnceWith('npc:1'); expect(open).not.toHaveBeenCalled();
  const expand = point(f.roots.zoneMinimap,'hud.minimap.expand');
  f.runtime.pointer({type:'down',point:expand,pointerId:81,button:0}); f.runtime.pointer({type:'up',point:expand,pointerId:81,button:0});
  expect(f.ui.questTrackerVisible).toBe(false); updateTracker(); expect(tracker.isActive).toBe(false);
  const map = point(f.roots.zoneMinimap,'hud.minimap');
  f.runtime.pointer({type:'down',point:map,pointerId:82,button:0}); f.runtime.pointer({type:'up',point:map,pointerId:82,button:0});
  expect(f.ui.questTrackerVisible).toBe(true); updateTracker(); expect(tracker.currentBounds).toEqual(bounds);
  f.update({width:640,height:360}); expect(f.ui.minimapBounds.height).toBe(92); expect(f.ui.questTrackerRegion).toBeUndefined();
  f.update({width:320,height:180}); expect(f.ui.minimapBounds.height).toBe(24); expect(f.ui.questTrackerVisible).toBe(true);
});

it('projects touch enablement and saved placement into the actual parent HUD without changing desktop layout', () => {
  const f = fixture();
  const desktop = f.ui.minimapBounds;
  for (const swapped of [false, true]) {
    const preferences = { ...DEFAULT_TOUCH_CONTROL_PREFERENCES, swapped, bottomOffset: 120 };
    f.update({ touchControls: true, touchControlPreferences: preferences, trackedQuestCount: 1 });
    const region = f.ui.questTrackerRegion!;
    const touch = touchControlLayout(320, 180, preferences);
    const radius = touch.joystickRadius + 8;
    const controls = [
      { x: touch.joystickCenter.x - radius, y: touch.joystickCenter.y - radius, width: radius * 2, height: radius * 2 },
      touch.blockButton, touch.jumpButton, touch.secondaryButton, touch.interactButton, touch.dodgeButton,
    ];
    expect(region.height).toBe(38);
    for (const rect of controls) expect(region.x < rect.x + rect.width && region.x + region.width > rect.x
      && region.y < rect.y + rect.height && region.y + region.height > rect.y).toBe(false);
    expect(f.roots.zoneMinimap.entries().some(entry => entry.element.id === 'game.hud.compact.tab.you' && entry.element.visible)).toBe(true);
    expect(preferences).toEqual({ ...DEFAULT_TOUCH_CONTROL_PREFERENCES, swapped, bottomOffset: 120 });
  }
  f.update({ touchControls: false, trackedQuestCount: 0 });
  expect(f.ui.questTrackerRegion).toBeUndefined();
  expect(f.ui.minimapBounds).toEqual(desktop);
});

it('hands compact page keyboard focus through the actual parent and returns to its tab', () => {
  const f = fixture();
  f.update({ touchControls: true, trackedQuestCount: 1 });
  f.roots.zoneMinimap.arrange();
  const status = f.roots.zoneMinimap.entries().find(entry => entry.element.id === 'game.hud.compact.tab.status')!.element.rect;
  const p = { x: status.x + status.width / 2, y: status.y + status.height / 2 };
  f.runtime.pointer({ type: 'down', point: p, pointerId: 91, button: 0 });
  f.runtime.pointer({ type: 'up', point: p, pointerId: 91, button: 0 });
  const tabTo = (id: string) => {
    for (let attempt = 0; attempt < 24 && f.runtime.focusedElement?.id !== id; attempt++) f.runtime.key({ key: 'Tab' });
    expect(f.runtime.focusedElement?.id).toBe(id);
  };
  tabTo('game.hud.clear-target');
  f.runtime.key({ key: 'Enter' });
  expect(f.clear).toHaveBeenCalledExactlyOnceWith('npc:1');
  f.runtime.key({ key: 'Escape' });
  expect(f.runtime.focusedElement?.id).toBe('game.hud.compact.tab.status');
  expect(f.ui.openWindow).toBeNull();
  tabTo('game.hud.compact.tab.you');
  f.runtime.key({ key: 'Enter' });
  tabTo('game.hud.purse:button');
  f.runtime.key({ key: 'Escape' });
  expect(f.runtime.focusedElement?.id).toBe('game.hud.compact.tab.you');
  expect(f.ui.openWindow).toBeNull();
});

it.each([true, false])('keeps empty STATUS keyboard navigation available (initially empty: %s)', initiallyEmpty => {
  const f = fixture();
  f.update({ touchControls: true, trackedQuestCount: 1, effects: [], ...(initiallyEmpty ? { targetVitals: undefined } : {}) });
  f.roots.zoneMinimap.arrange();
  const status = f.roots.zoneMinimap.entries().find(entry => entry.element.id === 'game.hud.compact.tab.status')!.element.rect;
  const p = { x: status.x + status.width / 2, y: status.y + status.height / 2 };
  f.runtime.pointer({ type: 'down', point: p, pointerId: 92, button: 0 });
  f.runtime.pointer({ type: 'up', point: p, pointerId: 92, button: 0 });
  if (!initiallyEmpty) f.update({ targetVitals: undefined });
  expect(f.runtime.focusedElement?.id).toBe('game.hud.compact.status.empty');
  expect(f.runtime.key({ key: 'Tab' })).toBe(true);
  expect(f.runtime.key({ key: 'Escape' })).toBe(true);
  expect(f.runtime.focusedElement?.id).toBe('game.hud.compact.tab.status');
  expect(f.ui.openWindow).toBeNull();
});

it('repairs a vanished status control locally without taking keyboard ownership from another host', () => {
  const f = fixture(); f.update({ touchControls: true, effects: [] });
  f.roots.zoneMinimap.arrange();
  const status = f.roots.zoneMinimap.entries().find(entry => entry.element.id === 'game.hud.compact.tab.status')!.element.rect;
  const p = { x: status.x + status.width / 2, y: status.y + status.height / 2 };
  f.runtime.pointer({ type: 'down', point: p, pointerId: 93, button: 0 });
  f.runtime.pointer({ type: 'up', point: p, pointerId: 93, button: 0 });
  const other = new UiRoot({ scale: 1 }); other.resize(320, 180);
  other.mount(uiButton({ id: 'other-host-control', label: 'Other host' }));
  f.runtime.register({ id: 'other', root: other, priority: 200, active: () => true, blocking: () => false });
  cleanup.push(() => other.dispose()); other.arrange();
  const rect = other.entries().find(entry => entry.element.id === 'other-host-control')!.element.rect;
  const q = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  f.runtime.pointer({ type: 'down', point: q, pointerId: 94, button: 0 });
  f.runtime.pointer({ type: 'up', point: q, pointerId: 94, button: 0 });
  expect(f.runtime.focusedElement?.id).toBe('other-host-control');
  f.update({ targetVitals: undefined });
  expect(f.roots.targetEffects.focus.current?.id).toBe('game.hud.compact.status.empty');
  expect(f.runtime.focusedElement?.id).toBe('other-host-control');
});
