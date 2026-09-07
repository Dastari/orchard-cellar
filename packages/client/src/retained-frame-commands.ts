import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { TerrainArray } from '@orchard/engine/terrain';

type Slot = number | string;
type Key = string | number | bigint | object;
type MutableItem = { -readonly [Field in keyof WorldDepthItem]: WorldDepthItem[Field] };
export interface FrameCommand<State extends object> {
  readonly state: State;
  readonly item: MutableItem;
  seen: number;
}
/** Each slot belongs to one typed producer call site. State stays
 * opaque here; callers use the same local capture type for find and insert.
 * Queued items remain valid after retirement; no surface is owned by this pool. */
export class RetainedFrameCommands {
  private readonly slots = new Map<Slot, Map<Key, FrameCommand<object>>>();
  private generation = 0;
  private terrain: TerrainArray | null = null;
  private version = -1;
  private size = 0;
  readonly diagnostics = { builds: 0, reuses: 0, retired: 0 };
  constructor(readonly limit = 4096) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Invalid retained command budget');
  }
  begin(terrain: TerrainArray): void {
    if (terrain !== this.terrain || terrain.version !== this.version) {
      this.clear(); this.terrain = terrain; this.version = terrain.version;
    }
    this.generation++;
  }
  find<State extends object>(slot: Slot, key: Key): FrameCommand<State> | undefined {
    const entry = this.slots.get(slot)?.get(key);
    if (entry?.seen === this.generation) return undefined;
    if (entry !== undefined) { entry.seen = this.generation; this.diagnostics.reuses++; }
    // Each pool belongs to one producer; its slot numbers have one capture schema.
    return entry as FrameCommand<State> | undefined;
  }
  insert<State extends object>(slot: Slot, key: Key, state: State, item: MutableItem): FrameCommand<State> {
    let entries = this.slots.get(slot);
    if (entries === undefined) { entries = new Map(); this.slots.set(slot, entries); }
    const duplicate = entries.has(key);
    const entry = { state, item, seen: this.generation };
    this.diagnostics.builds++;
    if (!duplicate) { entries.set(key, entry); this.size++; }
    return entry;
  }
  finish(): void {
    for (const entries of this.slots.values()) for (const [key, entry] of entries) {
      if (this.generation - entry.seen > 2 || this.size > this.limit) {
        entries.delete(key); this.size--; this.diagnostics.retired++;
      }
    }
  }
  clear(): void { this.diagnostics.retired += this.size; this.slots.clear(); this.size = 0; }
}
