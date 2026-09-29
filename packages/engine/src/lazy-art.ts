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

/** A failed load is retried by a later read only after this long (never every frame). */
const RETRY_AFTER_MS = 5_000;
const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

/** One lazily loaded sprite (shared by every field naming it: see `artSlot`). */
export class ArtSlot {
  #value: LoadedAsset | undefined;
  #pending: Promise<LoadedAsset> | undefined;
  #failedAt = -Infinity;
  constructor(readonly name: string, readonly season = 'summer',
    readonly transform?: (asset: LoadedAsset) => LoadedAsset) { register(this); }
  /** The sprite, or the stand-in while it loads (reading starts the load). */
  get value(): LoadedAsset {
    if (this.#value !== undefined) return this.#value;
    if (now() - this.#failedAt >= RETRY_AFTER_MS) void this.load().catch(() => undefined);
    standInReads += 1;
    return loadingArtAsset();
  }
  /** The sprite if it has loaded, else `undefined` (reading starts the load). */
  get loaded(): LoadedAsset | undefined {
    const value = this.value;
    return value === loadingArt ? undefined : value;
  }
  get ready(): boolean { return this.#value !== undefined; }
  load(): Promise<LoadedAsset> {
    if (this.#value !== undefined) return Promise.resolve(this.#value);
    this.#pending ??= loader(this.name, this.season).then((loaded) => {
      const asset = this.transform === undefined ? loaded : this.transform(loaded);
      this.#value = asset;
      readyGeneration += 1;
      pendingSlots.delete(this);
      for (const listener of readyListeners) listener(this);
      return asset;
    }, (error: unknown) => {
      // loadGeneratedAsset already falls back to the placeholder sprite; this is a network or
      // decode failure of that too. Stay the stand-in, and let a later read retry.
      this.#pending = undefined;
      this.#failedAt = now();
      throw error;
    });
    return this.#pending;
  }
}

const slotsByKey = new Map<string, ArtSlot>();
/** The shared slot of an asset and season, so aliases load and hold one sprite. */
export function artSlot(name: string, season = 'summer',
  variant?: { readonly key: string; readonly transform: (asset: LoadedAsset) => LoadedAsset }): ArtSlot {
  const key = `${season}:${name}${variant === undefined ? '' : `#${variant.key}`}`;
  let slot = slotsByKey.get(key);
  if (slot === undefined) { slot = new ArtSlot(name, season, variant?.transform); slotsByKey.set(key, slot); }
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

const definedSlots = new WeakMap<object, Map<string, ArtSlot>>();
/** Defines `key` on `target` as a lazy asset (an enumerable getter). */
export function defineLazyAsset<T extends object>(target: T, key: string, name: string, season = 'summer'): void {
  defineLazySlot(target, key, artSlot(name, season));
}
/** Defines `key` on `target` as the given slot's asset (an enumerable getter). */
export function defineLazySlot<T extends object>(target: T, key: string, slot: ArtSlot): void {
  let slots = definedSlots.get(target);
  if (slots === undefined) { slots = new Map(); definedSlots.set(target, slots); }
  slots.set(key, slot);
  Object.defineProperty(target, key, { get: () => slot.value, enumerable: true, configurable: false });
}

/** The slot behind a lazy member (a defined field, or a content record's kind), so a caller can
 * await it: the loading screen's own art, for one. */
export function lazyArtSlot(record: object, key: string, season = 'summer'): ArtSlot | undefined {
  const defined = definedSlots.get(record)?.get(key);
  if (defined !== undefined) return defined;
  const name = lazyContentArtName(record, key);
  return name === undefined ? undefined : artSlot(name, season);
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

/** Reads every lazy member of a value (a field, record, list or nested record), so its loads
 * start before anything draws it: a player's outfit on the loading screen, a creature whose
 * row has arrived, tools the player may swing next. */
export function warmLazyArt(value: unknown, depth = 3): void {
  if (depth < 0 || value === null || typeof value !== 'object') return;
  if (isLoadingArt(value as LoadedAsset) || 'image' in (value as object)) return;
  for (const key of Object.keys(value)) warmLazyArt((value as Record<string, unknown>)[key], depth - 1);
}

const CONTENT_ART = Symbol('lazy content art');
interface ContentArtNames {
  readonly names: Map<string, string>;
  readonly overrides: Map<string, LoadedAsset>;
}

/**
 * A record of content art by runtime kind (item icons, crop sprites) whose asset names follow
 * the live content registry. Reading a kind loads only that sprite; `renameLazyContentArt` points
 * kinds at new assets when content changes (nothing loads until drawn). A written sprite (tests,
 * an explicit override) wins over the name.
 */
export function lazyContentArt(names: Readonly<Record<string, string>>, season = 'summer'): Record<string, LoadedAsset> {
  const state: ContentArtNames = { names: new Map(Object.entries(names)), overrides: new Map() };
  return new Proxy({} as Record<string, LoadedAsset>, {
    get: (_target, key) => {
      if (key === CONTENT_ART) return state;
      if (typeof key !== 'string') return undefined;
      const override = state.overrides.get(key);
      if (override !== undefined) return override;
      const name = state.names.get(key);
      return name === undefined ? undefined : artSlot(name, season).value;
    },
    set: (_target, key, value: LoadedAsset) => {
      if (typeof key !== 'string') return false;
      state.overrides.set(key, value);
      return true;
    },
    has: (_target, key) => typeof key === 'string' && (state.names.has(key) || state.overrides.has(key)),
    ownKeys: () => [...new Set([...state.names.keys(), ...state.overrides.keys()])],
    getOwnPropertyDescriptor: (_target, key) => typeof key === 'string' && (state.names.has(key) || state.overrides.has(key))
      ? { enumerable: true, configurable: true, writable: true } : undefined,
  });
}

/** Whether a record is lazy content art (see `lazyContentArt`). */
export function isLazyContentArt(record: object): boolean {
  return (record as Record<symbol, unknown>)[CONTENT_ART] !== undefined;
}

/** The asset a lazy content record names for a kind (undefined when it names none). */
export function lazyContentArtName(record: object, kind: string): string | undefined {
  return ((record as Record<symbol, unknown>)[CONTENT_ART] as ContentArtNames | undefined)?.names.get(kind);
}

/** Points a lazy content record's kinds at new assets (live content changed). Kinds not listed
 * keep their asset: content art never disappears mid-session. */
export function renameLazyContentArt(record: object, names: Readonly<Record<string, string>>): number {
  const state = (record as Record<symbol, unknown>)[CONTENT_ART] as ContentArtNames | undefined;
  if (state === undefined) return 0;
  let changed = 0;
  for (const [kind, name] of Object.entries(names)) {
    if (state.names.get(kind) === name && !state.overrides.has(kind)) continue;
    state.names.set(kind, name);
    state.overrides.delete(kind);
    changed += 1;
  }
  return changed;
}
