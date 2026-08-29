import { describe, expect, it, vi } from 'vitest';
import { LifecycleRegistry } from './lifecycle-registry.js';

describe('lifecycle registry', () => {
  it('disposes children first and local resources in reverse registration order', () => {
    const order: string[] = [];
    const app = new LifecycleRegistry('app');
    app.add('app-first', () => order.push('app-first'));
    app.add('app-second', () => order.push('app-second'));
    const world = app.child('world');
    world.add('world', () => order.push('world'));
    app.dispose();
    expect(order).toEqual(['world', 'app-second', 'app-first']);
    expect(app.disposed).toBe(true);
    expect(world.disposed).toBe(true);
  });

  it('lets a world session dispose without tearing down its app parent', () => {
    const appCleanup = vi.fn();
    const app = new LifecycleRegistry('app');
    app.add('app', appCleanup);
    const world = app.child('world');
    const worldCleanup = vi.fn();
    world.add('world', worldCleanup);
    world.dispose();
    expect(worldCleanup).toHaveBeenCalledOnce();
    expect(appCleanup).not.toHaveBeenCalled();
    expect(app.disposed).toBe(false);
    expect(app.activeChildCount).toBe(0);
  });

  it('is idempotent, aborts owned work, and rejects late registration', () => {
    const lifetime = new LifecycleRegistry('world');
    const controller = lifetime.ownAbortController('loader');
    lifetime.dispose();
    lifetime.dispose();
    expect(controller.signal.aborted).toBe(true);
    expect(() => lifetime.add('late', () => undefined)).toThrow('already disposed');
  });

  it('continues cleanup after a disposer fails', () => {
    const cleanup = vi.fn();
    const lifetime = new LifecycleRegistry('world');
    lifetime.add('survivor', cleanup);
    lifetime.add('failure', () => { throw new Error('broken'); });
    expect(() => lifetime.dispose()).toThrow(AggregateError);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
