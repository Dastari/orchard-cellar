import type { ItemStack } from '@orchard/sim';
import { containsPoint, type UiRect } from '../geometry.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiButton } from '../kit/components/button.js';
import { uiZoneHeader, uiMinimap, type UiZoneHeaderElement, type UiMinimapElement, type UiZoneHeaderModel } from '../kit/components/hud-chrome.js';
import { uiHotbar, uiSlot } from '../kit/components/inventory.js';
import { uiMeter } from '../kit/components/meter.js';
import { uiPurse } from '../kit/components/purse.js';
import { uiStatusEffects, type UiStatusEffect } from '../kit/components/status-effects.js';
import { uiBadge } from '../kit/components/anchors.js';
import { uiTooltip } from '../kit/components/tooltip.js';
import { uiViewport } from '../kit/components/viewport.js';
import { uiVitals, uiVitalFraction, type UiVitalKind, type UiVitalValues } from '../kit/components/vitals.js';
import { uiFixed } from '../kit/layout/box.js';
import { scrollUiElement } from '../kit/layout/scroll.js';
import { UiElement } from '../kit/runtime/element.js';
import { UiRoot } from '../kit/runtime/root.js';

export type GameHudSurface = 'zoneMinimap' | 'hotbarVitals' | 'targetEffects';
export interface GameHudEffect extends UiStatusEffect { readonly effectKind: string }
export interface GameHudModel {
  /** Changes whenever a connection or player identity changes. */
  readonly sessionKey: string;
  /** Watch data is already gated by the equipped authoritative watch slot. */
  readonly zone: Omit<UiZoneHeaderModel, 'collapsed'> & { readonly description?: string; readonly moon?: { readonly phase: number; readonly label: string } };
  readonly minimapTrackingEnabled: boolean;
  readonly trackedQuestCount?: number;
  readonly inventory: {
    readonly rows: readonly { readonly slot: number; readonly stack: ItemStack }[];
    readonly selectedSlot: number; readonly mainHandIndex: number; readonly balanceBronze: bigint;
  };
  readonly player?: { readonly id: string; readonly values: UiVitalValues; readonly hunger?: { readonly current: number; readonly maximum: number }; readonly vigourDenied?: boolean };
  readonly target?: { readonly id: string; readonly name: string; readonly values: UiVitalValues };
  readonly effects: readonly GameHudEffect[];
  readonly ticksPerSecond: number;
  /** Drawing remains independent of the coordinator's runtime input eligibility. */
  readonly visible?: Partial<Record<GameHudSurface, boolean>>;
  readonly controls?: { readonly weapon?: boolean; readonly crafting?: boolean; readonly build?: boolean; readonly system?: boolean };
}
export interface GameHudCallbacks {
  readonly selectHotbar: (index: number) => void;
  readonly toggleInventory: () => void;
  readonly toggleCrafting: () => void;
  readonly toggleBuild?: () => void;
  readonly openSystem: () => void;
  readonly openCharacter?: () => void;
  readonly openOnlinePlayers: () => void;
  /** The coordinator must also compare this ID with its current local target. */
  readonly clearTarget: (expectedTargetId: string) => void;
}
export interface GameHudPainters {
  readonly itemLabel: (stack: ItemStack) => string;
  readonly drawItem: (context: CanvasRenderingContext2D, bounds: UiRect, stack: ItemStack) => void;
  readonly drawPlayerHead: (context: CanvasRenderingContext2D, playerId: string, bounds: UiRect) => void;
  readonly drawTargetPortrait: (context: CanvasRenderingContext2D, targetId: string, bounds: UiRect) => void;
  readonly drawMinimap: (context: CanvasRenderingContext2D, bounds: UiRect, zoom: number, trackingEnabled: boolean) => void;
  readonly drawMoon: (context: CanvasRenderingContext2D, bounds: UiRect, phase: number) => void;
  readonly drawEffect: (context: CanvasRenderingContext2D, bounds: UiRect, effectKind: string) => void;
}
function place(node: UiElement, rect: UiRect): void {
  node.setStyle({ position: 'absolute', inset: { left: uiFixed(rect.x), top: uiFixed(rect.y) }, width: uiFixed(Math.max(0, rect.width)), height: uiFixed(Math.max(0, rect.height)) });
}
function scoped(node: UiElement): UiElement { node.setProps({ singlePointer: true }); return node; }
function vitalLabel(kind: UiVitalKind, value: UiVitalValues | undefined, centi: boolean): string {
  const current = value?.[kind], maximum = value?.[({ health: 'maxHealth', mana: 'maxMana', vigour: 'maxVigour' } as const)[kind]];
  const number = (n: number | undefined) => n === undefined ? '—' : centi ? (n / 100).toFixed(1) : String(Math.round(n));
  return `${kind.toUpperCase()} ${number(current)} / ${number(maximum)}`;
}
/** Three production compositions, sharing the host's snapshot and command transport.
 * No subscriptions, inventory controller, prediction, timers, DOM listeners or RAF. */
export class GameHud {
  readonly roots: Readonly<Record<GameHudSurface, UiRoot>>;
  private model: GameHudModel | null = null;
  private width = 0; private height = 0;
  private zoneCollapsed = false; private mapCollapsed = false; private compactMapExpanded = false; private mapZoom = 2;
  private readonly zone: UiZoneHeaderElement;
  private readonly zonePanel: UiElement;
  private readonly map: UiMinimapElement;
  private readonly moon: UiElement;
  private readonly hotbar: UiElement;
  private readonly hotbarPanel: UiElement;
  private hoveredSlot: number | null = null;
  private readonly player: UiElement;
  private readonly hunger: UiElement;
  private readonly purse: UiElement;
  private readonly weapon: UiElement;
  private readonly crafting: UiElement;
  private readonly build: UiElement;
  private readonly system: UiElement;
  private readonly target: UiElement;
  private readonly targetName: UiElement;
  private readonly clear: UiElement;
  private readonly effects: UiElement;
  private readonly effectViewport: UiElement;
  constructor(art: UiKitArt | undefined, private readonly callbacks: GameHudCallbacks, private readonly painters: GameHudPainters) {
    this.roots = {
      zoneMinimap: new UiRoot({ art, scale: 1, label: 'Zone and minimap' }),
      hotbarVitals: new UiRoot({ art, scale: 1, label: 'Hotbar and resources' }),
      targetEffects: new UiRoot({ art, scale: 1, label: 'Target and effects' }),
    };
    // Repeat filtering is local to HUD controls; global digits and V stay with the game.
    for (const root of Object.values(this.roots)) root.mount(new UiElement({ id: 'hud.controls',
      style: { display: 'stack', width: 'grow', height: 'grow' },
      onKeyCapture: event => event.repeat === true && ['Enter', ' '].includes(event.key),
    }));
    const mount = (surface: GameHudSurface, node: UiElement) => this.roots[surface].tree.children[0]!.append(node);
    this.zone = uiZoneHeader({ title: '', onToggle: () => { this.zoneCollapsed = !this.zoneCollapsed; this.sync(); this.focusVisibleZone(); }, onPlayers: () => this.callbacks.openOnlinePlayers() });
    this.zonePanel = scoped(uiTooltip(() => {
      const zone = this.model?.zone;
      return [zone?.title, zone?.subtitle, zone?.description, zone?.watch && `${zone.watch.time} · ${zone.watch.date} · ${zone.watch.moon}`].filter(Boolean).join('\n');
    }, this.zone, { width: 'grow', height: 'grow' })); mount('zoneMinimap', this.zonePanel);
    this.map = uiMinimap({ zoom: 2, minZoom: 1, maxZoom: 4, onToggle: () => { if (this.compactQuestLayout) this.compactMapExpanded = !this.compactMapExpanded;
      else this.mapCollapsed = !this.mapCollapsed; this.sync(); this.focusVisibleMap(); },
      onZoom: zoom => { this.mapZoom = zoom; this.sync(); },
      render: (context, bounds) => { if (this.model) this.painters.drawMinimap(context, bounds, this.mapZoom, this.model.minimapTrackingEnabled); } });
    scoped(this.map); mount('zoneMinimap', this.map);
    this.moon = uiTooltip(() => this.model?.zone.moon?.label ?? '', uiViewport({ label: 'Moon phase', render: (context, bounds) => {
      const moon = this.model?.zone.moon; if (moon) this.painters.drawMoon(context, bounds, moon.phase);
    } })); this.moon.children[0]!.focusable = true; mount('zoneMinimap', this.moon);
    this.hotbar = scoped(uiHotbar({ id: 'game.hud.hotbar', container: 'inventory', count: 10, columns: 10, digitKeys: false,
      selected: () => this.model?.inventory.selectedSlot ?? -1, stack: index => this.stack(index),
      onSelect: index => { if (this.model) this.callbacks.selectHotbar(index); }, renderContent: (context, bounds, item) => this.painters.drawItem(context, bounds, item),
    }));
    const hotbarTip = uiTooltip(() => {
      const focused = this.hotbar.children.indexOf(this.roots.hotbarVitals.focus.current!);
      const index = this.hoveredSlot ?? (focused < 0 ? null : focused);
      return index === null ? '' : this.hotbar.children[index]?.label ?? '';
    }, this.hotbar, { width: 'grow', height: 'grow' });
    this.hotbarPanel = new UiElement({ style: { display: 'stack' }, children: [hotbarTip], onPointerObserved: event => {
      const index = this.hotbar.children.findIndex(slot => containsPoint(slot.rect, event.point));
      const next = index < 0 ? null : index;
      if (next !== this.hoveredSlot) { this.hoveredSlot = next; hotbarTip.invalidate(); }
    } });
    mount('hotbarVitals', this.hotbarPanel);
    this.player = scoped(uiVitals({ id: 'game.hud.player', size: 'md', values: () => this.model?.player?.values,
      tooltip: (kind, value) => vitalLabel(kind, value, true), vigourDenied: () => this.model?.player?.vigourDenied === true,
      portrait: uiViewport({ label: 'Player portrait', render: (context, bounds) => { const player = this.model?.player; if (player) this.painters.drawPlayerHead(context, player.id, bounds); } }),
    }));
    this.player = scoped(new UiElement({ id: 'game.hud.character', label: 'Open character', focusable: true,
      style: { display: 'stack' }, children: [this.player], pointerMode: 'capture',
      onPointer: event => { if (event.type !== 'down' || event.button !== 0) return false; this.callbacks.openCharacter?.(); return true; },
      onKey: event => { if (!['Enter', ' '].includes(event.key)) return false; if (!event.repeat) this.callbacks.openCharacter?.(); return true; },
    })); mount('hotbarVitals', this.player);
    this.hunger = uiTooltip(() => { const hunger = this.model?.player?.hunger; return hunger ? `HUNGER ${(hunger.current / 100).toFixed(1)} / ${(hunger.maximum / 100).toFixed(1)}` : ''; },
      uiMeter({ id: 'game.hud.hunger', label: 'Hunger', tone: 'warning', value: () => uiVitalFraction(this.model?.player?.hunger?.current, this.model?.player?.hunger?.maximum), layout: { width: 'grow', height: 'grow' } })); this.hunger.children[0]!.focusable = true; mount('hotbarVitals', this.hunger);
    this.purse = scoped(uiPurse({ id: 'game.hud.purse', balance: 0n, onOpen: () => this.callbacks.toggleInventory() })); mount('hotbarVitals', this.purse);
    this.weapon = scoped(uiTooltip(() => { const item = this.model && this.stack(this.model.inventory.mainHandIndex); return item ? `MAIN HAND · ${this.painters.itemLabel(item)} · V` : 'MAIN HAND · V'; },
      uiSlot({ id: 'game.hud.weapon', label: 'Main hand', hotkey: 'V', placeholder: 'weapon', activateOn: 'down', stack: () => this.model ? this.stack(this.model.inventory.mainHandIndex) : null,
        onPress: () => { if (this.model) this.callbacks.selectHotbar(this.model.inventory.mainHandIndex); }, renderContent: (context, bounds, item) => this.painters.drawItem(context, bounds, item) })));
    mount('hotbarVitals', this.weapon);
    const action = (id: string, label: string, tooltip: string, press: () => void) => scoped(uiTooltip(tooltip,
      uiButton({ id, label, ariaLabel: tooltip, size: 'sm', activateOn: 'down', onPress: press, layout: { width: 'grow', height: 'grow' } })));
    this.crafting = action('game.hud.crafting', 'C', 'Crafting · C', () => this.callbacks.toggleCrafting());
    this.build = action('game.hud.build', 'B', 'Build', () => this.callbacks.toggleBuild?.());
    this.system = action('game.hud.system', 'M', 'Menu · Escape', () => this.callbacks.openSystem());
    for (const node of [this.crafting, this.build, this.system]) mount('hotbarVitals', node);
    this.target = scoped(uiVitals({ id: 'game.hud.target', size: 'md', mirrored: true, values: () => this.model?.target?.values,
      tooltip: (kind, value) => vitalLabel(kind, value, false), portrait: uiViewport({ label: 'Target portrait', render: (context, bounds) => {
        const target = this.model?.target; if (target) this.painters.drawTargetPortrait(context, target.id, bounds);
      } }),
    })); mount('targetEffects', this.target);
    const targetLabel = uiBadge({ id: 'game.hud.target-name', label: ' ', layout: { width: 'grow', height: 'grow' } }); targetLabel.focusable = true;
    this.targetName = uiTooltip(() => this.model?.target?.name ?? '', targetLabel); mount('targetEffects', this.targetName);
    this.clear = scoped(uiButton({ id: 'game.hud.clear-target', label: 'X', ariaLabel: 'Clear target', size: 'sm', onPress: () => { const id = this.model?.target?.id; if (id) this.callbacks.clearTarget(id); }, layout: { width: 'grow', height: 'grow' } })); mount('targetEffects', this.clear);
    this.effects = uiStatusEffects({ id: 'game.hud.effects', effects: [], ticksPerSecond: 20,
      renderIcon: (context, bounds, effect) => { const actual = this.model?.effects.find(row => row.id === effect.id); if (actual) this.painters.drawEffect(context, bounds, actual.effectKind); },
      layout: { width: 'fit', height: uiFixed(24), shrink: 0 },
    });
    let effectDrag: { pointerId: number; x: number; offset: number } | null = null;
    this.effectViewport = scoped(new UiElement({ id: 'game.hud.effect-scroll', pointerMode: 'capture', style: { display: 'stack', overflow: 'scroll-x' }, children: [this.effects],
      onPointer(event, element) {
        if (event.type === 'down' && event.button === 0) {
          if (event.pointerType === 'touch') effectDrag = { pointerId: event.pointerId, x: event.point.x, offset: element.scroll.x };
          event.capture(); return true;
        }
        if (effectDrag?.pointerId === event.pointerId) {
          if (event.type === 'move') scrollUiElement(element, effectDrag.offset + effectDrag.x - event.point.x, 0);
          if (event.type === 'up' || event.type === 'cancel') effectDrag = null;
        }
        return true;
      },
      onWheel(event, element) { scrollUiElement(element, element.scroll.x + (event.deltaX || event.deltaY), 0); return true; },
    })); mount('targetEffects', this.effectViewport);
    this.sync();
  }
  private stack(index: number): ItemStack | null { return this.model?.inventory.rows.find(row => row.slot === index)?.stack ?? null; }
  get active(): boolean { return this.model !== null; }
  isVisible(surface: GameHudSurface): boolean { return this.model !== null && this.model.visible?.[surface] !== false; }
  get minimapBounds(): UiRect { return { ...this.map.rect }; }
  private get compactQuestLayout(): boolean { return this.height < 230 && (this.model?.trackedQuestCount ?? 0) > 0; }
  private get effectiveMapCollapsed(): boolean { return this.compactQuestLayout ? !this.compactMapExpanded : this.mapCollapsed; }
  get questTrackerVisible(): boolean { return !this.compactQuestLayout || !this.compactMapExpanded; }
  /** Temporary layout space, never a replacement for the player's saved anchor. */
  get questTrackerRegion(): UiRect | undefined {
    if (!this.compactQuestLayout) return undefined;
    const width = Math.min(170, Math.max(0, this.width - Math.max(28, Math.min(220, this.width - 168)) - 12));
    const barY = Math.max(0, this.height - 6 - (this.width >= 306 ? 31 : 64));
    return { x: this.width - width - 4, y: 40, width, height: Math.max(0, barY - 65 - 40) };
  }
  update(model: GameHudModel | null): void {
    if (model && model.ticksPerSecond !== 20) throw new Error('Game HUD expects the authoritative 20Hz clock');
    if (!model || model.sessionKey !== this.model?.sessionKey) {
      for (const root of Object.values(this.roots)) { root.input.cancelPointers(); root.focus.set(null); }
    } else if (model.target?.id !== this.model?.target?.id) {
      this.roots.targetEffects.input.cancelPointers();
    }
    this.model = model; this.sync();
  }
  resize(width: number, height: number): void {
    this.width = Math.max(0, width); this.height = Math.max(0, height);
    for (const root of Object.values(this.roots)) root.resize(width, height);
    this.sync();
  }
  private focusVisibleZone(): void { this.roots.zoneMinimap.focus.set(this.roots.zoneMinimap.entries().find(({ element }) => element.id === (this.zoneCollapsed ? 'hud.zone.expand' : 'hud.zone'))?.element ?? null); }
  private focusVisibleMap(): void { this.roots.zoneMinimap.focus.set(this.roots.zoneMinimap.entries().find(({ element }) => element.id === (this.effectiveMapCollapsed ? 'hud.minimap.expand' : 'hud.minimap'))?.element ?? null); }
  private sync(): void {
    const model = this.model;
    for (const surface of Object.keys(this.roots) as GameHudSurface[]) {
      const root = this.roots[surface], visible = this.isVisible(surface);
      if (!visible) { root.input.cancelPointers(); root.focus.set(null); }
      root.tree.children[0]!.setStyle({ visible });
    }
    if (!model) return;
    this.zone.updateZoneHeader({ ...model.zone, collapsed: this.zoneCollapsed });
    this.map.updateMinimap({ collapsed: this.effectiveMapCollapsed, zoom: this.mapZoom });
    this.purse.setProps({ balance: model.inventory.balanceBronze }); this.hotbar.invalidate();
    this.hotbar.children.forEach((slot, index) => { const item = this.stack(index); slot.label = `${(index + 1) % 10} · ${item ? this.painters.itemLabel(item) : 'Empty slot'}`; });
    this.weapon.children[0]?.setProps({ selected: model.inventory.selectedSlot === model.inventory.mainHandIndex }, false);
    this.targetName.children[0]?.setProps({ label: model.target?.name ?? '' });
    this.effects.setProps({ effects: model.effects });
    this.moon.setStyle({ visible: Boolean(model.zone.moon) }); this.player.setStyle({ visible: Boolean(model.player) }); this.hunger.setStyle({ visible: Boolean(model.player?.hunger) });
    for (const node of [this.target, this.targetName, this.clear]) node.setStyle({ visible: Boolean(model.target) });
    this.effectViewport.setStyle({ visible: model.effects.length > 0 });
    this.weapon.setStyle({ visible: model.controls?.weapon !== false }); this.crafting.setStyle({ visible: model.controls?.crafting !== false });
    this.build.setStyle({ visible: model.controls?.build === true && Boolean(this.callbacks.toggleBuild) }); this.system.setStyle({ visible: model.controls?.system !== false });
    const width = this.width, height = this.height, barWidth = width >= 306 ? 298 : 148, barHeight = width >= 306 ? 31 : 64;
    const bottom = height - 6, barY = Math.max(0, bottom - barHeight), vitalsY = Math.max(0, barY - 42);
    place(this.hotbarPanel, { x: Math.max(4, Math.floor((width - barWidth) / 2)), y: barY, width: Math.min(barWidth, width - 8), height: barHeight });
    place(this.player, { x: 4, y: vitalsY, width: 96, height: 38 });
    place(this.hunger, { x: 4, y: vitalsY - 9, width: 96, height: 7 });
    place(this.target, { x: width - 100, y: vitalsY, width: 96, height: 38 });
    place(this.targetName, { x: width - 100, y: vitalsY - 16, width: 70, height: 16 });
    place(this.clear, { x: width - 28, y: vitalsY - 16, width: 24, height: 16 });
    const middleX = Math.max(104, Math.floor(width / 2) - 52);
    place(this.purse, { x: middleX, y: barY - 26, width: Math.max(0, Math.min(104, width - 208)), height: 22 });
    place(this.weapon, { x: middleX, y: barY - 61, width: 28, height: 31 });
    place(this.crafting, { x: middleX + 30, y: barY - 54, width: 24, height: 24 });
    place(this.build, { x: middleX + 56, y: barY - 54, width: 24, height: 24 });
    place(this.system, { x: middleX + 82, y: barY - 54, width: 24, height: 24 });
    const zoneWidth = Math.max(28, Math.min(220, width - 168)), zoneHeight = this.zoneCollapsed ? 24 : model.zone.watch ? 54 : 34;
    place(this.zonePanel, { x: 4, y: 4, width: this.zoneCollapsed ? 28 : zoneWidth, height: zoneHeight });
    place(this.moon, { x: zoneWidth + 8, y: 4, width: 32, height: 32 });
    place(this.map, { x: width - (this.effectiveMapCollapsed ? 28 : 116) - 4, y: 4, width: this.effectiveMapCollapsed ? 28 : 116, height: this.effectiveMapCollapsed ? 24 : Math.min(92, Math.max(56, vitalsY - 21)) });
    place(this.effectViewport, { x: 4, y: zoneHeight + 8, width: Math.max(24, Math.min(height < 230 ? 96 : zoneWidth + 36, width - 132)), height: 28 });
    for (const root of Object.values(this.roots)) root.arrange();
  }
  draw(context: CanvasRenderingContext2D, surface?: GameHudSurface): void {
    const surfaces = (surface ? [surface] : Object.keys(this.roots) as GameHudSurface[]).filter(key => this.isVisible(key));
    const now = performance.now();
    for (const key of surfaces) this.roots[key].drawInContext(context, now, undefined, ['base']);
    for (const key of surfaces) this.roots[key].drawInContext(context, now, undefined, ['floating', 'modal', 'toast', 'cursor']);
  }
  dispose(): void { this.model = null; for (const root of Object.values(this.roots)) root.dispose(); }
}
