export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly durationTicks: number;
}

export interface AtlasMetadata {
  readonly image: string;
  readonly animations: Readonly<Record<string, readonly AtlasFrame[]>>;
  readonly animationMeta?: Readonly<Record<string, { readonly fps: number; readonly loop: boolean }>>;
  readonly variants?: Readonly<Record<string, readonly AtlasFrame[]>>;
  readonly variantMeta?: Readonly<Record<string, { readonly topology?: 'blob47' }>>;
  readonly states?: Readonly<Record<string, AtlasFrame>>;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseAtlasMetadata(value: unknown): AtlasMetadata {
  if (typeof value !== 'object' || value === null) throw new Error('Atlas metadata must be an object');
  const record = value as Record<string, unknown>;
  if (typeof record['image'] !== 'string') throw new Error('Atlas metadata image must be a string');
  const animationsValue = record['animations'];
  if (typeof animationsValue !== 'object' || animationsValue === null) {
    throw new Error('Atlas metadata animations must be an object');
  }
  const animations: Record<string, AtlasFrame[]> = {};
  for (const [name, framesValue] of Object.entries(animationsValue)) {
    if (!Array.isArray(framesValue)) throw new Error(`Animation ${name} must be an array`);
    animations[name] = framesValue.map((frameValue) => {
      if (typeof frameValue !== 'object' || frameValue === null) throw new Error(`Invalid frame in ${name}`);
      const frame = frameValue as Record<string, unknown>;
      if (![frame['x'], frame['y'], frame['width'], frame['height'], frame['durationTicks']].every(isNumber)) {
        throw new Error(`Frame in ${name} contains a non-number`);
      }
      return {
        x: frame['x'] as number,
        y: frame['y'] as number,
        width: frame['width'] as number,
        height: frame['height'] as number,
        durationTicks: frame['durationTicks'] as number,
      };
    });
  }
  return { image: record['image'], animations };
}

export async function loadAtlasMetadata(url: string): Promise<AtlasMetadata> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load atlas metadata: ${response.status}`);
  return parseAtlasMetadata(await response.json());
}

/** Select a named visual without confusing variants/states with timed animation. */
export function atlasFrames(metadata: AtlasMetadata, name: string): readonly AtlasFrame[] {
  const animation = metadata.animations[name];
  if (animation) return animation;
  const variants = metadata.variants?.[name];
  if (variants) return variants;
  const state = metadata.states?.[name];
  return state ? [state] : [];
}

export function selectAtlasFrame(metadata: AtlasMetadata, name: string, index = 0): AtlasFrame | null {
  const frames = atlasFrames(metadata, name);
  return frames[index % Math.max(1, frames.length)] ?? frames[0] ?? null;
}

export class SpriteAnimator {
  private frameTick = 0;
  private frameIndex = 0;

  constructor(readonly metadata: AtlasMetadata, private animation: string) {}

  setAnimation(animation: string): void {
    if (animation === this.animation) return;
    this.animation = animation;
    this.frameTick = 0;
    this.frameIndex = 0;
  }

  reset(): void {
    this.frameTick = 0;
    this.frameIndex = 0;
  }

  update(): void {
    const frames = this.metadata.animations[this.animation] ?? [];
    if (frames.length === 0) return;
    const frame = frames[this.frameIndex];
    if (!frame) return;
    this.frameTick += 1;
    if (this.frameTick >= frame.durationTicks) {
      this.frameTick = 0;
      this.frameIndex = (this.frameIndex + 1) % frames.length;
    }
  }

  getFrame(): AtlasFrame | null {
    return this.metadata.animations[this.animation]?.[this.frameIndex] ?? null;
  }
}

export interface YSortableSprite {
  readonly y: number;
  draw(context: CanvasRenderingContext2D): void;
}

export function sortByY(sprites: readonly YSortableSprite[]): YSortableSprite[] {
  return [...sprites].sort((left, right) => left.y - right.y);
}

export function drawYSorted(context: CanvasRenderingContext2D, sprites: readonly YSortableSprite[]): void {
  for (const sprite of sortByY(sprites)) sprite.draw(context);
}

export function drawAtlasFrame(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  frame: AtlasFrame,
  x: number,
  y: number,
): void {
  context.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    Math.round(x - frame.width / 2),
    Math.round(y - frame.height + 4),
    frame.width,
    frame.height,
  );
}
