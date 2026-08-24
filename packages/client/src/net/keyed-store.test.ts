import { describe, expect, it } from 'vitest';
import { BoundedKeyedQueue, KeyedStore } from './keyed-store.js';

describe('persistent keyed store', () => {
  it('updates in place and iterates values without rebuilding arrays', () => {
    const store = new KeyedStore<number, { id: number; name: string }>();
    store.set(1, { id: 1, name: 'apple' });
    store.set(1, { id: 1, name: 'pear' });
    store.set(2, { id: 2, name: 'plum' });
    expect([...store].map((row) => row.name)).toEqual(['pear', 'plum']);
    expect(store.find((row) => row.id === 2)?.name).toBe('plum');
    expect(store.length).toBe(2);
    store.delete(1);
    expect(store.get(1)).toBeUndefined();
  });
});

describe('bounded keyed queue', () => {
  it('caps background commits per identity and drains retained order', () => {
    const queue = new BoundedKeyedQueue<string, number>(3);
    for (let value = 0; value < 10; value += 1) queue.push('alice', value);
    queue.push('bob', 20);
    expect(queue.size).toBe(4);
    const drained: number[] = [];
    queue.drain((value) => drained.push(value));
    expect(drained).toEqual([7, 8, 9, 20]);
    expect(queue.size).toBe(0);
  });
});
