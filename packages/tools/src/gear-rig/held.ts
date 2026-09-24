import { Raster } from './raster.js';
import { WORN_OUTLINE } from './materials.js';

const ICON_OUTLINE = '#000000';

/**
 * Stand a 45° premium icon upright without redrawing it.
 *
 * Icons are drawn on the diagonal from bottom-left (grip) to top-right (tip).
 * Along that diagonal, pixel coordinates satisfy a = x − y and across it
 * b = x + y. Output pixel (h, v) takes source pixels (a = 2v, b = 2h) and
 * (a = 2v + 1, b = 2h + 1). Together they are a 45° rotation at 1/√2 scale, so a
 * 16 px icon becomes a ~14 px upright item, close to Kenmi's hand-drawn upright
 * weapons. One-pixel diagonal chains (hafts, bowstrings) stay continuous. Colour
 * pixels are sampled first, preferring the rarer colour so gems and guards survive.
 * Then a fresh one-pixel outline is traced in the worn-layer outline colour.
 */
export function uprightFromDiagonal(icon: Raster): Raster {
  const counts = new Map<string, number>();
  for (let y = 0; y < icon.height; y += 1) {
    for (let x = 0; x < icon.width; x += 1) {
      const color = icon.hex(x, y);
      if (color && color !== ICON_OUTLINE) counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }
  const colorAt = (x: number, y: number): string | null => {
    const color = icon.hex(x, y);
    return color && color !== ICON_OUTLINE ? color : null;
  };
  const size = icon.width;
  const cells = new Map<string, string>();
  let minH = Infinity;
  let maxH = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let v = -size; v <= size; v += 1) {
    for (let h = 0; h <= size; h += 1) {
      const candidates = [
        colorAt(h + v, h - v),
        colorAt(h + v + 1, h - v),
      ].filter((color): color is string => color !== null);
      if (candidates.length === 0) continue;
      candidates.sort((left, right) => (counts.get(left)! - counts.get(right)!));
      cells.set(`${h},${v}`, candidates[0]!);
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  const width = maxH - minH + 3;
  const height = maxV - minV + 3;
  const out = new Raster(width, height);
  // v grows toward the tip; flip so the tip is at the top.
  for (const [key, color] of cells) {
    const [h, v] = key.split(',').map(Number) as [number, number];
    out.set(h - minH + 1, maxV - v + 1, color);
  }
  return withOutline(out);
}

/** Add a 4-connected one-pixel outline around every opaque pixel. */
export function withOutline(image: Raster, color = WORN_OUTLINE): Raster {
  const out = new Raster(image.width, image.height, image.rgba.slice());
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.alpha(x, y)) continue;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => image.alpha(x + dx!, y + dy!) > 0);
      if (touches) out.set(x, y, color);
    }
  }
  return out;
}

/** Replace the icon's pure-black outline with the worn-layer outline colour. */
export function wornOutline(icon: Raster): Raster {
  return icon.recolor(new Map([[ICON_OUTLINE, WORN_OUTLINE]]));
}

export function mirror(image: Raster): Raster {
  return new Raster(image.width, image.height).draw(image, 0, 0, true);
}

export function flipVertical(image: Raster): Raster {
  const out = new Raster(image.width, image.height);
  for (let y = 0; y < image.height; y += 1) {
    out.rgba.set(image.rgba.subarray(y * image.width * 4, (y + 1) * image.width * 4), (image.height - 1 - y) * image.width * 4);
  }
  return out;
}

/** Exact quarter turn clockwise. */
export function rotateQuarter(image: Raster): Raster {
  const out = new Raster(image.height, image.width);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const from = (y * image.width + x) * 4;
      const to = (x * out.width + (image.height - 1 - y)) * 4;
      out.rgba.set(image.rgba.subarray(from, from + 4), to);
    }
  }
  return out;
}

/** Nearest-neighbour rotation by an arbitrary angle (today's in-flight arrow behaviour). */
export function rotateNearest(image: Raster, radians: number): Raster {
  const size = Math.ceil(Math.hypot(image.width, image.height));
  const out = new Raster(size, size);
  const cx = image.width / 2;
  const cy = image.height / 2;
  const cos = Math.cos(-radians);
  const sin = Math.sin(-radians);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const rx = x + 0.5 - size / 2;
      const ry = y + 0.5 - size / 2;
      const sx = Math.floor(rx * cos - ry * sin + cx);
      const sy = Math.floor(rx * sin + ry * cos + cy);
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;
      const from = (sy * image.width + sx) * 4;
      out.rgba.set(image.rgba.subarray(from, from + 4), (y * size + x) * 4);
    }
  }
  return out;
}

/** Grip point of an upright item: centre of its opaque span two rows above the bottom. */
export function uprightGrip(image: Raster, rowsFromBottom = 3): { x: number; y: number } {
  const bounds = image.bounds()!;
  const y = bounds.y + bounds.height - 1 - rowsFromBottom;
  const xs: number[] = [];
  for (let x = 0; x < image.width; x += 1) if (image.alpha(x, y)) xs.push(x);
  return { x: xs.length ? Math.round((xs[0]! + xs.at(-1)!) / 2) : Math.floor(image.width / 2), y };
}
