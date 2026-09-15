import type {
  FrameContentDefinition,
  FrameRestrictionRegistry,
  SlotRestriction,
} from '@orchard/sim';
import { resolveFrameSlotRestriction, inventoryContainerSlotCount } from '@orchard/sim';
import type { PixelUi } from './pixel-ui.js';
import { drawPixelTextInRect } from './pixel-ui.js';
import type { UiPoint, UiRect, UiSize } from './geometry.js';
import { containsPoint } from './geometry.js';
import type { UiSkin } from './skin.js';
import { drawUiSkinAsset } from './skin.js';
import { drawFantasyButton, type FantasyButtonTone } from './design-system/fantasy-controls.js';
import {
  drawStorageFrameChrome,
  drawStorageResizeHandles,
  layoutStorageFrame,
  type StorageFrameLayout,
  type StorageFrameSpec,
  type StoragePaneLayout,
} from './storage-frame.js';

type FramePaneDefinition = FrameContentDefinition['panes'][number];
type FrameBinding = FramePaneDefinition['bind'];
type FrameButtonDefinition = NonNullable<FrameContentDefinition['buttons']>[number];

export type FrameRegistryView = FrameRestrictionRegistry;
export { frameRestrictions, resolveFrameSlotRestriction } from '@orchard/sim';

export interface FrameContainerAliases {
  readonly backpack?: string;
  readonly hotbar?: string;
  readonly equipment?: string;
  readonly crafting?: string;
  readonly entity?: string;
  readonly merchant?: string;
}

export interface ResolvedFrameSlotBinding {
  readonly containerId: string;
  readonly index: number;
  readonly restriction?: SlotRestriction;
}

export interface ContentFramePaneLayout {
  readonly definition: FramePaneDefinition;
  readonly layout: StoragePaneLayout;
  readonly slots: readonly ResolvedFrameSlotBinding[];
}

export interface ContentFrameButtonLayout {
  readonly definition: FrameButtonDefinition;
  readonly rect: UiRect;
}

export interface ContentFrameLayout {
  readonly definition: FrameContentDefinition;
  readonly storage: StorageFrameLayout;
  readonly panes: readonly ContentFramePaneLayout[];
  readonly buttons: readonly ContentFrameButtonLayout[];
}

export interface ContentFrameRenderModel {
  readonly progress?: number;
  readonly state?: Readonly<Record<string, boolean | string | number>>;
}

export interface ContentFrameRenderer {
  readonly skin: UiSkin;
  readonly fonts: PixelUi;
  readonly pointer?: UiPoint;
  readonly drawSlot: (
    context: CanvasRenderingContext2D,
    pane: ContentFramePaneLayout,
    rect: UiRect,
    binding: ResolvedFrameSlotBinding,
  ) => void;
  /** Specialized data sources such as recipe/search rows and merchant offers
   * remain pluggable without giving them their own frame chrome or layout. */
  readonly drawPane?: (
    context: CanvasRenderingContext2D,
    pane: ContentFramePaneLayout,
  ) => boolean;
  readonly drawButtons?: boolean;
  readonly drawResizeHandles?: boolean;
}

function bindingContainer(binding: FrameBinding, aliases: FrameContainerAliases): string | null {
  if ('entitySlots' in binding) return aliases.entity ?? null;
  if ('self' in binding) return aliases[binding.self] ?? null;
  if ('merchant' in binding) return aliases.merchant ?? null;
  return null;
}

export function resolveFramePaneSlots(
  pane: FramePaneDefinition,
  aliases: FrameContainerAliases,
  registry: Pick<FrameRegistryView, 'items' | 'processes'>,
): readonly ResolvedFrameSlotBinding[] {
  if (pane.kind !== 'slots' && pane.kind !== 'paper_doll') return [];
  const containerId = bindingContainer(pane.bind, aliases);
  if (containerId === null) return [];
  const indices = 'entitySlots' in pane.bind
    ? pane.bind.entitySlots
    : Array.from({ length: 'self' in pane.bind
      ? Math.min((pane.columns??1)*(pane.rows??1),inventoryContainerSlotCount(pane.bind.self))
      : (pane.columns??1)*(pane.rows??1) },(_,index)=>index);
  const restriction = resolveFrameSlotRestriction(pane.restriction, registry);
  return indices.map((index) => ({
    containerId,
    index,
    ...(restriction === undefined ? {} : { restriction }),
  }));
}

function storagePane(pane: FramePaneDefinition): StorageFrameSpec['panes'][number] {
  const isGrid = pane.kind === 'slots' || pane.kind === 'paper_doll';
  const verticalProgress = pane.kind === 'bar';
  return {
    id: pane.id,
    label: pane.label ?? '',
    columns: isGrid ? pane.columns ?? 1 : 1,
    rows: isGrid ? pane.rows ?? 1 : verticalProgress ? 3 : 1,
    ...(pane.sizing === undefined ? {} : { sizing: pane.sizing }),
    ...(pane.alignment === undefined ? {} : { alignment: pane.alignment }),
    ...(pane.style === undefined ? {} : { style: pane.style }),
    ...(pane.minWidth === undefined ? {} : { minWidth: pane.minWidth }),
    ...(verticalProgress ? { slotSize: { width: 16, height: 31 }, rowGap: 0 } : {}),
  };
}

export function frameStorageSpec(definition: FrameContentDefinition): StorageFrameSpec {
  return {
    title: definition.title,
    style: definition.style,
    panes: definition.panes.map(storagePane),
    ...(definition.preferredWidth === undefined ? {} : { preferredWidth: definition.preferredWidth }),
    ...(definition.resizable === undefined ? {} : { resizable: definition.resizable }),
    ...(definition.hotbar === undefined ? {} : { hotbar: { label: definition.hotbar.label } }),
    ...((definition.buttons?.length ?? 0) === 0 && definition.presentation?.entityContainer !== 'chest'
      ? {} : { footerHeight: ((definition.buttons?.length ?? 0) > 0 ? 22 : 0)
        + (definition.presentation?.entityContainer === 'chest' ? 26 : 0) }),
  };
}

/** Search shares the space between the chest panes and the hotbar. */
export function chestInventorySearchRect(frame: ContentFrameLayout): UiRect | null {
  if (frame.definition.presentation?.surface !== 'entity'
    || frame.definition.presentation.entityContainer !== 'chest') return null;
  return {
    x: frame.storage.frame.x + 17,
    y: Math.max(...frame.panes.map(({ layout }) => layout.grid.y + layout.grid.height)) + 4,
    width: frame.storage.frame.width - 34,
    height: 22,
  };
}

function frameButtons(
  frame: StorageFrameLayout,
  definitions: readonly FrameButtonDefinition[],
): readonly ContentFrameButtonLayout[] {
  if (definitions.length === 0) return [];
  const gap = 5;
  const width = Math.max(32, Math.floor((frame.frame.width - 34 - gap * (definitions.length - 1)) / definitions.length));
  const totalWidth = definitions.length * width + (definitions.length - 1) * gap;
  const x = frame.frame.x + Math.round((frame.frame.width - totalWidth) / 2);
  const y = (frame.divider?.y ?? frame.frame.y + frame.frame.height - 17) - 27;
  return definitions.map((definition, index) => ({
    definition,
    rect: { x: x + index * (width + gap), y, width, height: 22 },
  }));
}

export function layoutContentFrame(
  viewport: UiSize,
  definition: FrameContentDefinition,
  aliases: FrameContainerAliases,
  registry: Pick<FrameRegistryView, 'items' | 'processes'>,
  requestedFrame?: UiRect,
): ContentFrameLayout {
  const storage = layoutStorageFrame(viewport, frameStorageSpec(definition), requestedFrame);
  return {
    definition,
    storage,
    panes: definition.panes.map((pane, index) => ({
      definition: pane,
      layout: storage.panes[index]!,
      slots: resolveFramePaneSlots(pane, aliases, registry),
    })),
    buttons: frameButtons(storage, definition.buttons ?? []),
  };
}

function buttonVisible(
  button: FrameButtonDefinition,
  state: Readonly<Record<string, boolean | string | number>>,
): boolean {
  return button.visibleWhen === undefined || state[button.visibleWhen.state] === button.visibleWhen.equals;
}

export function contentFramePaneVisible(
  pane: FramePaneDefinition,
  state: Readonly<Record<string, boolean | string | number>> = {},
): boolean {
  return pane.visibleWhen === undefined || state[pane.visibleWhen.state] === pane.visibleWhen.equals;
}

/** The single content-frame renderer. Pane-specific datasets can supply a
 * drawPane callback, while all frame chrome, labels, slots, bars, buttons and
 * resize affordances retain one deterministic rendering path. */
export function drawContentFrame(
  context: CanvasRenderingContext2D,
  layout: ContentFrameLayout,
  model: ContentFrameRenderModel,
  renderer: ContentFrameRenderer,
): void {
  drawStorageFrameChrome(context, renderer.skin, layout.storage);
  const state = model.state ?? {};
  for (const pane of layout.panes) {
    if (!contentFramePaneVisible(pane.definition, state)) continue;
    if (renderer.drawPane?.(context, pane) === true) continue;
    if (pane.definition.label) drawPixelTextInRect(context, renderer.fonts, pane.definition.label, {
      x: pane.layout.labelPosition.x,
      y: pane.layout.labelPosition.y,
      width: pane.layout.region.width,
      height: 10,
    }, { color: '#6b4428', overflow: 'ellipsis' });
    if (pane.definition.kind === 'bar') {
      const value = 'state' in pane.definition.bind ? state[pane.definition.bind.state] : model.progress;
      const progress = typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value)) : 0;
      const rect = pane.layout.grid;
      drawUiSkinAsset(context, renderer.skin.frameThin, rect);
      context.fillStyle = '#b87836';
      context.fillRect(rect.x + 3, rect.y + rect.height - 3 - Math.round((rect.height - 6) * progress), rect.width - 6, Math.round((rect.height - 6) * progress));
      continue;
    }
    if ('state' in pane.definition.bind) {
      const value = state[pane.definition.bind.state];
      if (value !== undefined) drawPixelTextInRect(context, renderer.fonts, String(value), pane.layout.grid,
        { color: '#6b4428', overflow: 'ellipsis' });
    }
    pane.slots.forEach((binding, index) => {
      const rect = pane.layout.slots[index];
      if (rect !== undefined) renderer.drawSlot(context, pane, rect, binding);
    });
  }
  for (const button of renderer.drawButtons === false ? [] : layout.buttons) {
    if (!buttonVisible(button.definition, state)) continue;
    const tone: FantasyButtonTone = button.definition.tone === 'success' ? 'green'
      : button.definition.tone === 'danger' ? 'red' : 'peach';
    drawFantasyButton(context, renderer.skin, renderer.fonts, button.rect, {
      tone,
      hovered: containsPoint(button.rect, renderer.pointer ?? { x: -1, y: -1 }),
      hoverOutline: 'gold',
    });
    drawPixelTextInRect(context, renderer.fonts, button.definition.label, button.rect, {
      align: 'center', verticalAlign: 'center', color: '#5f3b24', overflow: 'ellipsis',
    });
  }
  if (renderer.drawResizeHandles !== false) drawStorageResizeHandles(context, layout.storage);
}

export function contentFrameButtonAt(
  layout: ContentFrameLayout,
  point: UiPoint,
  state: Readonly<Record<string, boolean | string | number>> = {},
): FrameButtonDefinition | null {
  return layout.buttons.find(({ definition, rect }) => buttonVisible(definition, state) && containsPoint(rect, point))?.definition ?? null;
}
