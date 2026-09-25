import type { ItemStack } from '@orchard/sim';
import { containsPoint, type UiRect } from '../geometry.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiButton } from '../kit/components/button.js';
import { paintUiHudPlaque, UI_HUD_INK } from '../kit/components/hud-game.js';
import { drawOutlinedPixelText, fitPixelText } from '../pixel-ui.js';
import { UI_ZONE_BANNER_HEIGHT, uiZoneHeader, uiMinimap, uiZoneFlagWidth, uiZoneHeaderHeight, type UiZoneHeaderElement, type UiMinimapElement, type UiZoneHeaderModel } from '../kit/components/hud-chrome.js';
import { uiHotbar } from '../kit/components/inventory.js';
import { paintUiTouchDisc, uiTouchDiscCentre } from '../kit/components/touch-game.js';
import { uiPurse, uiPurseWidth } from '../kit/components/purse.js';
import { uiStatusEffects, type UiStatusEffect } from '../kit/components/status-effects.js';
import { uiTooltip } from '../kit/components/tooltip.js';
import { uiScrollArea } from '../kit/components/layout.js';
import { uiText } from '../kit/components/text.js';
import { HUD_SHORTCUT, hudHotbarSize, hudShortcutGrid, touchControlLayout, touchControlsUseCompactLayout, type TouchControlPreferences } from '../touch-control-layout.js';
import { uiViewport } from '../kit/components/viewport.js';
import { UI_CLASSIC_VITALS, uiVitals, uiVitalFraction, type UiVitalKind, type UiVitalValues } from '../kit/components/vitals.js';
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
  readonly touchControls?: { readonly enabled: boolean; readonly preferences: TouchControlPreferences };
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
  readonly focusSurface?: (surface: GameHudSurface) => void;
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
/** Compact touch page tabs: the HUD plaque with its word in outlined text, lit gold when its page is showing. */
const compactTab: NonNullable<Parameters<typeof uiButton>[0]['face']> = (element, { context, art, hovered, focused, pressed }) => {
  const r = element.rect, text = String(element.props['label']), active = element.props['tone'] === 'primary';
  paintUiHudPlaque(context, art, r, { pressed, lit: hovered || focused });
  const width = text.length * 6 - 1;
  drawOutlinedPixelText(context, art.pixel, text, r.x + Math.floor((r.width - width) / 2), r.y + Math.floor((r.height - 7) / 2) + (pressed ? 1 : 0), { color: active ? UI_HUD_INK.gold : UI_HUD_INK.cream, outlineColor: UI_HUD_INK.outline });
};
/** The approved desktop row: three shortcuts, the ten-slot hotbar and the main hand. */
const HUD_ROW_WIDTH = 3 * 30 + 298 + 34;
/** Widest purse plate: every coin of a five-digit gold balance; beyond that the plate shortens its coins. */
const HUD_PURSE_MAX = 150;
export type GameHudArrangement = 'row' | 'stacked';
/** Keyboard-and-mouse play always gets the one-row HUD when the row fits (the game's desktop logical viewport is
 * about 480x270 or 640x360). Touch play and screens too narrow for the row keep the stacked phone arrangement. */
export function gameHudArrangement(width: number, touch: boolean): GameHudArrangement {
  return touch || width < HUD_ROW_WIDTH + 8 ? 'stacked' : 'row';
}
/** Top of the character card's hunger line in the non-touch HUD; chat sits above it. */
export function gameHudCharacterTop(width: number, height: number): number {
  const barY = Math.max(0, height - 6 - hudHotbarSize(width).height), hunger = barY - 4 - UI_CLASSIC_VITALS.height - 10;
  // Narrow screens may raise the shortcuts into a row above the frames.
  return Math.max(0, gameHudArrangement(width, false) === 'row' ? hunger : hunger - 4 - 33);
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
  private tipSlot: () => number | null = () => null;
  private shownTipSlot: number | null = null;
  private hotbarTip: UiElement | null = null;
  private readonly player: UiElement;
  private readonly hunger: UiElement;
  private readonly purse: UiElement;
  private readonly weapon: UiElement;
  private readonly crafting: UiElement;
  private readonly build: UiElement;
  private readonly system: UiElement;
  private readonly target: UiElement;
  private readonly targetName: UiElement;
  private readonly effects: UiElement;
  private readonly effectViewport: UiElement;
  private compactPage: 'you' | 'status' | 'zone' | 'map' = 'you';
  private compactMounted = false;
  private shortcutsDocked = true;
  private shortcutsMountedDocked = true;
  private readonly compactViews: Record<'you' | 'status' | 'zone' | 'map', UiElement>;
  private readonly compactBodies: Record<'you' | 'status' | 'zone' | 'map', UiElement>;
  private readonly compactTabs: readonly UiElement[];
  private readonly compactZone: UiElement;
  private readonly compactMap: UiElement;
  private readonly compactEmptyStatus: UiElement;
  constructor(art: UiKitArt | undefined, private readonly callbacks: GameHudCallbacks, private readonly painters: GameHudPainters) {
    const activation = (): 'up' | 'down' => this.compactTouchLayout ? 'up' : 'down';
    this.roots = {
      zoneMinimap: new UiRoot({ art, scale: 1, label: 'Zone and minimap' }),
      hotbarVitals: new UiRoot({ art, scale: 1, label: 'Hotbar and resources' }),
      targetEffects: new UiRoot({ art, scale: 1, label: 'Target and effects' }),
    };
    // Repeat filtering is local to HUD controls; global digits and V stay with the game.
    for (const root of Object.values(this.roots)) root.mount(new UiElement({ id: 'hud.controls',
      style: { display: 'stack', width: 'grow', height: 'grow' },
      onKeyCapture: event => {
        if (event.key === 'Escape' && this.compactTouchLayout && root.focus.current?.isDescendantOf(this.compactViews[this.compactPage])) {
          this.focusCompactTabs(); return true;
        }
        return event.repeat === true && ['Enter', ' '].includes(event.key);
      },
    }));
    const mount = (surface: GameHudSurface, node: UiElement) => this.roots[surface].tree.children[0]!.append(node);
    this.zone = uiZoneHeader({ title: '', reserve: 26, get activateOn() { return activation(); }, onToggle: () => { if (this.compactTouchLayout) { this.showCompactPage('you'); return; } this.zoneCollapsed = !this.zoneCollapsed; this.sync(); this.focusVisibleZone(); }, onPlayers: () => this.callbacks.openOnlinePlayers() });
    this.zonePanel = scoped(uiTooltip(() => {
      const zone = this.model?.zone;
      return [zone?.title, zone?.subtitle, zone?.description, zone?.watch && `${zone.watch.time} · ${zone.watch.date} · ${zone.watch.moon}`].filter(Boolean).join('\n');
    }, this.zone, { width: 'grow', height: 'grow' })); mount('zoneMinimap', this.zonePanel);
    this.map = uiMinimap({ zoom: 2, minZoom: 1, maxZoom: 4, get activateOn() { return activation(); }, onToggle: () => { if (this.compactTouchLayout) { this.showCompactPage('you'); return; } if (this.compactQuestLayout) this.compactMapExpanded = !this.compactMapExpanded;
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
    // The hovered (or keyboard-focused) slot's item, named in caps like the inventory windows, centred above that slot.
    const tipSlot = this.tipSlot = () => {
      const focused = this.hotbar.children.indexOf(this.roots.hotbarVitals.focus.current!);
      return this.hoveredSlot ?? (focused < 0 ? null : focused);
    };
    const hotbarTip = uiTooltip(() => {
      const index = tipSlot(), stack = index === null ? null : this.stack(index);
      return stack === null ? '' : this.painters.itemLabel(stack).toUpperCase();
    }, this.hotbar, { width: 'grow', height: 'grow' }, { side: 'above', anchor: () => {
      const index = tipSlot(); return index === null ? null : this.hotbar.children[index]?.rect ?? null;
    } });
    this.hotbarTip = hotbarTip;
    this.hotbarPanel = new UiElement({ style: { display: 'stack' }, children: [hotbarTip], onPointerObserved: event => {
      const index = this.hotbar.children.findIndex(slot => containsPoint(slot.rect, event.point));
      const next = index < 0 ? null : index;
      if (next !== this.hoveredSlot) { this.hoveredSlot = next; hotbarTip.invalidate(); }
    } });
    mount('hotbarVitals', this.hotbarPanel);
    this.player = scoped(uiVitals({ id: 'game.hud.player', variant: 'classic', values: () => this.model?.player?.values,
      tooltip: (kind, value) => vitalLabel(kind, value, true), vigourDenied: () => this.model?.player?.vigourDenied === true,
      portrait: uiViewport({ label: 'Player portrait', render: (context, bounds) => { const player = this.model?.player; if (player) this.painters.drawPlayerHead(context, player.id, bounds); } }),
    }));
    let characterPressed = false;
    this.player = scoped(new UiElement({ id: 'game.hud.character', label: 'Open character', focusable: true,
      style: { display: 'stack' }, children: [this.player], pointerMode: 'capture',
      onPointer: (event, element) => {
        if (event.type === 'cancel') { characterPressed = false; return true; }
        if (event.type === 'down' && event.button === 0) { characterPressed = true; event.capture(); if (!this.compactTouchLayout) this.callbacks.openCharacter?.(); return true; }
        if (event.type === 'up' && characterPressed) { characterPressed = false; if (this.compactTouchLayout && containsPoint(element.clip, event.point)) this.callbacks.openCharacter?.(); return true; }
        return characterPressed;
      },
      onKey: event => { if (!['Enter', ' '].includes(event.key)) return false; if (!event.repeat) this.callbacks.openCharacter?.(); return true; },
    })); mount('hotbarVitals', this.player);
    const hungerFraction = () => uiVitalFraction(this.model?.player?.hunger?.current, this.model?.player?.hunger?.maximum);
    this.hunger = uiTooltip(() => { const hunger = this.model?.player?.hunger; return hunger ? `HUNGER ${(hunger.current / 100).toFixed(1)} / ${(hunger.maximum / 100).toFixed(1)}` : ''; },
      new UiElement({ id: 'game.hud.hunger', kind: 'meter', label: 'Hunger', focusable: true, style: { width: 'grow', height: 'grow' },
        paint: (element, { context, art, focused }) => {
          // The classic hunger strip over the frame: a dark 7px bar filling amber (rust when starving) with
          // the value right-aligned over it as outlined cream text.
          if (!art) return; const r = element.rect, value = hungerFraction(), bar = { x: r.x, y: r.y + 1, width: r.width, height: 7 };
          context.fillStyle = UI_HUD_INK.outline; context.fillRect(bar.x, bar.y, bar.width, bar.height);
          context.fillStyle = value <= .25 ? '#d56a55' : '#e1ad52'; context.fillRect(bar.x + 1, bar.y + 1, Math.round((bar.width - 2) * value), 5);
          const current = this.model?.player?.hunger?.current ?? 0;
          drawOutlinedPixelText(context, art.pixel, `HUNGER ${Math.ceil(current / 100)}`, r.x + r.width, r.y, { align: 'right', color: focused ? UI_HUD_INK.gold : '#fff1cf', outlineColor: UI_HUD_INK.outline });
        } }), { width: 'grow', height: 'grow' }); mount('hotbarVitals', this.hunger);
    this.purse = scoped(uiPurse({ id: 'game.hud.purse', balance: 0n, get activateOn() { return activation(); }, onOpen: () => this.callbacks.toggleInventory() })); mount('hotbarVitals', this.purse);
    // Shortcuts are small round buttons in the thumb-control style: a symbol and no key letter (the hotkeys
    // stay in their tooltips). The main hand shows its equipped item, lit while it is selected.
    const roundShortcut = (id: string, tooltip: string | (() => string), press: () => void, icon: string | undefined,
      content?: { readonly shown: () => boolean; readonly draw: (context: CanvasRenderingContext2D, bounds: UiRect) => void }, lit?: () => boolean) => scoped(uiTooltip(tooltip,
      uiButton({ id, label: '', ariaLabel: typeof tooltip === 'string' ? tooltip : 'Main hand', get activateOn() { return activation(); }, onPress: press, layout: { width: 'grow', height: 'grow', padding: 0 },
        face: (element, { context, art, hovered, focused, pressed }) => {
          const r = element.rect, centre = uiTouchDiscCentre(r, pressed), bounds = { x: centre.x - 8, y: centre.y - 8, width: 16, height: 16 };
          const shown = content?.shown() ?? false;
          paintUiTouchDisc(context, art, r, { tone: lit?.() ? 'success' : 'primary', icon: shown ? undefined : icon, pressed, lit: hovered || focused });
          if (shown) content!.draw(context, bounds);
        } })));
    this.weapon = roundShortcut('game.hud.weapon', () => { const item = this.model && this.stack(this.model.inventory.mainHandIndex); return item ? `MAIN HAND · ${this.painters.itemLabel(item)} · V` : 'MAIN HAND · V'; },
      () => { if (this.model) this.callbacks.selectHotbar(this.model.inventory.mainHandIndex); }, 'touch.tool',
      { shown: () => Boolean(this.model && this.stack(this.model.inventory.mainHandIndex)),
        draw: (context, bounds) => { const item = this.model && this.stack(this.model.inventory.mainHandIndex); if (item) this.painters.drawItem(context, bounds, item); } },
      () => this.model !== null && this.model.inventory.selectedSlot === this.model.inventory.mainHandIndex);
    mount('hotbarVitals', this.weapon);
    const action = (id: string, _hotkey: string, icon: string, tooltip: string, press: () => void) => roundShortcut(id, tooltip, press, icon);
    this.crafting = action('game.hud.crafting', 'C', 'hud.wrench', 'Crafting · C', () => this.callbacks.toggleCrafting());
    this.build = action('game.hud.build', 'B', 'hud.hammer', 'Build · B', () => this.callbacks.toggleBuild?.());
    this.system = action('game.hud.system', 'M', 'hud.gear', 'Menu · Escape', () => this.callbacks.openSystem());
    for (const node of [this.system, this.build, this.crafting]) mount('hotbarVitals', node);
    this.target = scoped(uiVitals({ id: 'game.hud.target', variant: 'classic', mirrored: true, values: () => this.model?.target?.values,
      tooltip: (kind, value) => vitalLabel(kind, value, false), portrait: uiViewport({ label: 'Target portrait', render: (context, bounds) => {
        const target = this.model?.target; if (target) this.painters.drawTargetPortrait(context, target.id, bounds);
      } }),
    })); mount('targetEffects', this.target);
    // The target's name sits just above its frame, right-aligned, as outlined cream caps (18 characters at most);
    // the full name is in the tooltip.
    const targetLabel = new UiElement({ id: 'game.hud.target-name', kind: 'badge', label: ' ', focusable: true, style: { width: 'grow', height: 'grow' },
      paint: (element, { context, art, focused }) => {
        const name = this.model?.target?.name; if (!art || !name) return; const r = element.rect;
        const text = name.length > 18 ? `${name.slice(0, 15).toUpperCase()}...` : name.toUpperCase();
        drawOutlinedPixelText(context, art.pixel, fitPixelText(text, r.width - 2, 1, art.pixel.font), r.x + r.width - 1, r.y + 1, { align: 'right', color: focused ? UI_HUD_INK.gold : '#fff1cf', outlineColor: UI_HUD_INK.outline });
      } });
    this.targetName = uiTooltip(() => this.model?.target?.name ?? '', targetLabel); mount('targetEffects', this.targetName);
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
    this.compactBodies = Object.fromEntries((['you', 'status', 'zone', 'map'] as const).map(page => [page,
      new UiElement({ id: `game.hud.compact.${page}.body`, style: { display: 'stack', width: 'grow', height: uiFixed(112), shrink: 0 } }),
    ])) as Record<'you' | 'status' | 'zone' | 'map', UiElement>;
    this.compactEmptyStatus = uiText('NO TARGET\nOR EFFECTS', { id: 'game.hud.compact.status.empty', align: 'center' });
    this.compactEmptyStatus.focusable = true;
    this.compactBodies.status.append(this.compactEmptyStatus);
    this.compactViews = Object.fromEntries((['you', 'status', 'zone', 'map'] as const).map(page => {
      const view = scoped(uiScrollArea({ id: `game.hud.compact.${page}`, label: `${page} information`, visible: false }, [this.compactBodies[page]]));
      view.setProps({ touchScroll: true });
      view.pointerMode = 'capture';
      mount(page === 'you' ? 'hotbarVitals' : page === 'status' ? 'targetEffects' : 'zoneMinimap', view);
      return [page, view];
    })) as Record<'you' | 'status' | 'zone' | 'map', UiElement>;
    this.compactTabs = (['you', 'status'] as const).map(page => {
      const tab = scoped(uiButton({ id: `game.hud.compact.tab.${page}`, label: page.toUpperCase(), size: 'sm', onPress: () => this.showCompactPage(page), face: compactTab }));
      mount('zoneMinimap', tab); return tab;
    });
    this.compactZone = scoped(uiButton({ id: 'game.hud.compact.toggle-zone', label: 'ZONE', size: 'sm', face: compactTab, onPress: () => this.showCompactPage(this.compactPage === 'zone' ? 'you' : 'zone') }));
    this.compactMap = scoped(uiButton({ id: 'game.hud.compact.toggle-map', label: 'MAP', size: 'sm', face: compactTab, onPress: () => this.showCompactPage(this.compactPage === 'map' ? 'you' : 'map') }));
    mount('zoneMinimap', this.compactZone); mount('zoneMinimap', this.compactMap);
    this.sync();
  }
  private get compactTouchLayout(): boolean { return this.model?.touchControls?.enabled === true && touchControlsUseCompactLayout(this.width, this.height); }
  private showCompactPage(page: 'you' | 'status' | 'zone' | 'map'): void {
    if (page !== this.compactPage) { for (const root of Object.values(this.roots)) root.input.cancelPointers(); this.compactPage = page; }
    this.sync();
    if (this.compactTouchLayout) {
      const surface = page === 'you' ? 'hotbarVitals' : page === 'status' ? 'targetEffects' : 'zoneMinimap';
      const root = this.roots[surface];
      for (const other of Object.values(this.roots)) other.focus.set(null);
      root.arrange(); root.focus.set(root.entries().find(({ element }) => element.focusable && !element.disabled && element.isDescendantOf(this.compactViews[page]))?.element ?? null, 'keyboard');
      this.callbacks.focusSurface?.(surface);
    }
  }
  private focusCompactTabs(): void {
    if (this.compactPage === 'zone' || this.compactPage === 'map') { this.compactPage = 'you'; this.sync(); }
    for (const root of Object.values(this.roots)) { root.input.cancelPointers(); root.focus.set(null); }
    const root = this.roots.zoneMinimap; root.arrange();
    root.focus.set(this.compactTabs[this.compactPage === 'status' ? 1 : 0]!, 'keyboard');
    this.callbacks.focusSurface?.('zoneMinimap');
  }
  private get compactCenter(): UiRect {
    const layout = touchControlLayout(this.width, this.height, this.model?.touchControls?.preferences);
    const radius = layout.joystickRadius + 8;
    const exclusions = [{ x: layout.joystickCenter.x - radius, width: radius * 2 }, layout.blockButton, layout.jumpButton, layout.secondaryButton, layout.interactButton, layout.dodgeButton];
    const left = Math.max(...exclusions.filter(rect => rect.x + rect.width / 2 < this.width / 2).map(rect => rect.x + rect.width)) + 4;
    const right = Math.min(...exclusions.filter(rect => rect.x + rect.width / 2 >= this.width / 2).map(rect => rect.x)) - 4;
    const bottom = this.height - 6 - hudHotbarSize(this.width, this.compactTouchLayout).height - 4;
    return { x: left, y: 40, width: Math.max(0, right - left), height: Math.max(0, bottom - 40) };
  }
  private stack(index: number): ItemStack | null { return this.model?.inventory.rows.find(row => row.slot === index)?.stack ?? null; }
  get active(): boolean { return this.model !== null; }
  isVisible(surface: GameHudSurface): boolean { return this.model !== null && this.model.visible?.[surface] !== false; }
  get minimapBounds(): UiRect { return { ...this.map.rect }; }
  private get compactQuestLayout(): boolean { return this.height < 230 && (this.model?.trackedQuestCount ?? 0) > 0; }
  private get effectiveMapCollapsed(): boolean { return this.compactTouchLayout ? false : this.compactQuestLayout ? !this.compactMapExpanded : this.mapCollapsed; }
  get questTrackerVisible(): boolean { return this.compactTouchLayout || !this.compactQuestLayout || !this.compactMapExpanded; }
  /** Temporary layout space, never a replacement for the player's saved anchor. */
  get questTrackerRegion(): UiRect | undefined {
    if (this.compactTouchLayout) { const r = this.compactCenter; return { x: r.x, y: r.y + r.height - 38, width: r.width, height: 38 }; }
    if (this.model?.touchControls?.enabled) {
      const lane = this.compactCenter, width = Math.min(170, lane.width);
      const barY = this.height - 6 - hudHotbarSize(this.width).height;
      const statusClearance = lane.width >= 200 ? 134 : 197;
      return { x: lane.x + Math.floor((lane.width - width) / 2), y: 100, width, height: Math.min(96, Math.max(38, barY - statusClearance - 100)) };
    }
    if (!this.compactQuestLayout) return undefined;
    const width = Math.min(170, Math.max(0, this.width - Math.max(28, Math.min(220, this.width - 168)) - 12));
    const barY = Math.max(0, this.height - 6 - hudHotbarSize(this.width).height);
    return { x: this.width - width - 4, y: 40, width, height: Math.max(0, barY - 73 - 40) };
  }
  update(model: GameHudModel | null): void {
    if (model && model.ticksPerSecond !== 20) throw new Error('Game HUD expects the authoritative 20Hz clock');
    if (!model || model.sessionKey !== this.model?.sessionKey) {
      for (const root of Object.values(this.roots)) { root.input.cancelPointers(); root.focus.set(null); }
    } else if (model.target?.id !== this.model?.target?.id) {
      this.roots.targetEffects.input.cancelPointers();
    }
    if (JSON.stringify(model?.touchControls) !== JSON.stringify(this.model?.touchControls)) for (const root of Object.values(this.roots)) root.input.cancelPointers();
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
    // Repair local control focus after an authoritative row disappears. Do not
    // claim global keyboard ownership during model updates: another host may own it.
    const bodyFocusedRoots = this.compactTouchLayout ? Object.values(this.roots).filter(root =>
      root.focus.current?.isDescendantOf(this.compactViews[this.compactPage])) : [];
    for (const surface of Object.keys(this.roots) as GameHudSurface[]) {
      const root = this.roots[surface], visible = this.isVisible(surface);
      if (!visible) { root.input.cancelPointers(); root.focus.set(null); }
      root.tree.children[0]!.setStyle({ visible });
    }
    if (!model) return;
    this.zone.updateZoneHeader({ ...model.zone, collapsed: this.compactTouchLayout ? false : this.zoneCollapsed });
    this.map.updateMinimap({ collapsed: this.effectiveMapCollapsed, zoom: this.mapZoom });
    this.purse.setProps({ balance: model.inventory.balanceBronze }); this.hotbar.invalidate();
    this.hotbar.children.forEach((slot, index) => { const item = this.stack(index); slot.label = `${(index + 1) % 10} · ${item ? this.painters.itemLabel(item) : 'Empty slot'}`; });
    this.weapon.invalidate();
    this.targetName.children[0]?.setProps({ label: model.target?.name ?? '' });
    this.effects.setProps({ effects: model.effects });
    this.player.setStyle({ visible: Boolean(model.player) }); this.hunger.setStyle({ visible: Boolean(model.player?.hunger) });
    for (const node of [this.target, this.targetName]) node.setStyle({ visible: Boolean(model.target) });
    this.effectViewport.setStyle({ visible: model.effects.length > 0 });
    this.compactEmptyStatus.setStyle({ visible: !model.target && model.effects.length === 0 });
    this.weapon.setStyle({ visible: model.controls?.weapon !== false }); this.crafting.setStyle({ visible: model.controls?.crafting !== false });
    this.build.setStyle({ visible: model.controls?.build === true && Boolean(this.callbacks.toggleBuild) }); this.system.setStyle({ visible: model.controls?.system !== false });
    const width = this.width, height = this.height, { width: barWidth, height: barHeight } = hudHotbarSize(width, this.compactTouchLayout);
    const bottom = height - 6, barY = Math.max(0, bottom - barHeight);
    const shortcuts = [this.system, this.build, this.crafting, this.weapon].filter(node => node.style.visible !== false);
    const purseWidth = Math.min(uiPurseWidth(model.inventory.balanceBronze), HUD_PURSE_MAX, Math.max(0, width - 16));
    const zoneModel = { ...model.zone, collapsed: this.zoneCollapsed }, zoneHeight = uiZoneHeaderHeight(zoneModel);
    const zoneWidth = this.zoneCollapsed ? 28 : Math.min(uiZoneFlagWidth(model.zone.title) + 60, Math.max(156, width - 140)), flagWidth = Math.max(0, zoneWidth - 60);
    const touch = model.touchControls?.enabled === true, lane = touch ? this.compactCenter : { x: 0, width };
    const thumbLayout = touch && !this.compactTouchLayout ? touchControlLayout(width, height, model.touchControls?.preferences) : null;
    const thumbs = thumbLayout ? [{ x: thumbLayout.joystickCenter.x - thumbLayout.joystickRadius - 8, y: thumbLayout.joystickCenter.y - thumbLayout.joystickRadius - 8, width: (thumbLayout.joystickRadius + 8) * 2, height: (thumbLayout.joystickRadius + 8) * 2 },
      thumbLayout.blockButton, thumbLayout.dodgeButton, thumbLayout.interactButton, thumbLayout.jumpButton, thumbLayout.secondaryButton] : [];
    // Touch play keeps the one-row hotbar when it fits in the lane between the thumb banks.
    const arrangement = gameHudArrangement(width, false) === 'row' && barHeight === 31 && (!touch || barWidth + 16 <= lane.width) ? 'row' : 'stacked';
    const card = { width: UI_CLASSIC_VITALS.width, height: UI_CLASSIC_VITALS.height }, cardY = barY - 4 - card.height;
    // The round shortcuts always sit in the bottom-left corner (one row when it clears the centred hotbar, else two
    // columns); the thumb controls, and their height preference, stand above them.
    const centredBar = Math.max(4, Math.floor((width - barWidth) / 2)), grid = hudShortcutGrid(width, shortcuts.length, this.compactTouchLayout);
    this.shortcutsDocked = grid.docked;
    if (grid.docked) shortcuts.forEach((node, index) => place(node, { x: HUD_SHORTCUT.margin + (index % grid.columns) * HUD_SHORTCUT.pitch,
      y: height - HUD_SHORTCUT.margin - (grid.rows - Math.floor(index / grid.columns)) * HUD_SHORTCUT.rowPitch + 2, width: HUD_SHORTCUT.width, height: HUD_SHORTCUT.height }));
    // The hotbar keeps clear of the shortcuts and of any left thumb control beside its rows.
    const besideThumbs = thumbs.filter(t => t.x + t.width / 2 < width / 2 && t.y < barY + barHeight && t.y + t.height > barY);
    const minX = Math.max(shortcuts.length && grid.docked ? grid.right + 6 : 4, ...besideThumbs.map(t => t.x + t.width + 4));
    // The classic frames sit directly above the hotbar's ends: the player on the left under its hunger strip and
    // the mirrored target on the right with its name just above it.
    const frameRects: UiRect[] = [];
    const frames = (hotbarX: number, targetRight: number) => {
      const targetX = Math.max(hotbarX + card.width + 4, targetRight - card.width);
      const name = Math.min(108, Math.min(18, model.target?.name.length ?? 0) * 6 + 4, targetX - hotbarX);
      const rects: [UiElement, UiRect][] = [[this.player, { x: hotbarX, y: cardY, ...card }], [this.hunger, { x: hotbarX + 4, y: cardY - 10, width: card.width - 8, height: 9 }],
        [this.target, { x: targetX, y: cardY, ...card }], [this.targetName, { x: targetX + card.width - name, y: cardY - 10, width: name, height: 9 }]];
      for (const [node, rect] of rects) { place(node, rect); frameRects.push(rect); }
    };
    if (arrangement === 'row') {
      // Desktop: the hotbar centred along the bottom and the purse (also the bag button) in the bottom-right
      // corner; the hotbar slides left of centre to make room for every coin, and the purse rises above its right
      // end only when even that is too narrow (on touch it shortens its coins to stay in the corner).
      let plate = purseWidth, purseX = width - 8 - plate, purseBeside = barWidth + 8 <= purseX - 8 - Math.max(minX, lane.x + 8);
      if (!purseBeside && touch) { plate = Math.max(0, width - 8 - (lane.x + 8 + barWidth) - 8); purseX = width - 8 - plate; purseBeside = true; }
      const centred = touch ? lane.x + Math.floor((lane.width - barWidth) / 2) : centredBar;
      const x0 = purseBeside ? Math.max(minX, lane.x + 8, Math.min(centred, purseX - 8 - barWidth)) : Math.max(minX, centred);
      place(this.hotbarPanel, { x: x0, y: barY, width: barWidth, height: barHeight });
      place(this.purse, { x: purseX, y: purseBeside ? height - 6 - 26 : barY - 6 - 26, width: plate, height: 26 });
      frames(x0, Math.min(x0 + barWidth, purseBeside ? width : purseX - 6));
    } else {
      // Narrow screens: the hotbar wraps to two rows of five at the bottom, the frames stand above its ends and
      // the purse sits beside its last row in the bottom-right corner (the hotbar slides to make room). Touch keeps
      // the hotbar centred, as the thumb layout expects, and shortens the purse's coins to fit.
      const besideX = width - 6 - purseWidth - 4 - barWidth;
      let purseBeside = besideX >= minX, plate = purseWidth;
      // Short of room, the hotbar slides as far left as it can so the purse keeps as many coins as possible.
      const hotbarX = Math.max(minX, Math.min(centredBar, besideX));
      if (!purseBeside) { const room = width - 6 - (hotbarX + barWidth + 4); if (room >= 64 || (touch && room >= 40)) { plate = Math.min(purseWidth, room); purseBeside = true; } }
      place(this.hotbarPanel, { x: hotbarX, y: barY, width: Math.min(barWidth, width - 8), height: barHeight });
      frames(hotbarX, hotbarX + barWidth);
      place(this.purse, { x: width - 6 - plate, y: purseBeside ? height - 6 - 26 : cardY - 14 - 28, width: plate, height: 26 });
    }
    if (thumbs.length) {
      // Where a thumb bank reaches over the hotbar's ends, the frames move into the lane between the banks.
      const blocked = frameRects.some(r => thumbs.some(t => r.x < t.x + t.width && t.x < r.x + r.width && r.y < t.y + t.height && t.y < r.y + r.height));
      if (blocked) {
        const paired = lane.width >= 2 * card.width + 28, firstX = lane.x + Math.max(0, Math.floor((lane.width - (paired ? 2 * card.width + 4 : card.width)) / 2));
        const top = Math.min(...thumbs.map(t => t.y)) - 8, targetY = Math.min(barY - 117, top - card.height), playerY = paired ? targetY : targetY - card.height - 18;
        const targetX = paired ? firstX + card.width + 4 : firstX;
        place(this.player, { x: firstX, y: playerY, ...card });
        place(this.hunger, { x: firstX + 4, y: playerY - 10, width: card.width - 8, height: 9 });
        place(this.target, { x: targetX, y: targetY, ...card });
        place(this.targetName, { x: targetX, y: targetY - 10, width: card.width, height: 9 });
      }
    }
    place(this.zonePanel, { x: 4, y: 4, width: zoneWidth, height: zoneHeight });
    place(this.moon, { x: 4 + flagWidth + 3, y: 4 + Math.floor((UI_ZONE_BANNER_HEIGHT - 8 - 24) / 2) + 2, width: 24, height: 24 });
    this.moon.setStyle({ visible: Boolean(model.zone.moon) && !this.zoneCollapsed });
    const mapHeight = Math.min(touch ? 92 : 112, Math.max(56, barY - 70 - 8));
    place(this.map, { x: width - (this.effectiveMapCollapsed ? 28 : 128) - 4, y: 4, width: this.effectiveMapCollapsed ? 28 : 128, height: this.effectiveMapCollapsed ? 24 : mapHeight });
    place(this.effectViewport, { x: 4, y: zoneHeight + 8, width: Math.max(24, Math.min(height < 230 ? 104 : zoneWidth + 36, width - 140)), height: 28 });
    this.layoutCompact();
    for (const root of Object.values(this.roots)) root.arrange();
    for (const root of bodyFocusedRoots) if (!root.focus.current) root.focus.set(root.entries().find(({ element }) =>
      element.focusable && element.visible && !element.disabled && element.isDescendantOf(this.compactViews[this.compactPage]))?.element ?? null, 'keyboard');
  }
  private layoutCompact(): void {
    const compact = this.compactTouchLayout;
    const shortcuts = [this.system, this.build, this.crafting, this.weapon];
    const groups = { you: [this.hunger, this.player, ...(this.shortcutsDocked ? [] : shortcuts), this.purse],
      status: [this.target, this.targetName, this.effectViewport], zone: [this.zonePanel], map: [this.map] };
    if (compact !== this.compactMounted || (compact && this.shortcutsDocked !== this.shortcutsMountedDocked)) {
      for (const root of Object.values(this.roots)) root.input.cancelPointers();
      for (const page of ['you', 'status', 'zone', 'map'] as const) {
        const parent = compact ? this.compactBodies[page] : this.roots[page === 'you' ? 'hotbarVitals' : page === 'status' ? 'targetEffects' : 'zoneMinimap'].tree.children[0]!;
        for (const node of groups[page]) parent.append(node);
      }
      // Docked shortcuts belong to the HUD root in the bottom-left corner, not the YOU page.
      if (this.shortcutsDocked) for (const node of shortcuts) this.roots.hotbarVitals.tree.children[0]!.append(node);
      this.compactMounted = compact; this.shortcutsMountedDocked = this.shortcutsDocked;
    }
    for (const page of ['you', 'status', 'zone', 'map'] as const) this.compactViews[page].setStyle({ visible: compact && this.compactPage === page });
    for (const node of [...this.compactTabs, this.compactZone, this.compactMap]) node.setStyle({ visible: compact });
    if (!compact) return;
    const center = this.compactCenter, hasTracker = (this.model?.trackedQuestCount ?? 0) > 0;
    const view = { x: center.x, y: center.y + 18, width: center.width, height: Math.max(0, center.height - 18 - (hasTracker ? 40 : 0)) };
    for (const area of Object.values(this.compactViews)) place(area, view);
    for (const [index, tab] of this.compactTabs.entries()) {
      place(tab, { x: center.x + index * Math.floor(center.width / 2), y: center.y, width: Math.floor(center.width / 2) - 2, height: 16 });
      tab.setProps({ tone: this.compactPage === (index === 0 ? 'you' : 'status') ? 'primary' : 'neutral' });
    }
    place(this.compactZone, { x: 4, y: 4, width: 48, height: 24 });
    place(this.compactMap, { x: this.width - 52, y: 4, width: 48, height: 24 });
    place(this.moon, { x: Math.floor(this.width / 2) - 12, y: 4, width: 24, height: 24 });
    this.moon.setStyle({ visible: Boolean(this.model?.zone.moon) });
    const contentWidth = Math.max(0, center.width - 16), zoneHeight = this.model ? uiZoneHeaderHeight({ ...this.model.zone, collapsed: false }) : UI_ZONE_BANNER_HEIGHT;
    place(this.compactEmptyStatus, { x: 0, y: 0, width: contentWidth, height: 24 });
    // YOU: the hunger strip over the frame, the shortcuts when the corner has no room for them, then the purse.
    place(this.hunger, { x: 4, y: 0, width: 64, height: 9 });
    place(this.player, { x: 0, y: 11, width: 72, height: 29 });
    if (!this.shortcutsDocked) shortcuts.forEach((node, index) => place(node, { x: index * HUD_SHORTCUT.pitch, y: 44, width: HUD_SHORTCUT.width, height: HUD_SHORTCUT.height }));
    place(this.purse, { x: 0, y: this.shortcutsDocked ? 44 : 79, width: Math.min(contentWidth, this.model ? uiPurseWidth(this.model.inventory.balanceBronze) : contentWidth), height: 26 });
    // STATUS: the target's name just above its frame, then the effect strip.
    place(this.targetName, { x: 0, y: 0, width: 72, height: 9 });
    place(this.target, { x: 0, y: 11, width: 72, height: 29 });
    place(this.effectViewport, { x: 0, y: 44, width: contentWidth, height: 28 });
    place(this.zonePanel, { x: 0, y: 0, width: contentWidth, height: zoneHeight });
    place(this.map, { x: 0, y: 0, width: Math.min(contentWidth, 128), height: 112 });
    this.compactBodies.you.setStyle({ height: uiFixed(this.shortcutsDocked ? 70 : 105) });
    this.compactBodies.status.setStyle({ height: uiFixed(72) });
    this.compactBodies.zone.setStyle({ height: uiFixed(zoneHeight) });
    this.compactBodies.map.setStyle({ height: uiFixed(112) });
  }
  draw(context: CanvasRenderingContext2D, surface?: GameHudSurface): void {
    // Keyboard focus moving along the bar doesn't reach the tooltip wrapper; re-anchor it here.
    const tip = this.tipSlot();
    if (tip !== this.shownTipSlot) { this.shownTipSlot = tip; this.hotbarTip?.invalidate(); }
    const surfaces = (surface ? [surface] : Object.keys(this.roots) as GameHudSurface[]).filter(key => this.isVisible(key));
    const now = performance.now();
    for (const key of surfaces) this.roots[key].drawInContext(context, now, undefined, ['base']);
    for (const key of surfaces) this.roots[key].drawInContext(context, now, undefined, ['floating', 'modal', 'toast', 'cursor']);
  }
  dispose(): void { this.model = null; for (const root of Object.values(this.roots)) root.dispose(); }
}
