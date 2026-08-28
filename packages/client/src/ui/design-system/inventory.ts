import {
  clickContainerSlot,
  durabilityFraction,
  itemDefinition,
  itemStacksCompatible,
  maxStackFor,
  pickupAllToCursor,
  quickCraftCursorStack,
  quickMoveItemStack,
  slotAcceptsItem,
  type ContainerSnapshot,
  type CursorClickButton,
  type CursorInteractionResult,
  type ItemStack,
  type QuickCraftMode,
} from '@orchard/sim';
import type { LoadedAsset } from '../../render/assets.js';
import { drawOutlinedPixelText, type PixelUi } from '../../render/pixel-ui.js';
import type { UiRect } from '../geometry.js';
import { snapRectForContext } from '../nine-slice.js';
import {
  drawUiSkinAsset,
  uiAssetFrame,
  type UiSkin,
} from '../skin.js';

export interface UiInventorySlotRef {
  readonly container: string;
  readonly index: number;
}

export interface UiInventoryGestureOptions {
  readonly shift?: boolean;
  readonly double?: boolean;
}

export interface UiInventoryAction {
  readonly ok: boolean;
  readonly status: string;
}

interface QuickCraftGesture {
  readonly button: CursorClickButton;
  readonly mode: QuickCraftMode;
  readonly targets: UiInventorySlotRef[];
}

function cloneContainer(container: ContainerSnapshot): ContainerSnapshot {
  return { ...container, slots: Array.from({ length: container.capacity }, (_, index) => container.slots[index] ?? null) };
}

function cloneContainers(
  containers: Readonly<Record<string, ContainerSnapshot>>,
): Readonly<Record<string, ContainerSnapshot>> {
  return Object.fromEntries(Object.entries(containers).map(([id, container]) => [id, cloneContainer(container)]));
}

function slotKey(ref: UiInventorySlotRef): string {
  return `${ref.container}:${ref.index}`;
}

function pointerButton(button: number): CursorClickButton | null {
  if (button === 0) return 'left';
  if (button === 2) return 'right';
  return null;
}

function cursorStatus(result: CursorInteractionResult): string {
  return result.ok
    ? `${result.outcome.toUpperCase()} ${result.movedQuantity}`
    : result.code.replaceAll('_', ' ').toUpperCase();
}

/**
 * Local interaction harness around the shared item-container authority. It is
 * suitable for previews and optimistic clients; servers still commit the same
 * request against authoritative rows in the actual game.
 */
export class UiInventoryInteractionModel {
  private containersValue: Readonly<Record<string, ContainerSnapshot>>;
  private cursorValue: ItemStack | null;
  private gestureValue: QuickCraftGesture | null = null;
  private statusValue = 'READY — LEFT PICKUP / RIGHT SPLIT / DRAG TO DISTRIBUTE';

  constructor(
    containers: Readonly<Record<string, ContainerSnapshot>>,
    cursor: ItemStack | null = null,
    private readonly destinations: Readonly<Record<string, readonly string[]>> = {},
  ) {
    this.containersValue = cloneContainers(containers);
    this.cursorValue = cursor === null ? null : { ...cursor };
  }

  get containers(): Readonly<Record<string, ContainerSnapshot>> { return this.containersValue; }
  get cursor(): ItemStack | null { return this.cursorValue; }
  get status(): string { return this.statusValue; }
  get dragging(): boolean { return this.gestureValue !== null; }
  get dragMode(): QuickCraftMode | null { return this.gestureValue?.mode ?? null; }
  get dragTargets(): readonly UiInventorySlotRef[] { return this.gestureValue?.targets ?? []; }

  stack(ref: UiInventorySlotRef, preview = true): ItemStack | null {
    const containers = preview ? this.preview().containers : this.containersValue;
    return containers[ref.container]?.slots[ref.index] ?? null;
  }

  displayedCursor(): ItemStack | null {
    return this.preview().cursor;
  }

  canAccept(ref: UiInventorySlotRef, item: ItemStack | null = this.cursorValue): boolean {
    if (item === null) return false;
    const container = this.containersValue[ref.container];
    if (container === undefined || !slotAcceptsItem(container, ref.index, item.itemKind)) return false;
    const target = container.slots[ref.index] ?? null;
    if (target === null) return true;
    if (!itemStacksCompatible(target, item)) return true;
    return target.quantity < (maxStackFor(item.itemKind) ?? 0);
  }

  pointerDown(
    ref: UiInventorySlotRef,
    button: number,
    options: UiInventoryGestureOptions = {},
  ): UiInventoryAction {
    const clickButton = pointerButton(button);
    if (clickButton === null) return this.action(false, 'UNSUPPORTED POINTER BUTTON');
    if (options.shift === true && this.cursorValue === null) return this.quickMove(ref);
    if (options.double === true) return this.pickupAll(ref, clickButton);
    if (this.cursorValue === null) return this.click(ref, clickButton);
    this.gestureValue = {
      button: clickButton,
      mode: clickButton === 'right' ? 'one_each' : 'even',
      targets: [ref],
    };
    this.statusValue = clickButton === 'right' ? 'RIGHT DRAG — ONE PER SLOT' : 'LEFT DRAG — EVEN DISTRIBUTION';
    return { ok: true, status: this.statusValue };
  }

  pointerEnter(ref: UiInventorySlotRef): boolean {
    const gesture = this.gestureValue;
    if (gesture === null || gesture.targets.some((target) => slotKey(target) === slotKey(ref))) return false;
    gesture.targets.push(ref);
    return true;
  }

  pointerUp(ref?: UiInventorySlotRef): UiInventoryAction {
    const gesture = this.gestureValue;
    if (gesture === null) return this.action(false, 'NO ACTIVE SLOT GESTURE');
    if (ref !== undefined) this.pointerEnter(ref);
    this.gestureValue = null;
    if (gesture.targets.length <= 1) return this.click(gesture.targets[0]!, gesture.button);
    const result = quickCraftCursorStack(this.containersValue, this.cursorValue, {
      mode: gesture.mode,
      targets: gesture.targets.map((target) => ({ container: target.container, index: target.index })),
    });
    return this.applyCursorResult(result);
  }

  cancel(): void {
    this.gestureValue = null;
    this.statusValue = 'DRAG CANCELLED — CURSOR STACK PRESERVED';
  }

  private preview(): { readonly containers: Readonly<Record<string, ContainerSnapshot>>; readonly cursor: ItemStack | null } {
    const gesture = this.gestureValue;
    if (gesture === null || gesture.targets.length <= 1) {
      return { containers: this.containersValue, cursor: this.cursorValue };
    }
    const result = quickCraftCursorStack(this.containersValue, this.cursorValue, {
      mode: gesture.mode,
      targets: gesture.targets.map((target) => ({ container: target.container, index: target.index })),
    });
    return result.ok
      ? { containers: result.containers, cursor: result.cursor }
      : { containers: this.containersValue, cursor: this.cursorValue };
  }

  private click(ref: UiInventorySlotRef, button: CursorClickButton): UiInventoryAction {
    return this.applyCursorResult(clickContainerSlot(this.containersValue, this.cursorValue, {
      container: ref.container,
      index: ref.index,
      button,
    }));
  }

  private quickMove(ref: UiInventorySlotRef): UiInventoryAction {
    const destinations = this.destinations[ref.container]
      ?? Object.keys(this.containersValue).filter((id) => id !== ref.container);
    const result = quickMoveItemStack(this.containersValue, {
      fromContainer: ref.container,
      fromIndex: ref.index,
      toContainers: destinations,
    });
    if (!result.ok) return this.action(false, result.code.replaceAll('_', ' ').toUpperCase());
    this.containersValue = result.containers;
    return this.action(true, `${result.outcome.toUpperCase()} ${result.movedQuantity}`);
  }

  private pickupAll(ref: UiInventorySlotRef, button: CursorClickButton): UiInventoryAction {
    if (this.cursorValue === null) {
      const picked = clickContainerSlot(this.containersValue, null, {
        container: ref.container, index: ref.index, button,
      });
      if (!picked.ok) return this.action(false, picked.code.replaceAll('_', ' ').toUpperCase());
      this.containersValue = picked.containers;
      this.cursorValue = picked.cursor;
    }
    const result = pickupAllToCursor(this.containersValue, this.cursorValue, Object.keys(this.containersValue));
    return this.applyCursorResult(result);
  }

  private applyCursorResult(result: CursorInteractionResult): UiInventoryAction {
    if (result.ok) {
      this.containersValue = result.containers;
      this.cursorValue = result.cursor;
    }
    return this.action(result.ok, cursorStatus(result));
  }

  private action(ok: boolean, status: string): UiInventoryAction {
    this.statusValue = status;
    return { ok, status };
  }
}

export type UiItemArtwork = Readonly<Record<string, LoadedAsset>>;

export interface DrawUiInventorySlotOptions {
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly hovered?: boolean;
  readonly accepted?: boolean;
  readonly denied?: boolean;
  readonly hotkey?: string;
  readonly equipmentPlaceholder?: string;
  readonly reticleOutset?: number;
}

const SELECTOR_SOURCE_SIZE = 48;
const SELECTOR_VISIBLE_WIDTH = 27;
const SELECTOR_VISIBLE_HEIGHT = 28;
const SELECTOR_VISIBLE_LEFT = 11;
const SELECTOR_VISIBLE_TOP = 10;

/** Maps the authored selector's transparent 48px canvas so its visible corner
 * marks sit outside the slot instead of covering the slot border or item art. */
export function uiInventorySelectorRect(rect: UiRect, outset = 3): UiRect {
  const safeOutset = Math.max(0, outset);
  const scale = Math.max(
    (rect.width + safeOutset * 2) / SELECTOR_VISIBLE_WIDTH,
    (rect.height + safeOutset * 2) / SELECTOR_VISIBLE_HEIGHT,
  );
  const size = Math.max(1, Math.round(SELECTOR_SOURCE_SIZE * scale));
  return {
    x: Math.round(rect.x - safeOutset - SELECTOR_VISIBLE_LEFT * scale),
    y: Math.round(rect.y - safeOutset - SELECTOR_VISIBLE_TOP * scale),
    width: size,
    height: size,
  };
}

function drawItemArtwork(
  context: CanvasRenderingContext2D,
  rect: UiRect,
  item: ItemStack,
  artwork: UiItemArtwork,
): void {
  const asset = artwork[item.itemKind];
  if (asset === undefined) return;
  const definition = itemDefinition(item.itemKind);
  const frame = uiAssetFrame(asset, definition?.iconAnimation ?? 'base');
  if (frame === null) return;
  const available = Math.max(8, Math.min(rect.width - 12, rect.height - 15, 16));
  const scale = Math.min(available / frame.width, available / frame.height);
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const x = Math.round(rect.x + (rect.width - width) / 2);
  const y = Math.round(rect.y + 5 + (Math.max(1, rect.height - 12) - height) / 2);
  context.save();
  if (item.itemKind === 'lantern' && item.lit === false) {
    context.filter = 'brightness(42%) saturate(55%)';
    context.globalAlpha *= 0.88;
  }
  const destination = snapRectForContext(context, { x, y, width, height });
  context.drawImage(
    asset.image,
    frame.x, frame.y, frame.width, frame.height,
    destination.x, destination.y, destination.width, destination.height,
  );
  context.restore();
}

export function drawUiInventorySlot(
  context: CanvasRenderingContext2D,
  fonts: PixelUi,
  skin: UiSkin,
  artwork: UiItemArtwork,
  rect: UiRect,
  item: ItemStack | null,
  options: DrawUiInventorySlotOptions = {},
): void {
  drawUiSkinAsset(context, skin.slot, rect, options.disabled === true ? 'disabled' : 'idle');
  if (item === null && options.equipmentPlaceholder !== undefined) {
    const placeholder = uiAssetFrame(skin.equipmentSlotIcons, options.equipmentPlaceholder);
    if (placeholder !== null) {
      const destination = snapRectForContext(context, {
        x: Math.round(rect.x + (rect.width - 16) / 2),
        y: Math.round(rect.y + (rect.height - 16) / 2),
        width: 16,
        height: 16,
      });
      context.drawImage(
        skin.equipmentSlotIcons.image,
        placeholder.x, placeholder.y, placeholder.width, placeholder.height,
        destination.x, destination.y, destination.width, destination.height,
      );
    }
  }
  if (item !== null && options.disabled !== true) {
    drawItemArtwork(context, rect, item, artwork);
    if (item.quantity > 1) drawOutlinedPixelText(
      context,
      fonts,
      String(item.quantity),
      rect.x + rect.width - 4,
      rect.y + rect.height - 10,
      { align: 'right', color: '#3f2832', outlineColor: '#f8ead0' },
    );
    const durability = durabilityFraction(item.itemKind, item.durability);
    if (durability !== null) {
      const track = { x: rect.x + 6, y: rect.y + rect.height - 5, width: rect.width - 12, height: 2 };
      context.fillStyle = '#3f2832';
      context.fillRect(track.x, track.y, track.width, track.height);
      const fill = durability > 0.5 ? '#63c74d' : durability > 0.2 ? '#e3a84b' : '#d15b4d';
      context.fillStyle = fill;
      context.fillRect(track.x, track.y, Math.max(1, Math.round(track.width * durability)), 1);
    }
  }
  if (options.hotkey !== undefined) drawOutlinedPixelText(
    context,
    fonts,
    options.hotkey,
    rect.x + 3,
    rect.y + 3,
    { color: '#51351f', outlineColor: '#f8ead0' },
  );
  const selector = options.denied === true ? skin.selectorDeny
    : options.accepted === true || options.selected === true ? skin.selectorConfirm
      : options.hovered === true ? skin.selectorNeutral : null;
  if (selector !== null) drawUiSkinAsset(
    context,
    selector,
    uiInventorySelectorRect(rect, options.reticleOutset),
    'idle',
  );
}

export function uiInventoryStackName(item: ItemStack | null): string {
  if (item === null) return 'EMPTY';
  const name = itemDefinition(item.itemKind)?.displayName ?? item.itemKind.replaceAll('_', ' ');
  return `${name.toUpperCase()} ×${item.quantity}`;
}
