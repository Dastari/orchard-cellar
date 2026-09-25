import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  GATEWAY_FRAME_STARTED_ATTRIBUTE, GATEWAY_HANDOFF_DATA_PATTERN, GATEWAY_HANDOFF_KEY, GATEWAY_HANDOFF_MAX_AGE_MS,
  GATEWAY_HANDOFF_PAINTED, GATEWAY_HANDOFF_PAINTED_ATTRIBUTE,
} from '@orchard/engine/gateway-handoff';

// Owner UI fix item 5: the classic boot script in public/ runs the real file here.
const script = readFileSync(new URL('../public/gateway-handoff-boot.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const WEBP = 'data:image/webp;base64,UklGRg==';

function run(options: { stored?: string | null; frameStarted?: boolean; image?: { width: number; height: number }; viewport?: { width: number; height: number }; now?: number } = {}) {
  const values = new Map<string, string>();
  if (options.stored !== null) values.set(GATEWAY_HANDOFF_KEY, options.stored ?? JSON.stringify({ data: WEBP, savedAt: 1_000 }));
  const drawImage = vi.fn(), canvasAttributes = new Map<string, string>();
  const viewport = options.viewport ?? { width: 1280, height: 720 };
  const canvas = { width: 480, height: 270, style: {} as Record<string, string>, parentElement: { clientWidth: viewport.width, clientHeight: viewport.height },
    getContext: () => ({ setTransform: vi.fn(), drawImage, imageSmoothingEnabled: false }), setAttribute: (k: string, v: string) => canvasAttributes.set(k, v) };
  const images: { onload?: () => void; src?: string; naturalWidth: number; naturalHeight: number }[] = [];
  class FakeImage { onload?: () => void; src?: string; naturalWidth = options.image?.width ?? 1280; naturalHeight = options.image?.height ?? 720; constructor() { images.push(this); } }
  const window = { sessionStorage: { getItem: (k: string) => values.get(k) ?? null, removeItem: (k: string) => values.delete(k) }, innerWidth: 1, innerHeight: 1, devicePixelRatio: 1.5 };
  const document = { getElementById: (id: string) => id === 'game' ? canvas : null, documentElement: { hasAttribute: (name: string) => name === GATEWAY_FRAME_STARTED_ATTRIBUTE && options.frameStarted === true } };
  const DateStub = { now: () => options.now ?? 2_000 };
  new Function('window', 'document', 'Image', 'Date', script)(window, document, FakeImage, DateStub);
  images[0]?.onload?.();
  return { values, drawImage, canvas, images, painted: canvasAttributes.get(GATEWAY_HANDOFF_PAINTED_ATTRIBUTE) === GATEWAY_HANDOFF_PAINTED };
}

describe('gateway handoff boot script', () => {
  it('paints a fresh snapshot cover-fitted at the display size and consumes it', () => {
    const result = run({ viewport: { width: 1000, height: 800 } });
    expect(result.values.has(GATEWAY_HANDOFF_KEY)).toBe(false);
    expect(result.images[0]!.src).toBe(WEBP);
    expect([result.canvas.width, result.canvas.height]).toEqual([1500, 1200]);
    expect(result.canvas.style).toMatchObject({ width: '1000px', height: '800px' });
    const [, x, y, width, height] = result.drawImage.mock.calls[0]! as number[];
    expect(height).toBe(1200); expect(width).toBeCloseTo(2133.33, 1); expect(x).toBeLessThan(0); expect(y).toBe(0);
    expect(result.painted).toBe(true);
  });

  it('never paints once the loading screen has started, or across orientations', () => {
    expect(run({ frameStarted: true }).drawImage).not.toHaveBeenCalled();
    expect(run({ image: { width: 591, height: 1280 } }).drawImage).not.toHaveBeenCalled();
    expect(run({ viewport: { width: 390, height: 844 } }).drawImage).not.toHaveBeenCalled();
  });

  it('drops stale, future-dated, malformed and non-WebP/JPEG snapshots, still consuming them', () => {
    for (const [stored, now] of [
      [JSON.stringify({ data: WEBP, savedAt: 0 }), GATEWAY_HANDOFF_MAX_AGE_MS + 1],
      [JSON.stringify({ data: WEBP, savedAt: 5_000 }), 4_000],
      ['{not json', 2_000],
      [JSON.stringify({ data: 'data:image/svg+xml;base64,PHN2Zz4=', savedAt: 1_000 }), 2_000],
    ] as const) {
      const result = run({ stored, now });
      expect(result.images).toHaveLength(0);
      expect(result.values.has(GATEWAY_HANDOFF_KEY)).toBe(false);
    }
    expect(run({ stored: null }).images).toHaveLength(0);
  });

  it('keeps its constants in step with the engine module that saves the snapshot', () => {
    expect(script).toContain(`'${GATEWAY_HANDOFF_KEY}'`);
    expect(script).toContain(`MAX_AGE_MS = ${GATEWAY_HANDOFF_MAX_AGE_MS}`);
    expect(script).toContain(GATEWAY_HANDOFF_DATA_PATTERN.source);
    expect(script).toContain(`'${GATEWAY_FRAME_STARTED_ATTRIBUTE}'`);
    expect(script).toContain(`'${GATEWAY_HANDOFF_PAINTED_ATTRIBUTE}'`);
    expect(script).toContain(`'${GATEWAY_HANDOFF_PAINTED}'`);
  });

  it('loads as a classic script right after the canvas, before the game bundle', () => {
    const boot = html.indexOf('<script src="/gateway-handoff-boot.js"></script>');
    expect(boot).toBeGreaterThan(html.indexOf('<canvas id="game"'));
    expect(boot).toBeLessThan(html.indexOf('<script type="module" src="/src/main.ts">'));
  });
});
