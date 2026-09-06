import { describe, expect, it, vi } from 'vitest';
import { installConnectionLifecycle } from './connection-lifecycle.js';

describe('PWA connection lifecycle', () => {
  it('resumes a page restored from the page cache and listens again after every hide', () => {
    const page = new EventTarget();
    const document = Object.assign(new EventTarget(), { hidden: false });
    const callbacks = { suspend: vi.fn(), resume: vi.fn(), connectionChanged: vi.fn() };
    const dispose = installConnectionLifecycle(page, document, callbacks);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      page.dispatchEvent(new Event('pagehide'));
      page.dispatchEvent(new Event('pageshow'));
    }
    expect(callbacks.suspend).toHaveBeenCalledTimes(2);
    expect(callbacks.resume).toHaveBeenCalledTimes(2);
    dispose();
    page.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.resume).toHaveBeenCalledTimes(2);
  });

  it('notifies connectivity changes while hidden without restarting the rendering loop', () => {
    const page = new EventTarget();
    const document = Object.assign(new EventTarget(), { hidden: true });
    const callbacks = { suspend: vi.fn(), resume: vi.fn(), connectionChanged: vi.fn() };
    installConnectionLifecycle(page, document, callbacks);
    document.dispatchEvent(new Event('visibilitychange'));
    page.dispatchEvent(new Event('offline'));
    page.dispatchEvent(new Event('online'));
    page.dispatchEvent(new Event('pageshow'));
    expect(callbacks.suspend).toHaveBeenCalledOnce();
    expect(callbacks.connectionChanged).toHaveBeenCalledTimes(2);
    expect(callbacks.resume).not.toHaveBeenCalled();
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.resume).toHaveBeenCalledOnce();
  });
});
