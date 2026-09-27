import type { ContentRegistry, FrameContentDefinition, FrameRestrictionRegistry, ItemStack, TimingProjection } from '@orchard/sim';
import type { FrameContainerAliases } from '../content-frame.js';
import type { UiPoint, UiRect } from '../geometry.js';
import { containsPoint } from '../geometry.js';
import { UiRoot } from '../kit/runtime/root.js';
import { CanvasTextEditor } from '../kit/runtime/text-editor.js';
import { UiElement, type UiElementKey } from '../kit/runtime/element.js';
import type { UiInventorySlotRef } from '../kit/runtime/inventory.js';
import { UiSlotController, type UiSlotGestures } from '../kit/components/slot-controller.js';
import { uiContentFrame, type UiContentFrameElement } from '../kit/components/content-frame.js';
import { uiViewport } from '../kit/components/viewport.js';
import { uiCraftingFrame, type UiCraftingFrameElement, type UiCraftingSnapshot } from '../kit/components/crafting-frame.js';
import { UiInventoryFilter, type UiInventoryControls } from '../kit/components/inventory-panel.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiSlotArt } from '../kit/components/slot-art.js';
import { uiHeldStack, uiSlotView, type UiSlotOptions } from '../kit/components/inventory.js';

export interface InventoryMenuSnapshot {
  readonly width: number; readonly height: number;
  readonly definition: FrameContentDefinition;
  readonly aliases: FrameContainerAliases;
  readonly registry: Pick<FrameRestrictionRegistry, 'items' | 'processes'>;
  readonly state: Readonly<Record<string, boolean | number | string>>;
  readonly timing?: TimingProjection;
  readonly progress?: number;
  readonly crafting?: UiCraftingSnapshot;
  readonly backpackCapacity: number;
  readonly filter: string;
  readonly recipeFilter: string;
  readonly artwork: NonNullable<UiSlotOptions['artwork']>;
  /** Paints the wearer into the paper-doll well. */
  readonly portrait?: (context: CanvasRenderingContext2D, bounds: UiRect) => void;
  /** The selected hotbar slot, shown on the window's footer hotbar. */
  readonly selectedHotbar?: number;
}

/** Presentation boundary. Every mutation remains in OverworldUi: slot gestures run in the kit's shared
 * `UiSlotGestures`, whose source and authority the host implements. */
export interface InventoryMenuAuthority {
  /** The host's slot gesture state machine, shared with its own hit-tested input. */
  readonly gestures: UiSlotGestures;
  /** The held stack as drawn: the original stack while a spread is previewed. */
  displayedCursor(): ItemStack | null;
  hover(point: UiPoint): void;
  key(event: UiElementKey): boolean;
  close(): void;
  invoke(interaction: string): void;
  sort(container: string): void;
  filter(value: string): void;
  recipeFilter(value: string): void;
  recipe(id: string): void;
  craft(all: boolean): void;
  label(item: ItemStack): string;
  iconAnimation(item: ItemStack): string;
  /** The live content registry, so slot wear bars read authored (published or Studio) durability. */
  contentRegistry?(): ContentRegistry | undefined;
  /** Item art for the held stack, which also shows over windows the host still draws. Defaults to the open frame's. */
  artwork?(): NonNullable<UiSlotOptions['artwork']>;
}

/** One stable unbound root; neither this adapter nor its controller owns stacks. */
export class InventoryMenus {
  readonly root: UiRoot;
  readonly controller: UiSlotController;
  private frame: UiContentFrameElement | UiCraftingFrameElement | null = null;
  private snapshot: InventoryMenuSnapshot | null = null;
  private definition: FrameContentDefinition | null = null;
  private readonly filter = new UiInventoryFilter();

  /** The held stack's own root, so it draws above every overlay and over any inventory window. */
  private readonly heldRoot: UiRoot;
  private heldPoint: UiPoint | null = null;

  constructor(art: UiKitArt, private readonly authority: InventoryMenuAuthority) {
    this.root = new UiRoot({ art, scale: 1, label: 'Inventory menu' });
    this.controller = new UiSlotController(authority.gestures, {
      displayedCursor: () => authority.displayedCursor(), contains: point => this.contains(point),
    });
    this.heldRoot = new UiRoot({ art, scale: 1, label: 'Held stack' });
    this.heldRoot.mount(uiHeldStack({ id: 'game.inventory-menus.held-stack', controller: this.controller, point: () => this.heldPoint,
      refusesAt: point => this.refusesAt(point),
      art: uiSlotArt({ artwork: () => authority.artwork?.() ?? this.snapshot?.artwork, iconAnimation: item => authority.iconAnimation(item), contentRegistry: () => authority.contentRegistry?.() }) }));
  }
  private get cursor(): ItemStack | null { return this.authority.gestures.source.cursor(); }

  get active(): boolean { return this.snapshot !== null && this.frame !== null && !this.root.disposed; }
  contains(point: UiPoint): boolean { return this.frame !== null && containsPoint(this.frame.rect, point); }

  slotAt(point: UiPoint): { ref: UiInventorySlotRef; rect: UiRect } | null {
    this.root.arrange();
    for (const node of this.root.input.hits(point)) {
      const binding = node.props['binding'] as UiInventorySlotRef | undefined;
      if (binding) return { ref: binding, rect: node.rect };
    }
    return null;
  }

  itemAt(point: UiPoint): ItemStack | null {
    const slot = this.slotAt(point);
    if (slot) {
      const actual = this.authority.gestures.source.stack(slot.ref);
      const ghost = slot.ref.container === 'crafting' ? this.snapshot?.crafting?.pattern[slot.ref.index] : null;
      return actual ?? (ghost ? { itemKind: ghost, quantity: 1 } : null);
    }
    return this.root.input.hits(point).some(node => node.label === 'Craft result')
      ? this.snapshot?.crafting?.output ?? null : null;
  }

  tooltipAt(point: UiPoint): string | null {
    const hits = this.root.input.hits(point);
    if (hits.some(node => node.label === 'Craft result') && this.snapshot?.crafting?.requirement) return this.snapshot.crafting.requirement;
    if (hits.some(node => node.label === 'Sort inventory')) return 'SORT & STACK';
    const item = this.itemAt(point);
    return item ? this.authority.label(item).toUpperCase() : null;
  }

  update(snapshot: InventoryMenuSnapshot | null): void {
    if (this.root.disposed) return;
    if (snapshot === null) {
      if (this.active) { this.root.input.cancelPointers(); this.controller.cancel(); }
      this.snapshot = null;
      this.root.tree.setStyle({ visible: false });
      return;
    }
    this.snapshot = snapshot;
    this.root.tree.setStyle({ visible: true });
    this.root.resize(snapshot.width, snapshot.height, 1);
    if (this.filter.editor.snapshot().value !== snapshot.filter) {
      this.filter.editor.setValue(snapshot.filter); this.filter.refresh();
    }
    if (this.definition !== snapshot.definition) this.build(snapshot);
    this.frame!.updateState(snapshot.state);
    this.frame!.updateTiming(snapshot.timing ?? { status: 'idle', reason: null, stage: null, progress: 0,
      remainingActiveTicks: null, nextTransitionTick: null, confidence: 'estimated' });
    if (snapshot.crafting && 'updateCrafting' in this.frame!) { this.frame.updateCrafting(snapshot.crafting); this.frame.setCraftingViewport(snapshot.width - 8, snapshot.height - 8); }
    // Windows fit their content (approved redesign); the centring wrapper places them.
    this.controller.refresh();
    this.root.arrange();
  }

  private build(snapshot: InventoryMenuSnapshot): void {
    this.root.input.cancelPointers(); this.controller.cancel();
    for (const child of [...this.root.tree.children]) child.dispose();
    this.root.tree.replaceChildren([]);
    this.definition = snapshot.definition;
    const chest = snapshot.aliases.entity === 'chest';
    const controls = (container: string, showFilter: boolean): UiInventoryControls => ({
      filterModel: this.filter, showFilter, sortEnabled: () => this.cursor === null,
      onFilter: value => this.authority.filter(value), onSort: () => this.authority.sort(container),
      itemLabel: item => this.authority.label(item),
      capacity: () => container === 'backpack' ? this.snapshot?.backpackCapacity ?? 0 : Infinity,
    });
    const options = {
      definition: snapshot.definition, aliases: snapshot.aliases, registry: snapshot.registry,
      controller: this.controller, artwork: snapshot.artwork, state: snapshot.state, timing: snapshot.timing,
      progress: () => this.snapshot?.progress ?? 0,
      iconAnimation: (item: ItemStack) => this.authority.iconAnimation(item),
      contentRegistry: () => this.authority.contentRegistry?.(),
      inventoryControls: { backpack: controls('backpack', !chest),
        ...(chest ? { chest: controls('chest', true) } : {}),
        ...(snapshot.aliases.entity === 'placeable' && snapshot.definition.id === 'frame:barrel' ? { placeable: { onSort: () => this.authority.sort('placeable'),
          showFilter: false, sortEnabled: () => this.cursor === null } } : {}),
      },
      onInvoke: (id: string) => this.authority.invoke(id), onClose: () => this.authority.close(),
      portrait: uiViewport({ label: 'Character preview', render: (context, bounds) => this.snapshot?.portrait?.(context, bounds) }),
      hotbarSelected: () => this.snapshot?.selectedHotbar ?? -1,
    };
    this.frame = snapshot.crafting ? uiCraftingFrame({ ...options, crafting: snapshot.crafting,
      recipeFilter: snapshot.recipeFilter, onRecipe: id => this.authority.recipe(id),
      onRecipeFilter: query => this.authority.recipeFilter(query), onCraft: all => this.authority.craft(all),
    }) : uiContentFrame(options);
    this.root.mount(new UiElement({ id: 'game.inventory-menus', kind: 'inventory-menus',
      props: { touchScroll: true, singlePointer: true }, style: { display: 'flex', justify: 'center', align: 'center', width: 'grow', height: 'grow', zLayer: 'modal' },
      pointerMode: 'capture', children: [this.frame],
      onPointerObserved: event => this.authority.hover(event.point),
      onPointer: event => this.controller.backgroundPointer(event, this.contains(event.point)),
      onKeyCapture: event => {
        const focused = this.root.focus.current;
        const editor = focused?.props['editor'];
        if (editor instanceof CanvasTextEditor && (event.key === 'Escape' || event.key === 'Enter')) {
          const value = editor.snapshot().value;
          if (event.key === 'Escape' && value) {
            editor.setSelection(0, value.length);
            focused!.hooks.onBeforeInput?.({ inputType: 'deleteContentBackward' }, focused!);
          } else this.root.focus.set(null);
          return true;
        }
        return event.key === 'Escape' ? this.authority.key(event) : false;
      },
      // Native editors keep all typing and modifier shortcuts out of gameplay.
      onKey: event => this.root.focus.current?.props['editor'] ? false : this.authority.key(event), onDismiss: () => this.authority.close(),
    }));
  }

  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  /** The held stack under the pointer, composited by the host after every other overlay and just under the system
   * cursor. It is the kit's `uiHeldStack` on its own root, so it also shows over the one inventory window still drawn
   * by the host (the hearth stash). */
  drawHeldStack(context: CanvasRenderingContext2D, pointer: UiPoint, width: number, height: number): void {
    if (this.heldRoot.disposed || this.authority.displayedCursor() === null) return;
    this.heldPoint = pointer;
    if (this.heldRoot.viewport.width !== width || this.heldRoot.viewport.height !== height) this.heldRoot.resize(width, height, 1);
    this.heldRoot.drawInContext(context);
  }
  /** Whether the slot under a point refuses the held stack: the kit slot's own verdict (its rules through the sim's
   * `slotAcceptsItem`), or, over a slot the host still draws, the authority's rule from the gesture source. */
  private refusesAt(point: UiPoint): boolean {
    const cursor = this.authority.displayedCursor(); if (cursor === null) return false;
    const kit = this.active ? this.controller.slotAt(point) : undefined;
    if (kit) return uiSlotView(kit.element)?.dropTarget === 'refuse';
    if (this.active) return false;
    const { source } = this.authority.gestures, ref = source.slotAt(point);
    return ref !== null && !source.accepts(ref, cursor.itemKind);
  }
  dispose(): void { this.controller.dispose(); this.root.dispose(); this.heldRoot.dispose(); this.snapshot = null; }
}
