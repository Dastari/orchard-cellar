import type { AtlasFrame, AtlasMetadata } from './sprite.js';

export interface BuiltBakedShadowFrame {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  /** Visible body rectangle, excluding baked shadows; absent on older atlases. */
  readonly bodyBounds?: readonly [number, number, number, number] | null;
  readonly spans: readonly number[];
}

export interface BuiltBakedShadow {
  readonly color: string;
  readonly frames: Readonly<Record<string, readonly BuiltBakedShadowFrame[]>>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate once when lazy category metadata arrives, before any frame can be
 * suppressed. Missing metadata preserves the legacy/original presentation. */
export function parseBakedShadow(
  value: unknown,
  metadata: Pick<AtlasMetadata, 'animations' | 'variants' | 'states'>,
): BuiltBakedShadow | undefined {
  if (value === undefined) return undefined;
  const fail = (): never => { throw new Error('Invalid baked shadow frame metadata'); };
  if (!record(value) || typeof value['color'] !== 'string'
    || !/^#[0-9a-f]{8}$/i.test(value['color']) || !record(value['frames'])) return fail();
  const alpha = Number.parseInt(value['color'].slice(7), 16);
  if (alpha === 0 || alpha === 255) return fail();
  const expected: Record<string, readonly AtlasFrame[]> = { ...metadata.animations, ...metadata.variants };
  for (const [name, frame] of Object.entries(metadata.states ?? {})) expected[name] = [frame];
  if (Object.keys(value['frames']).length !== Object.keys(expected).length) return fail();
  const frames: Record<string, BuiltBakedShadowFrame[]> = {};
  let total = 0;
  for (const [name, originals] of Object.entries(expected)) {
    const selections = value['frames'][name];
    if (!Array.isArray(selections) || selections.length !== originals.length) return fail();
    frames[name] = selections.map((selection: unknown, index) => {
      const original = originals[index]!;
      if (!record(selection)) return fail();
      const { width, height, pixelCount, spans } = selection;
      if (typeof width !== 'number' || typeof height !== 'number' || typeof pixelCount !== 'number'
        || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
        || width !== original.width || height !== original.height
        || !Number.isSafeInteger(pixelCount) || pixelCount < 0 || pixelCount > width * height
        || !Array.isArray(spans) || spans.length % 3 !== 0
        || spans.length > width * height * 3 || !spans.every(Number.isSafeInteger)) return fail();
      let count = 0;
      let previousY = -1;
      let previousEnd = 0;
      for (let i = 0; i < spans.length; i += 3) {
        const y = spans[i] as number;
        const x = spans[i + 1] as number;
        const length = spans[i + 2] as number;
        if (y < 0 || y >= height || x < 0 || length <= 0 || x + length > width
          || y < previousY || (y === previousY && x < previousEnd)) return fail();
        count += length;
        previousY = y;
        previousEnd = x + length;
      }
      if (count !== pixelCount) return fail();
      const body = selection['bodyBounds'];
      if (body !== undefined && body !== null && (!Array.isArray(body) || body.length !== 4
        || !body.every(Number.isSafeInteger) || body[0] < 0 || body[1] < 0
        || body[2] <= body[0] || body[3] <= body[1] || body[2] > width || body[3] > height)) return fail();
      total += count;
      return { width, height, pixelCount, spans: spans as number[],
        ...(body === undefined ? {} : { bodyBounds: body as readonly [number, number, number, number] | null }) };
    });
  }
  if (total === 0) return fail();
  return { color: value['color'].toLowerCase(), frames };
}
