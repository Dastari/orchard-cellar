import { drawTimingPane } from './kit/components/timing-canvas.js';
import type {
  ContentRegistry,
  FrameContentDefinition,
  TimingProjection,
  FrameRestrictionRegistry,
  SlotRestriction,
} from '@orchard/sim';
import { frameEntitySlotIndexes, resolveFrameSlotRestriction } from '@orchard/sim/content/frame-runtime';
import { EQUIPMENT_SLOT_RESTRICTIONS, inventoryContainerSlotCount } from '@orchard/sim/inventory-layout';
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
export { frameRestrictions, resolveFrameSlotRestriction } from '@orchard/sim/content/frame-runtime';

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
  readonly timing?: TimingProjection;
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

/** The size of the containers a frame shows: the open entity's (a chest's or placeable's `container.slotCount`, the
 * stash's `stashCapacity`), for panes bound to `entitySlots: all`. */
export interface FrameContainerCapacities {
  readonly entity?: number;
  /** The player's accessible backpack capacity (the sim's one capacity rule), which a pane bound to the backpack shows
   * in full. A preview without a player shows one grid of it. */
  readonly backpack?: number;
}

/** A frame's entity container size when no entity says (a designer or lab preview, a host layout, a test): the active
 * hearth lobby's `stashCapacity` for a stash frame, or the container of the first live object that uses the frame.
 * Undefined when the registry doesn't say (a view with only items and processes; a pane bound to `entitySlots: all`
 * then shows one grid). */
export function frameDefaultEntityCapacity(definition: Pick<FrameContentDefinition, 'id' | 'presentation'>, registry: unknown): number | undefined {
  const content = registry as Partial<Pick<ContentRegistry, 'objects' | 'spaces'>>;
  if (definition.presentation?.entityContainer === 'stash') {
    for (const space of content.spaces?.values() ?? []) {
      if (space.retired !== true && space.generator === 'delve_lobby' && space.hearthLobby) return space.hearthLobby.stashCapacity;
    }
    return undefined;
  }
  for (const object of content.objects?.values() ?? []) {
    if (object.retired !== true && object.components.frame?.ref === definition.id && object.components.container) return object.components.container.slotCount;
  }
  return undefined;
}

export function resolveFramePaneSlots(
  pane: FramePaneDefinition,
  aliases: FrameContainerAliases,
  registry: Pick<FrameRegistryView, 'items' | 'processes'>,
  capacities: FrameContainerCapacities = {},
): readonly ResolvedFrameSlotBinding[] {
  if (pane.kind !== 'slots' && pane.kind !== 'paper_doll') return [];
  const containerId = bindingContainer(pane.bind, aliases);
  if (containerId === null) return [];
  const grid = (pane.columns ?? 1) * (pane.rows ?? 1);
  // A pane bound to a whole container binds every slot of it and scrolls (its rows are the rows shown): the open
  // entity with `entitySlots: all`, and the backpack, whose pane shows every cell the bag opens (Uncapped Storage steps
  // 3 and 5). A designer preview without an entity or a player shows one grid of it. Other self panes keep their grid.
  const indices = 'entitySlots' in pane.bind
    ? frameEntitySlotIndexes(pane.bind, pane.bind.entitySlots === 'all' ? capacities.entity ?? grid : 0)
    : Array.from({ length: 'self' in pane.bind
      ? pane.bind.self === 'backpack' ? capacities.backpack ?? grid : Math.min(grid, inventoryContainerSlotCount(pane.bind.self))
      : grid }, (_, index) => index);
  const restriction = resolveFrameSlotRestriction(pane.restriction, registry);
  return indices.map((index) => ({
    containerId,
    index,
    ...(restriction === undefined ? {} : { restriction }),
  }));
}

/** The restriction the authority applies to one bound slot, and nothing it does not: entity panes carry their
 * resolved frame restriction (the server's `frameRestrictions`), equipment slots the equipment rules
 * (`EQUIPMENT_SLOT_RESTRICTIONS`, as the server's player inventory loads them), and other self panes none, because
 * the server ignores their restrictions (BUG-047, BUG-050). */
export function frameSlotAuthorityRestriction(
  pane: Pick<FramePaneDefinition, 'bind'>,
  binding: Pick<ResolvedFrameSlotBinding, 'index' | 'restriction'>,
): SlotRestriction | undefined {
  if ('entitySlots' in pane.bind) return binding.restriction;
  if ('self' in pane.bind && pane.bind.self === 'equipment') return EQUIPMENT_SLOT_RESTRICTIONS[binding.index];
  return undefined;
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
    ...('timing' in pane.bind ? { slotSize: { width: pane.minWidth ?? 100, height: 44 } } : {}),
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
      slots: resolveFramePaneSlots(pane, aliases, registry, { entity: frameDefaultEntityCapacity(definition, registry) }),
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
    if ('timing' in pane.definition.bind) {
      if (model.timing) drawTimingPane(context, pane.layout.grid, model.timing, renderer);
      continue;
    }
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
