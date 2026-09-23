export interface ReadonlyKeyedStore<K, V> extends Iterable<V> {
  readonly revision?: number;
  readonly size: number;
  readonly length: number;
  get(key: K): V | undefined;
  find(predicate: (value: V) => boolean): V | undefined;
}

export class KeyedStore<K, V> implements ReadonlyKeyedStore<K, V> {
  private readonly rows = new Map<K, V>();
  private mutationRevision = 0;
  get revision(): number { return this.mutationRevision; }
  get size(): number { return this.rows.size; }
  get length(): number { return this.rows.size; }
  get(key: K): V | undefined { return this.rows.get(key); }
  set(key: K, value: V): void { if (this.rows.get(key) !== value || !this.rows.has(key)) { this.rows.set(key, value); this.mutationRevision++; } }
  delete(key: K): boolean { const deleted = this.rows.delete(key); if (deleted) this.mutationRevision++; return deleted; }
  clear(): void { if (this.rows.size > 0) { this.rows.clear(); this.mutationRevision++; } }
  find(predicate: (value: V) => boolean): V | undefined {
    for (const value of this.rows.values()) if (predicate(value)) return value;
    return undefined;
  }
  [Symbol.iterator](): MapIterator<V> { return this.rows.values(); }
  toArray(): V[] { return [...this.rows.values()]; }
}

/** Keeps only the latest bounded history per key while the render loop is paused. */
export class BoundedKeyedQueue<K, V> {
  private readonly rows = new Map<K, V[]>();

  constructor(private readonly capacityPerKey: number) {}

  get size(): number {
    let size = 0;
    for (const values of this.rows.values()) size += values.length;
    return size;
  }

  push(key: K, value: V): void {
    const values = this.rows.get(key) ?? [];
    values.push(value);
    const overflow = values.length - Math.max(1, this.capacityPerKey);
    if (overflow > 0) values.splice(0, overflow);
    this.rows.set(key, values);
  }

  drain(visit: (value: V) => void): void {
    for (const values of this.rows.values()) for (const value of values) visit(value);
    this.rows.clear();
  }
}
