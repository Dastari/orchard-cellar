/** Structural ownership boundary: no renderer or concrete HUD-cache imports. */
export interface HudDisplayCache {
  readonly bytes: number;
  readonly builds: number;
  readonly reuses: number;
  readonly allocations: number;
  dispose(): void;
}

export interface HudDisplayCacheDiagnostics {
  readonly caches: number;
  readonly bytes: number;
  readonly builds: number;
  readonly reuses: number;
  readonly allocations: number;
}

const displays = new WeakMap<HTMLCanvasElement, Set<WeakRef<HudDisplayCache>>>();

export function registerHudDisplayCache(display: HTMLCanvasElement, cache: HudDisplayCache): void {
  let entries = displays.get(display);
  if (entries === undefined) { entries = new Set(); displays.set(display, entries); }
  let registered = false;
  for (const entry of entries) {
    const value = entry.deref();
    if (value === undefined) entries.delete(entry);
    else if (value === cache) registered = true;
  }
  if (!registered) entries.add(new WeakRef(cache));
}

export function unregisterHudDisplayCache(display: HTMLCanvasElement, cache: HudDisplayCache): void {
  const entries = displays.get(display);
  if (entries === undefined) return;
  for (const entry of entries) {
    const value = entry.deref();
    if (value === undefined || value === cache) entries.delete(entry);
  }
  if (entries.size === 0) displays.delete(display);
}

export function hudDisplayCacheDiagnostics(display: HTMLCanvasElement): HudDisplayCacheDiagnostics {
  const entries = displays.get(display);
  let caches = 0, bytes = 0, builds = 0, reuses = 0, allocations = 0;
  if (entries !== undefined) {
    for (const entry of entries) {
      const cache = entry.deref();
      if (cache === undefined) { entries.delete(entry); continue; }
      caches++; bytes += cache.bytes; builds += cache.builds;
      reuses += cache.reuses; allocations += cache.allocations;
    }
    if (entries.size === 0) displays.delete(display);
  }
  return { caches, bytes, builds, reuses, allocations };
}

/** Detach first: individual cache disposal may unregister itself. Every live
 * cache is attempted even if a different disposable fails. */
export function disposeHudDisplayCaches(display: HTMLCanvasElement): void {
  const entries = displays.get(display);
  if (entries === undefined) return;
  displays.delete(display);
  const errors: unknown[] = [];
  for (const entry of entries) {
    const cache = entry.deref();
    if (cache === undefined) { entries.delete(entry); continue; }
    try { cache.dispose(); } catch (error) { errors.push(error); }
  }
  entries.clear();
  if (errors.length > 0) throw new AggregateError(errors, 'HUD cache disposal failed');
}
