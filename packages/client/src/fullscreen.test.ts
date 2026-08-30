import { describe, expect, it, vi } from 'vitest';
import {
  fullscreenControlAvailable,
  toggleFullscreenWithEscapeLock,
  type FullscreenControl,
} from './fullscreen.js';

describe('browser fullscreen control', () => {
  it('requires a non-standalone surface, native fullscreen, and Escape lock', () => {
    const complete = {
      active: false,
      standalone: false,
      request: vi.fn(),
      exit: vi.fn(),
      lockEscape: vi.fn(async () => undefined),
    } satisfies FullscreenControl;
    expect(fullscreenControlAvailable(complete)).toBe(true);
    expect(fullscreenControlAvailable({ ...complete, standalone: true })).toBe(false);
    expect(fullscreenControlAvailable({ ...complete, request: undefined })).toBe(false);
    expect(fullscreenControlAvailable({ ...complete, lockEscape: undefined })).toBe(false);
  });

  it('starts Escape lock before entering fullscreen from the same activation', async () => {
    const order: string[] = [];
    const result = await toggleFullscreenWithEscapeLock({
      active: false,
      standalone: false,
      lockEscape: async () => { order.push('lock'); },
      request: async () => { order.push('request'); },
      exit: vi.fn(),
    });
    expect(result).toBe('entered');
    expect(order).toEqual(['lock', 'request']);
  });

  it('exits and releases keyboard ownership when already fullscreen', async () => {
    const order: string[] = [];
    const result = await toggleFullscreenWithEscapeLock({
      active: true,
      standalone: false,
      lockEscape: async () => undefined,
      request: vi.fn(),
      exit: async () => { order.push('exit'); },
      unlock: () => { order.push('unlock'); },
    });
    expect(result).toBe('exited');
    expect(order).toEqual(['exit', 'unlock']);
  });

  it('unwinds fullscreen if Escape lock cannot be established', async () => {
    const exit = vi.fn(async () => undefined);
    const unlock = vi.fn();
    await expect(toggleFullscreenWithEscapeLock({
      active: false,
      standalone: false,
      lockEscape: async () => { throw new Error('lock denied'); },
      request: async () => undefined,
      exit,
      unlock,
    })).rejects.toThrow('lock denied');
    expect(exit).toHaveBeenCalledOnce();
    expect(unlock).toHaveBeenCalledOnce();
  });

  it('releases a pending keyboard lock after a synchronous fullscreen failure', async () => {
    const order: string[] = [];
    await expect(toggleFullscreenWithEscapeLock({
      active: false,
      standalone: false,
      lockEscape: async () => { order.push('lock settled'); },
      request: () => { throw new Error('request failed'); },
      exit: async () => { order.push('exit'); },
      unlock: () => { order.push('unlock'); },
    })).rejects.toThrow('request failed');
    expect(order).toEqual(['lock settled', 'exit', 'unlock']);
  });
});
