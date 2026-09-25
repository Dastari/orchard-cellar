import { describe, expect, it } from 'vitest';
import {
  GATEWAY_HANDOFF_KEY, GATEWAY_HANDOFF_MAX_AGE_MS, gatewayHandoffCover, gatewayHandoffSize, saveGatewayHandoff, takeGatewayHandoff,
} from './gateway-handoff.js';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[GATEWAY_HANDOFF_KEY, initial]]);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const stored = (savedAt: number, data = 'data:image/webp;base64,AAAA') => JSON.stringify({ data, width: 1280, height: 720, savedAt });

describe('gateway handoff (owner UI item 5)', () => {
  it('downscales the snapshot so its long edge is at most 1280', () => {
    expect(gatewayHandoffSize(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(gatewayHandoffSize(1170, 2532)).toEqual({ width: 591, height: 1280 });
    expect(gatewayHandoffSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('cover-fits into the same orientation and refuses portrait onto landscape', () => {
    expect(gatewayHandoffCover({ width: 1280, height: 720 }, { width: 1920, height: 1080 })).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    const wider = gatewayHandoffCover({ width: 1280, height: 720 }, { width: 1000, height: 800 })!;
    expect(wider.height).toBe(800); expect(wider.width).toBeGreaterThan(1000); expect(wider.x).toBeLessThan(0);
    expect(gatewayHandoffCover({ width: 591, height: 1280 }, { width: 1920, height: 1080 })).toBeNull();
    expect(gatewayHandoffCover({ width: 1280, height: 720 }, { width: 390, height: 844 })).toBeNull();
  });

  it('consumes a fresh snapshot exactly once', () => {
    const storage = memoryStorage(stored(10_000));
    expect(takeGatewayHandoff(storage, 12_000)?.width).toBe(1280);
    expect(storage.values.has(GATEWAY_HANDOFF_KEY)).toBe(false);
    expect(takeGatewayHandoff(storage, 12_000)).toBeNull();
  });

  it('drops stale, future-dated and malformed snapshots (and still removes them)', () => {
    for (const [value, now] of [[stored(0), GATEWAY_HANDOFF_MAX_AGE_MS + 1], [stored(5_000), 4_000], ['{not json', 0], [stored(0, 'javascript:alert(1)'), 0]] as const) {
      const storage = memoryStorage(value);
      expect(takeGatewayHandoff(storage, now)).toBeNull();
      expect(storage.values.has(GATEWAY_HANDOFF_KEY)).toBe(false);
    }
  });

  it('fails silently when storage is unavailable or full', () => {
    expect(takeGatewayHandoff(undefined)).toBeNull();
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(takeGatewayHandoff(throwing)).toBeNull();
    const canvas = { width: 1920, height: 1080 } as HTMLCanvasElement;
    expect(() => saveGatewayHandoff(canvas, throwing)).not.toThrow();
  });
});
