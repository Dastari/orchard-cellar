import type { UiTextRole, UiTone } from '../tokens.js';
import { UI_TONE_FACES } from './faces.js';

export { UI_TONE_FACES } from './faces.js';
export type UiToneSurface = keyof typeof UI_TONE_FACES.primary;
export const UI_CONTRAST_THRESHOLD = 4.5;
const inks = { light: '#fff6e0', dark: '#0e071b' } as const;
export interface UiTextContrast {
  readonly mode: 'light' | 'dark' | 'outlined';
  readonly color: string;
  readonly outlineColor?: string;
  readonly reason?: string;
  readonly ratio: number;
}
/** Authored exceptions require an explanation and are tested separately. None needed today. */
export const UI_CONTRAST_OVERRIDES: Readonly<Partial<Record<UiTone, {
  readonly ink: keyof typeof inks;
  readonly reason: string;
}>>> = Object.freeze({});

export function uiRelativeLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) throw new Error(`Invalid opaque RGB colour: ${hex}`);
  const value = Number.parseInt(hex.slice(1), 16);
  const linear = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(value >>> 16) + 0.7152 * linear((value >>> 8) & 255) + 0.0722 * linear(value & 255);
}
export function uiContrastRatio(a: string, b: string): number {
  const left = uiRelativeLuminance(a), right = uiRelativeLuminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}
/** All bitmap roles keep the stricter body threshold, including headers. */
export function resolveUiTextContrast(tone: UiTone, role: UiTextRole = 'body', surface: UiToneSurface = 'frame'): UiTextContrast {
  const face = UI_TONE_FACES[tone][surface].face;
  const override = UI_CONTRAST_OVERRIDES[tone];
  const mode = override?.ink ?? (uiContrastRatio(face, inks.dark) >= uiContrastRatio(face, inks.light) ? 'dark' : 'light');
  const ratio = uiContrastRatio(face, inks[mode]);
  if (ratio < UI_CONTRAST_THRESHOLD && override === undefined) {
    throw new Error(`Unreadable kit tone: ${tone}/${role}/${surface}`);
  }
  return Object.freeze({ mode, color: inks[mode], ratio, ...(override ? { reason: override.reason } : {}) });
}
