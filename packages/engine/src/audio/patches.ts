import type { PatchName } from './types.js';

export interface Patch {
  readonly wave: OscillatorType;
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  readonly filterHz: number;
  readonly vibratoHz: number;
  readonly vibratoDepth: number;
  readonly reverbSend: number;
}

export const PATCHES: Readonly<Record<PatchName, Patch>> = {
  flute: { wave: 'sine', attack: 0.08, decay: 0.18, sustain: 0.72, release: 0.35, filterHz: 3600, vibratoHz: 4.7, vibratoDepth: 4, reverbSend: 0.3 },
  pad: { wave: 'triangle', attack: 0.75, decay: 0.8, sustain: 0.58, release: 1.4, filterHz: 1200, vibratoHz: 0.3, vibratoDepth: 2, reverbSend: 0.5 },
  pluck: { wave: 'triangle', attack: 0.005, decay: 0.32, sustain: 0.05, release: 0.22, filterHz: 2400, vibratoHz: 0, vibratoDepth: 0, reverbSend: 0.22 },
  bass: { wave: 'sine', attack: 0.025, decay: 0.25, sustain: 0.65, release: 0.3, filterHz: 620, vibratoHz: 0, vibratoDepth: 0, reverbSend: 0.08 },
  bells: { wave: 'sine', attack: 0.004, decay: 0.9, sustain: 0.02, release: 0.7, filterHz: 5200, vibratoHz: 0, vibratoDepth: 0, reverbSend: 0.48 },
  strings: { wave: 'triangle', attack: 0.32, decay: 0.5, sustain: 0.7, release: 0.8, filterHz: 1800, vibratoHz: 5.1, vibratoDepth: 3, reverbSend: 0.38 },
  accordion: { wave: 'sawtooth', attack: 0.1, decay: 0.2, sustain: 0.58, release: 0.25, filterHz: 1500, vibratoHz: 5.5, vibratoDepth: 2, reverbSend: 0.2 },
  woodblock: { wave: 'triangle', attack: 0.002, decay: 0.08, sustain: 0, release: 0.04, filterHz: 1700, vibratoHz: 0, vibratoDepth: 0, reverbSend: 0.08 },
  shaker: { wave: 'triangle', attack: 0.002, decay: 0.05, sustain: 0, release: 0.02, filterHz: 4200, vibratoHz: 0, vibratoDepth: 0, reverbSend: 0.06 },
};

export function decibelsToGain(decibels: number): number {
  return 10 ** (decibels / 20);
}
