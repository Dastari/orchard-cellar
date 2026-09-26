import type { ContentRegistry, ItemPolicyResolver, ItemStack } from '@orchard/sim';
import { BOOTSTRAP_ITEM_CONTAINER_CONTENT, itemDefinition, itemPolicyResolver } from '@orchard/sim/item-containers';
import type { LoadedAsset } from '../../assets.js';
import { selectAtlasFrame, type AtlasFrame } from '../../sprite.js';

/** Item art as surfaces hand it to a slot. Surfaces pass item art and item ids to `uiSlot` and never draw it:
 * the artwork map lives in a module-private table, so a `UiSlotArt` can be passed on but not painted.
 * Only the slot module (`inventory.ts`) resolves it to pixels, through `resolveUiSlotIcon`. */
export interface UiSlotArt { readonly kind: 'ui-slot-art' }

export type UiSlotArtwork = Readonly<Record<string, LoadedAsset>>;

export interface UiSlotArtOptions {
  /** Item art keyed by item kind, or a getter for art that loads or changes at runtime. */
  readonly artwork?: UiSlotArtwork | (() => UiSlotArtwork | undefined);
  /** Overrides the item definition's icon animation (for example Studio or live content icons). */
  readonly iconAnimation?: (item: ItemStack) => string;
  /** The live content registry: wear bars and slot rules then follow published or Studio content.
   * Omitted, slots fall back to the bootstrap registry, as they do today. */
  readonly contentRegistry?: () => ContentRegistry | undefined;
}

interface UiSlotArtSource {
  readonly artwork: () => UiSlotArtwork | undefined;
  readonly iconAnimation?: (item: ItemStack) => string;
  readonly contentRegistry?: () => ContentRegistry | undefined;
}

const sources = new WeakMap<UiSlotArt, UiSlotArtSource>();

/** Wraps item art for slots. See `UiSlotArt`. */
export function uiSlotArt(options: UiSlotArtOptions = {}): UiSlotArt {
  const art: UiSlotArt = Object.freeze({ kind: 'ui-slot-art' });
  const artwork = options.artwork;
  sources.set(art, {
    artwork: typeof artwork === 'function' ? artwork : () => artwork,
    ...(options.iconAnimation ? { iconAnimation: options.iconAnimation } : {}),
    ...(options.contentRegistry ? { contentRegistry: options.contentRegistry } : {}),
  });
  return art;
}

/** Icon frame for an item asset: its declared animation, then the idle or closed pose. */
export function uiItemFrame(asset: LoadedAsset, animation?: string): AtlasFrame | null {
  return selectAtlasFrame(asset.metadata, animation ?? 'base', 0) ?? selectAtlasFrame(asset.metadata, 'base', 0)
    ?? selectAtlasFrame(asset.metadata, 'idle', 0) ?? selectAtlasFrame(asset.metadata, 'closed', 0);
}

/** Slot module only (the boundary test forbids it elsewhere): the image and frame to paint for a stack. */
export function resolveUiSlotIcon(art: UiSlotArt, item: Pick<ItemStack, 'itemKind'> & Partial<ItemStack>):
  { readonly image: CanvasImageSource; readonly source: AtlasFrame } | null {
  const entry = sources.get(art), asset = entry?.artwork()?.[item.itemKind];
  if (!entry || !asset) return null;
  const source = uiItemFrame(asset, entry.iconAnimation?.(item as ItemStack) ?? itemDefinition(item.itemKind)?.iconAnimation);
  return source ? { image: asset.image, source } : null;
}

/** The content registry the art was bound to, for wear bars. */
export function uiSlotArtRegistry(art: UiSlotArt | undefined): ContentRegistry | undefined {
  return art === undefined ? undefined : sources.get(art)?.contentRegistry?.();
}

/** The item policy slot rules are checked with: the live registry's when the art has one, else bootstrap,
 * matching the legacy `ItemSlot` mirror's default. */
export function uiSlotArtPolicy(art: UiSlotArt | undefined): ItemPolicyResolver {
  const registry = uiSlotArtRegistry(art);
  return registry ? itemPolicyResolver(registry) : BOOTSTRAP_ITEM_CONTAINER_CONTENT;
}
