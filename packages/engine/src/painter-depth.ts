import type { WorldDepthItem } from './renderer.js';

export enum WorldItemKind {
  Static, Player, Npc, Merchant, RogueEnemy, Boat, CombatTarget, Hive, Placeable,
}
export interface WorldItemIdentity {
  readonly hash: number;
  readonly debug: string;
  readonly kind: WorldItemKind;
  order: number;
  seen: number;
}
const kinds: Readonly<Record<string, WorldItemKind>> = {
  player: WorldItemKind.Player, npc: WorldItemKind.Npc, merchant: WorldItemKind.Merchant,
  'rogue-enemy': WorldItemKind.RogueEnemy, boat: WorldItemKind.Boat,
  'combat-target': WorldItemKind.CombatTarget, hive: WorldItemKind.Hive, placeable: WorldItemKind.Placeable,
};
/** Hash is identity only. Lexical ranks preserve the previous locale ordering,
 * including when two strings have equal hashes or new identities stream in. */
export class WorldItemIdentities {
  private readonly byName = new Map<string, WorldItemIdentity>();
  private readonly ordered: WorldItemIdentity[] = [];
  private generation = 0;
  private retired = 0;
  private peak = 0;
  constructor(private readonly retainedLimit = 4096) {}
  beginFrame(): void { this.generation++; }
  /** Retire expired projectile/streamed names. Oversized active queues keep their
   * item-owned ranks for this draw but retain no identity cache across frames. */
  finishFrame(): void {
    let write = 0;
    for (const identity of this.ordered) {
      if (identity.seen === this.generation) this.ordered[write++] = identity;
      else { this.byName.delete(identity.debug); this.retired++; }
    }
    this.ordered.length = write;
    if (write > this.retainedLimit) { this.retired += write; this.clear(); }
  }
  get diagnostics() { return { retained: this.byName.size, limit: this.retainedLimit, retired: this.retired, peak: this.peak }; }
  get(name: string): WorldItemIdentity {
    const existing = this.byName.get(name);
    if (existing !== undefined) { existing.seen = this.generation; return existing; }
    let hash = 2166136261;
    for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
    const identity = { hash: hash >>> 0, debug: name,
      kind: kinds[name.slice(0, name.indexOf(':'))] ?? WorldItemKind.Static, order: 0, seen: this.generation };
    let lower = 0, upper = this.ordered.length;
    while (lower < upper) {
      const middle = (lower + upper) >>> 1;
      if (this.ordered[middle]!.debug.localeCompare(name) <= 0) lower = middle + 1;
      else upper = middle;
    }
    this.ordered.splice(lower, 0, identity);
    for (let i = lower; i < this.ordered.length; i++) {
      const previous = this.ordered[i - 1], current = this.ordered[i]!;
      current.order = previous === undefined ? 0 : previous.order + (previous.debug.localeCompare(current.debug) === 0 ? 0 : 1);
    }
    this.byName.set(name, identity);
    this.peak = Math.max(this.peak, this.byName.size);
    return identity;
  }
  clear(): void { this.byName.clear(); this.ordered.length = 0; }
}
export function prepareWorldDepthItem(item: WorldDepthItem, identities: WorldItemIdentities): void {
  const identity = item.sortIdentity ?? identities.get(item.debugTie ?? String(item.tie));
  const phase = item.depthPhase === 'surface' ? 0 : item.depthPhase === 'boundary' ? 1 : 2;
  const depth = item.footY + (item.depthOffset ?? 0);
  // Two packed numeric keys separate plane/underlay and depth-bin/phase.
  // Keep exact fractional depth within a bin: packing must not round actors
  // across a cliff boundary or let phase override a smaller actual foot Y.
  const mutable = item as { kind: WorldItemKind; tie: number; debugTie: string;
    sortIdentity: WorldItemIdentity; sortPlane: number; sortKey: number; sortDepth: number };
  mutable.kind = identity.kind;
  mutable.tie = identity.hash;
  mutable.debugTie = identity.debug;
  mutable.sortIdentity = identity;
  mutable.sortPlane = (item.elevationLayer ?? 0) * 2 + (phase === 0 ? 0 : 1);
  mutable.sortKey = Math.floor(depth * 16) * 4 + phase;
  mutable.sortDepth = depth;
}
type PreparedDepthFields = Pick<WorldDepthItem, 'sortKey' | 'sortPlane' | 'sortDepth' | 'sortIdentity'>;
export function comparePreparedWorldDepthItems(left: PreparedDepthFields, right: PreparedDepthFields): number {
  const a = left.sortKey!, b = right.sortKey!;
  return left.sortPlane! - right.sortPlane! || Math.floor(a / 4) - Math.floor(b / 4)
    || left.sortDepth! - right.sortDepth! || (a & 3) - (b & 3)
    || left.sortIdentity!.order - right.sortIdentity!.order;
}
