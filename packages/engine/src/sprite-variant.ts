import { atlasFrames, type LoadedAsset } from '@orchard/ui';

/** Extracts one animation into a small sheet, preserving alpha and frame timing.
 * Palette replacement applies only to exact source RGB values. */
export function spriteAnimationVariant(asset: LoadedAsset, animation: string, options: {
  readonly flipX?: boolean;
  readonly palette?: ReadonlyMap<string, string>;
  readonly createCanvas?: (width: number, height: number) => OffscreenCanvas;
} = {}): LoadedAsset {
  const frames = atlasFrames(asset.metadata, animation);
  if (!frames.length) throw new Error(`Missing sprite animation ${asset.name}/${animation}`);
  const width = Math.max(...frames.map(frame => frame.width)), height = Math.max(...frames.map(frame => frame.height));
  const canvas = (options.createCanvas ?? ((width, height) => new OffscreenCanvas(width, height)))(width * frames.length, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Sprite variant canvas unavailable');
  context.imageSmoothingEnabled = false;
  frames.forEach((frame, index) => {
    context.save();
    if (options.flipX) { context.translate(index * width + frame.width, 0); context.scale(-1, 1); }
    else context.translate(index * width, 0);
    context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    context.restore();
  });
  if (options.palette?.size) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height), colors = new Map<number, number>();
    for (const [source, target] of options.palette) {
      if (!/^#[a-f0-9]{6}$/iu.test(source) || !/^#[a-f0-9]{6}$/iu.test(target)) throw new Error('Sprite palette expects RGB hex colours');
      colors.set(Number.parseInt(source.slice(1), 16), Number.parseInt(target.slice(1), 16));
    }
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const value = colors.get((pixels.data[offset]! << 16) | (pixels.data[offset + 1]! << 8) | pixels.data[offset + 2]!);
      if (value !== undefined) { pixels.data[offset] = value >> 16; pixels.data[offset + 1] = value >> 8 & 255; pixels.data[offset + 2] = value & 255; }
    }
    context.putImageData(pixels, 0, 0);
  }
  return { ...asset, image: canvas, metadata: { ...asset.metadata,
    animations: { [animation]: frames.map((frame, index) => ({ ...frame, x: index * width, y: 0 })) }, variants: {}, states: {},
  } };
}
