import { type FrameContentDefinition } from '@orchard/sim';
import { EQUIPMENT_SLOT_OFFSET, itemDefinition, runtimeItemDefinition, type ContentRegistry, type MoonPhase } from '@orchard/sim';
import { measurePixelText } from '../pixel-ui.js';
import { type UiPoint, type UiRect } from '../geometry.js';
import type { FrameSurface, OverworldUiInventorySlot, OnlinePlayerListEntry } from './contracts.js';

export function contentFrameDefinitionForSurface(
  frames: ReadonlyMap<string, FrameContentDefinition>,
  surface: FrameSurface,
): FrameContentDefinition | null {
  return [...frames.values()].find((definition) => definition.retired !== true
    && definition.presentation?.surface === surface) ?? null;
}

export const SYSTEM_MENU_TITLE = 'GAME MENU';

export const ONLINE_PLAYER_IDLE_THRESHOLD_MINUTES = 10;

export const MICROS_PER_MINUTE = 60_000_000n;

export function onlinePlayerIdleMinutes(
  lastActiveAtMicros: bigint,
  nowMillis = Date.now(),
): number | null {
  if (lastActiveAtMicros <= 0n) return null;
  const elapsedMicros = BigInt(Math.floor(nowMillis)) * 1_000n - lastActiveAtMicros;
  const threshold = BigInt(ONLINE_PLAYER_IDLE_THRESHOLD_MINUTES) * MICROS_PER_MINUTE;
  return elapsedMicros > threshold ? Number(elapsedMicros / MICROS_PER_MINUTE) : null;
}

export function onlinePlayerListLabel(player: OnlinePlayerListEntry): string {
  const selfSuffix = player.self ? '  (YOU)' : '';
  const idleSuffix = player.idleMinutes === null ? '' : `  (idle ${player.idleMinutes} min)`;
  return `${player.displayName}${selfSuffix}${idleSuffix}`;
}

export function nextHomesteadMemberRole(
  role: OnlinePlayerListEntry['homesteadRole'],
): 'guest' | 'worker' | 'builder' | null {
  if (role === null || role === undefined) return 'guest';
  if (role === 'guest') return 'worker';
  if (role === 'worker') return 'builder';
  return null;
}

export function processorCountdownLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  const remaining = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(remaining / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  const secs = remaining % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export const MOON_PHASE_LABELS: Readonly<Record<MoonPhase, string>> = {
  full_moon: 'Full Moon',
  waning_gibbous: 'Waning Gibbous',
  last_quarter: 'Last Quarter',
  waning_crescent: 'Waning Crescent',
  new_moon: 'New Moon',
  waxing_crescent: 'Waxing Crescent',
  first_quarter: 'First Quarter',
  waxing_gibbous: 'Waxing Gibbous',
};

export const RING_EQUIPMENT_SLOT_INDEX = 2;

/** The time readout is an equipment effect, not an inventory possession
 * effect. A watch in the backpack or hotbar must not reveal it. */
export function hasEquippedWatch(inventory: readonly OverworldUiInventorySlot[]): boolean {
  return inventory.some((slot) => slot.slot === EQUIPMENT_SLOT_OFFSET + RING_EQUIPMENT_SLOT_INDEX
    && slot.itemKind === 'watch' && slot.quantity > 0);
}

export function watchStatusLabel(
  timeLabel: string,
  dateLabel: string,
  moonPhase: MoonPhase | undefined,
): string {
  const moonLabel = moonPhase === undefined ? 'Moon Unknown' : MOON_PHASE_LABELS[moonPhase];
  return `Time ${timeLabel} · ${dateLabel} · ${moonLabel}`;
}

/** 0 outside, 1 shadow, 2 illuminated. Waxing grows on the right; waning
 * recedes on the left, matching docs/27 §7. */
export function moonPhasePixel(phase: MoonPhase, x: number, y: number): 0 | 1 | 2 {
  const dx = x - 3;
  const dy = y - 3;
  if (dx * dx + dy * dy > 10) return 0;
  let lit = false;
  if (phase === 'full_moon') lit = true;
  else if (phase === 'waxing_gibbous') lit = x >= 1;
  else if (phase === 'first_quarter') lit = x >= 3;
  else if (phase === 'waxing_crescent') lit = x >= 5 || (x === 4 && Math.abs(dy) <= 1);
  else if (phase === 'waning_gibbous') lit = x <= 5;
  else if (phase === 'last_quarter') lit = x <= 3;
  else if (phase === 'waning_crescent') lit = x <= 1 || (x === 2 && Math.abs(dy) <= 1);
  return lit ? 2 : 1;
}

export const HOTBAR_RETICLE_SIZE = 60;

export const HUD_RESOURCE_FRAME_SCALE = 1;

export const NAMEPLATE_HORIZONTAL_PADDING = 5;

export const NAMEPLATE_HEIGHT = 11;

export const ONLINE_PLAYER_LIST_BOTTOM_PADDING = 12;

export const ONLINE_PLAYER_LIST_CONTENT_TOP = 29;

export const ONLINE_PLAYER_LIST_ROW_HEIGHT = 12;

export function nameplateRect(centerX: number, y: number, text: string, leadingIcon = false): UiRect {
  const width = measurePixelText(fitLabel(text, 20))
    + NAMEPLATE_HORIZONTAL_PADDING * 2
    + (leadingIcon ? 9 : 0);
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(y),
    width,
    height: NAMEPLATE_HEIGHT,
  };
}

export function offlineNameplateFrameAt(elapsedMs: number, frameCount: number, fps = 6): number {
  if (!Number.isFinite(elapsedMs) || frameCount <= 0 || fps <= 0) return 0;
  return Math.floor(Math.max(0, elapsedMs) * fps / 1_000) % Math.max(1, Math.floor(frameCount));
}

export function isNameplateToggle(code: string, repeat: boolean): boolean {
  return code === 'KeyN' && !repeat;
}

/** Full-interface visibility shortcut. */
export function isInterfaceVisibilityToggle(
  code: string,
  repeat: boolean,
  textEntryActive = false,
): boolean {
  return code === 'KeyZ' && !repeat && !textEntryActive;
}

export function onlinePlayerListFrameHeight(contentRows: number): number {
  return ONLINE_PLAYER_LIST_CONTENT_TOP
    + Math.max(0, contentRows) * ONLINE_PLAYER_LIST_ROW_HEIGHT
    + ONLINE_PLAYER_LIST_BOTTOM_PADDING;
}

export function onlinePlayerListCloseButtonRect(frame: UiRect): UiRect {
  return {
    x: frame.x + frame.width - 25,
    y: frame.y + 8,
    width: 16,
    height: 16,
  };
}

/** Lower-right quantity label position inside the slot's usable face. The
 * bottom six rows belong to the bevel and must not be treated as content. */
export function slotStackLabelPosition(rect: UiRect): UiPoint {
  return {
    x: rect.x + rect.width - 5,
    y: rect.y + rect.height - 14,
  };
}

export function slotDurabilityBarRect(rect: UiRect): UiRect {
  return { x: rect.x + 5, y: rect.y + rect.height - 7, width: rect.width - 10, height: 3 };
}

/** Centres the selector's transparent 60 px canvas around a slot. Its opaque
 * corners then sit a few pixels outside the bevel instead of covering labels. */
export function hotbarReticleRect(rect: UiRect): UiRect {
  return {
    x: Math.round(rect.x + (rect.width - HOTBAR_RETICLE_SIZE) / 2),
    y: Math.round(rect.y + (rect.height - HOTBAR_RETICLE_SIZE) / 2),
    width: HOTBAR_RETICLE_SIZE,
    height: HOTBAR_RETICLE_SIZE,
  };
}

export function itemIconAnimation(itemKind: string, registry?: ContentRegistry): string {
  return (registry === undefined ? null : runtimeItemDefinition(registry, itemKind))
    ?.iconAnimation ?? itemDefinition(itemKind)?.iconAnimation ?? 'base';
}

export function fitLabel(text: string, characters: number): string {
  return text.length <= characters ? text : `${text.slice(0, Math.max(0, characters - 3))}...`;
}
