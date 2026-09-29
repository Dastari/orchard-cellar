import { atlasPackIdForAsset, loadGeneratedAsset, onAtlasPacksLoaded, type AtlasFrame, type LoadedAsset } from '@orchard/ui';

/**
 * Static world S6: art loaded by need. With atlas pack delivery, the game downloads only the packs
 * it uses, so the art factory no longer loads every sprite at startup. A lazy field reads as a
 * transparent stand-in (`LOADING_ART`) until its sprite has loaded, then as the sprite itself.
 *
 * A lazy asset loads when first read (a draw), or as soon as the chunk runtime has prefetched its
 * pack (`onAtlasPacksLoaded`), so world art is normally ready before its chunk is on screen.
 * The stand-in answers every animation, variant and state with one empty frame, so no draw can
 * fail on it: it draws nothing. Nothing caches it by identity for long either, since readers
 * see a different object once the sprite arrives.
 */

const EMPTY_FRAME: AtlasFrame = Object.freeze({ x: 0, y: 0, width: 1, height: 1, durationTicks: 1 });
const EMPTY_FRAMES: readonly AtlasFrame[] = Object.freeze([EMPTY_FRAME]);

function anyKey<T>(value: T): Readonly<Record<string, T>> {
  return new Proxy(Object.freeze({}) as Record<string, T>, {
    get: (_target, key) => (typeof key === 'string' ? value : undefined),
    has: (_target, key) => typeof key === 'string',
  });
}

function emptyImage(): CanvasImageSource {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1);
  return { width: 1, height: 1 } as unknown as CanvasImageSource;
}

let loadingArt: LoadedAsset | undefined;
/** The transparent stand-in a lazy asset reads as until its sprite has loaded. */
export function loadingArtAsset(): LoadedAsset {
  loadingArt ??= Object.freeze({
    assetId: -1,
    name: 'loading',
    image: emptyImage(),
    anchor: Object.freeze([0, 0]) as readonly [number, number],
    collision: Object.freeze([]),
    tags: Object.freeze(['loading']),
    placement: Object.freeze({ layer: 'object', footprint: Object.freeze([1, 1]) as readonly [number, number], blocksMovement: false, builderAvailable: false }),
    atlasRevision: -1,
    metadata: Object.freeze({
      image: '',
      animations: anyKey(EMPTY_FRAMES),
      animationMeta: anyKey(Object.freeze({ fps: 1, loop: true })),
      variants: anyKey(EMPTY_FRAMES),
      variantMeta: anyKey(Object.freeze({})),
      states: anyKey(EMPTY_FRAME),
    }),
  }) as LoadedAsset;
  return loadingArt;
}

/** Whether an asset is the loading stand-in (nothing to draw, measure or hit-test yet). */
export function isLoadingArt(asset: LoadedAsset | undefined): boolean {
  return asset !== undefined && asset === loadingArt;
}

type Loader = (name: string, season: string) => Promise<LoadedAsset>;
let loader: Loader = (name, season) => loadGeneratedAsset(name, season);
/** Tests only: replace the asset loader. */
export function setLazyArtLoaderForTests(next: Loader | null): void {
  loader = next ?? ((name, season) => loadGeneratedAsset(name, season));
}

/** One lazily loaded sprite (shared by every field naming it: see `artSlot`). */
export class ArtSlot {
  #value: LoadedAsset | undefined;
  #pending: Promise<LoadedAsset> | undefined;
  constructor(readonly name: string, readonly season = 'summer') { register(this); }
  /** The sprite, or the stand-in while it loads (reading starts the load). */
  get value(): LoadedAsset {
    if (this.#value !== undefined) return this.#value;
    void this.load().catch(() => undefined);
    standInReads += 1;
    return loadingArtAsset();
  }
  get ready(): boolean { return this.#value !== undefined; }
  load(): Promise<LoadedAsset> {
    if (this.#value !== undefined) return Promise.resolve(this.#value);
    this.#pending ??= loader(this.name, this.season).then((asset) => {
      this.#value = asset;
      readyGeneration += 1;
      pendingSlots.delete(this);
      for (const listener of readyListeners) listener(this);
      return asset;
    }, (error: unknown) => {
      // loadGeneratedAsset already falls back to the placeholder sprite; this is a network or
      // decode failure of that too. Stay the stand-in, and let a later read retry.
      this.#pending = undefined;
      throw error;
    });
    return this.#pending;
  }
}

const slotsByKey = new Map<string, ArtSlot>();
/** The shared slot of an asset and season, so aliases load and hold one sprite. */
export function artSlot(name: string, season = 'summer'): ArtSlot {
  const key = `${season}:${name}`;
  let slot = slotsByKey.get(key);
  if (slot === undefined) { slot = new ArtSlot(name, season); slotsByKey.set(key, slot); }
  return slot;
}
const pendingSlots = new Set<ArtSlot>();
let standInReads = 0;
let readyGeneration = 0;
/** How many times a lazy field has read as the stand-in. A renderer that bakes art (the ground
 * cache) compares it around a bake: if it moved, the bake is provisional. */
export function lazyArtStandInReads(): number { return standInReads; }
/** Bumped whenever a lazy asset finishes loading: provisional bakes are then redone. */
export function lazyArtReadyGeneration(): number { return readyGeneration; }
const readyListeners = new Set<(slot: ArtSlot) => void>();
let packListenerInstalled = false;

function register(slot: ArtSlot): void {
  pendingSlots.add(slot);
  if (!packListenerInstalled) {
    packListenerInstalled = true;
    onAtlasPacksLoaded(warmPacks);
  }
}

/** Starts loading every lazy asset of these packs (their pages are already downloaded). */
export function warmPacks(packIds: readonly string[]): void {
  const packs = new Set(packIds);
  for (const slot of pendingSlots) {
    const pack = atlasPackIdForAsset(slot.name);
    if (pack !== undefined && packs.has(pack)) void slot.load().catch(() => undefined);
  }
}

/** Called whenever a lazy asset finishes loading (renderers invalidate cached frames). */
export function onLazyArtReady(listener: (slot: ArtSlot) => void): () => void {
  readyListeners.add(listener);
  return () => { readyListeners.delete(listener); };
}

/** Loads every lazy asset defined so far (review tools that draw at once, never the game). */
export async function loadAllLazyArt(): Promise<void> {
  await Promise.all([...pendingSlots].map(slot => slot.load()));
}

/** Diagnostics: lazy assets not loaded yet. */
export function pendingLazyArtCount(): number { return pendingSlots.size; }

/** Defines `key` on `target` as a lazy asset (an enumerable getter). */
export function defineLazyAsset<T extends object>(target: T, key: string, name: string, season = 'summer'): void {
  const slot = artSlot(name, season);
  Object.defineProperty(target, key, { get: () => slot.value, enumerable: true, configurable: false });
}

/** A record whose members are lazy assets. */
export function lazyAssetRecord(names: Readonly<Record<string, string>>, season = 'summer'): Readonly<Record<string, LoadedAsset>> {
  const record: Record<string, LoadedAsset> = {};
  for (const [key, name] of Object.entries(names)) defineLazyAsset(record, key, name, season);
  return Object.freeze(record);
}

/** A fixed-length list whose members are lazy assets. */
export function lazyAssetList(names: readonly string[], season = 'summer'): readonly LoadedAsset[] {
  const list: LoadedAsset[] = new Array<LoadedAsset>(names.length);
  names.forEach((name, index) => defineLazyAsset(list, String(index), name, season));
  return Object.freeze(list);
}
