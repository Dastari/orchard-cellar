const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/**
 * Maps one sprite pixel onto a cool, high-contrast stone ramp. The tiny
 * coordinate-based variation keeps large flat areas from looking like a CSS
 * desaturation while remaining deterministic and pixel-aligned.
 */
export function stonePalettePixel(
  red: number,
  green: number,
  blue: number,
  x: number,
  y: number,
): readonly [number, number, number] {
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
  const grain = ((x * 17 + y * 31) % 13 === 0 ? -9 : 0)
    + ((x * 7 + y * 11) % 19 === 0 ? 7 : 0);
  const shade = clampChannel(luminance * 0.56 + 46 + grain);
  return [
    clampChannel(shade - 8),
    clampChannel(shade - 3),
    clampChannel(shade + 3),
  ];
}

/** Mutates a small, frame-local RGBA buffer without changing its alpha mask. */
export function applyStonePalette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] === 0) continue;
      const [red, green, blue] = stonePalettePixel(
        pixels[offset]!,
        pixels[offset + 1]!,
        pixels[offset + 2]!,
        x,
        y,
      );
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
    }
  }
}
