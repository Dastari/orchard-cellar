import type { RgbColor } from './lighting.js';
import type { WorldFrameEffect } from './world-frame-effect.js';

const cosine = Math.cos(315 * Math.PI / 180), sine = Math.sin(315 * Math.PI / 180);
// Filter Effects 1: clamp between primitives, retain floating precision within each.
const placementMatrices = [
  [.3 + .7 * .2126, .7 * .7152, .7 * .0722, .7 * .2126, .3 + .7 * .7152, .7 * .0722, .7 * .2126, .7 * .7152, .3 + .7 * .0722],
  [.393, .769, .189, .349, .686, .168, .272, .534, .131],
  [.213 + .787 * cosine - .213 * sine, .715 - .715 * cosine - .715 * sine, .072 - .072 * cosine + .928 * sine,
    .213 - .213 * cosine + .143 * sine, .715 + .285 * cosine + .140 * sine, .072 - .072 * cosine - .283 * sine,
    .213 - .213 * cosine - .787 * sine, .715 - .715 * cosine + .715 * sine, .072 + .928 * cosine + .072 * sine],
  [.213 + .787 * 3, .715 - .715 * 3, .072 - .072 * 3, .213 - .213 * 3, .715 + .285 * 3, .072 - .072 * 3,
    .213 - .213 * 3, .715 - .715 * 3, .072 + .928 * 3],
] as const;
function clamp(value: number): number { return Math.max(0, Math.min(255, value)); }
/** Reconstruct receiver multiply/destination-in from immutable source pixels.
 * No world or tint surface is read. Output is an immediate upload scratch buffer. */
export function writeWorldEffectPixels(input: Uint8ClampedArray, width: number, height: number,
  output: Uint8ClampedArray, stride: number, color: RgbColor, effect: WorldFrameEffect, emission?: readonly number[]): void {
  const white = color.r === 255 && color.g === 255 && color.b === 255;
  const brightness = effect === 'dim' ? .42 : effect === 'enemy-hit' ? 2.1 : effect === 'wildlife-hit' ? 2.15 : effect === 'placement-valid' ? 1.15 : 1;
  const saturation = effect === 'dim' ? .55 : effect === 'enemy-hit' ? .4 : effect === 'wildlife-hit' ? .25 : 1;
  const opacity = effect === 'dim' ? .88 : 1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, o = (y * stride + x) * 4;
    const alpha = input[i + 3]!, a = alpha / 255;
    let r = white ? input[i]! : color.r * (1 - a + input[i]! * a / 255);
    let g = white ? input[i + 1]! : color.g * (1 - a + input[i + 1]! * a / 255);
    let b = white ? input[i + 2]! : color.b * (1 - a + input[i + 2]! * a / 255);
    let restoredAlpha = alpha;
    if (!white) for (let span = 0; span < (emission?.length ?? 0); span += 3) {
      if (emission![span] !== y || x < emission![span + 1]! || x >= emission![span + 1]! + emission![span + 2]!) continue;
      r = (input[i]! + r * (1 - a)) / (2 - a);
      g = (input[i + 1]! + g * (1 - a)) / (2 - a);
      b = (input[i + 2]! + b * (1 - a)) / (2 - a);
      restoredAlpha = alpha * (2 - a); break;
    }
    r = clamp(r * brightness); g = clamp(g * brightness); b = clamp(b * brightness);
    if (effect === 'placement-invalid') for (const m of placementMatrices) {
      const nr = clamp(m[0] * r + m[1] * g + m[2] * b);
      const ng = clamp(m[3] * r + m[4] * g + m[5] * b);
      b = clamp(m[6] * r + m[7] * g + m[8] * b); r = nr; g = ng;
    }
    const luminance = .213 * r + .715 * g + .072 * b;
    output[o] = Math.round(r * saturation + luminance * (1 - saturation));
    output[o + 1] = Math.round(g * saturation + luminance * (1 - saturation));
    output[o + 2] = Math.round(b * saturation + luminance * (1 - saturation));
    output[o + 3] = Math.round(restoredAlpha * opacity);
  }
}
