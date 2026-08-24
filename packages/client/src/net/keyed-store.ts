export interface ReadonlyKeyedStore<K, V> extends Iterable<V> {
  readonly size: number;
  readonly length: number;
  get(key: K): V | undefined;
  find(predicate: (value: V) => boolean): V | undefined;
}

export class KeyedStore<K, V> implements ReadonlyKeyedStore<K, V> {
  private readonly rows = new Map<K, V>();
  get size(): number { return this.rows.size; }
  get length(): number { return this.rows.size; }
  get(key: K): V | undefined { return this.rows.get(key); }
  set(key: K, value: V): void { this.rows.set(key, value); }
  delete(key: K): boolean { return this.rows.delete(key); }
  clear(): void { this.rows.clear(); }
  find(predicate: (value: V) => boolean): V | undefined {
    for (const value of this.rows.values()) if (predicate(value)) return value;
    return undefined;
  }
  [Symbol.iterator](): MapIterator<V> { return this.rows.values(); }
  toArray(): V[] { return [...this.rows.values()]; }
}
