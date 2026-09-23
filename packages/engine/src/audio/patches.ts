import type { Instrument, InstrumentOverrides, PatchName } from './types.js';

/**
 * The closed patch set. Each patch is a small subtractive/additive voice:
 * detuned oscillator layers → optional breath/rattle noise → enveloped filter →
 * amplitude ADSR → channel pan → dry + reverb/chorus/echo sends. Parameters are
 * documented for composers on wiki: Systems/Audio & Music (Instrument parameters).
 */
export const PATCHES: Readonly<Record<PatchName, Instrument>> = {
  flute: {
    oscillators: [
      { wave: 'sine', gain: 1 },
      { wave: 'triangle', detuneCents: 4, gain: 0.22 },
      { wave: 'sine', ratio: 2, gain: 0.1 },
      { wave: 'sine', ratio: 3, gain: 0.04 },
    ],
    noise: { gain: 0.05, filterHz: 2400, q: 1.1, decay: 0 },
    amp: { attack: 0.07, decay: 0.35, sustain: 0.82, release: 0.32 },
    filter: { type: 'lowpass', cutoffHz: 3400, q: 0.7, envOctaves: 0.6, envDecay: 0.14, keyTrack: 0.5, velocityOctaves: 1 },
    vibrato: { rateHz: 5, depthCents: 13, delay: 0.32 },
    velocity: 0.6,
    gain: 0.95,
    pan: 0.12,
    sends: { reverb: 0.32, chorus: 0.08, delay: 0.16 },
    humanize: { timingMs: 10, velocity: 0.06 },
  },
  pad: {
    oscillators: [
      { wave: 'sawtooth', detuneCents: -9, gain: 0.8, pan: -0.7 },
      { wave: 'sawtooth', detuneCents: 2, gain: 0.5, pan: 0 },
      { wave: 'sawtooth', detuneCents: 10, gain: 0.8, pan: 0.7 },
      { wave: 'triangle', ratio: 2, detuneCents: -4, gain: 0.18, pan: 0.3 },
    ],
    amp: { attack: 1.2, decay: 3.5, sustain: 0.35, release: 1.8 },
    filter: { type: 'lowpass', cutoffHz: 1100, q: 0.6, envOctaves: 0.6, envDecay: 2.5, keyTrack: 0.3, velocityOctaves: 0.8 },
    velocity: 0.4,
    gain: 0.5,
    pan: 0,
    sends: { reverb: 0.45, chorus: 0.35, delay: 0 },
    humanize: { timingMs: 14, velocity: 0.05 },
  },
  pluck: {
    oscillators: [
      { wave: 'sine', gain: 1 },
      { wave: 'triangle', gain: 0.3 },
      { wave: 'sine', ratio: 5.4, gain: 0.22, decay: 0.07 },
    ],
    amp: { attack: 0.003, decay: 1, sustain: 0, release: 0.3 },
    filter: { type: 'lowpass', cutoffHz: 2400, q: 1, envOctaves: 1.5, envDecay: 0.08, keyTrack: 0.7, velocityOctaves: 1.2 },
    pitchDrop: { cents: 14, seconds: 0.03 },
    velocity: 0.7,
    gain: 1,
    pan: 0.3,
    sends: { reverb: 0.3, chorus: 0.05, delay: 0.22 },
    oneShot: true,
    humanize: { timingMs: 8, velocity: 0.1 },
  },
  bass: {
    oscillators: [
      { wave: 'sine', gain: 1 },
      { wave: 'triangle', gain: 0.35 },
      { wave: 'sine', ratio: 2, gain: 0.1 },
    ],
    amp: { attack: 0.012, decay: 1.4, sustain: 0.12, release: 0.3 },
    filter: { type: 'lowpass', cutoffHz: 700, q: 0.8, envOctaves: 1.1, envDecay: 0.12, keyTrack: 0.2, velocityOctaves: 0.6 },
    velocity: 0.55,
    gain: 0.75,
    pan: 0,
    sends: { reverb: 0.06, chorus: 0, delay: 0 },
    humanize: { timingMs: 6, velocity: 0.05 },
  },
  bells: {
    oscillators: [
      { wave: 'sine', gain: 1, decay: 2.4 },
      { wave: 'sine', ratio: 2, gain: 0.32, decay: 1.2 },
      { wave: 'sine', ratio: 2.76, gain: 0.42, decay: 0.9 },
      { wave: 'sine', ratio: 5.4, gain: 0.18, decay: 0.35 },
      { wave: 'sine', ratio: 8.93, gain: 0.07, decay: 0.15 },
    ],
    amp: { attack: 0.002, decay: 2.4, sustain: 0, release: 1.2 },
    filter: { type: 'lowpass', cutoffHz: 6000, q: 0.5, envOctaves: 0, envDecay: 0.1, keyTrack: 0.5, velocityOctaves: 1 },
    velocity: 0.7,
    gain: 1.5,
    pan: -0.35,
    sends: { reverb: 0.5, chorus: 0.1, delay: 0.28 },
    oneShot: true,
    humanize: { timingMs: 8, velocity: 0.08 },
  },
  strings: {
    oscillators: [
      { wave: 'sawtooth', detuneCents: -6, gain: 0.8, pan: -0.5 },
      { wave: 'sawtooth', detuneCents: 6, gain: 0.8, pan: 0.5 },
      { wave: 'triangle', gain: 0.4, pan: 0 },
    ],
    noise: { gain: 0.02, filterHz: 3000, q: 0.8, decay: 0 },
    amp: { attack: 0.45, decay: 0.8, sustain: 0.9, release: 1.1 },
    filter: { type: 'lowpass', cutoffHz: 1500, q: 0.8, envOctaves: 0.4, envDecay: 0.6, keyTrack: 0.6, velocityOctaves: 1 },
    vibrato: { rateHz: 5.2, depthCents: 10, delay: 0.4 },
    velocity: 0.5,
    gain: 0.75,
    pan: -0.3,
    sends: { reverb: 0.5, chorus: 0.2, delay: 0 },
    humanize: { timingMs: 12, velocity: 0.06 },
  },
  accordion: {
    oscillators: [
      { wave: 'sawtooth', detuneCents: -7, gain: 0.8, pan: -0.25 },
      { wave: 'sawtooth', detuneCents: 7, gain: 0.8, pan: 0.25 },
      { wave: 'square', ratio: 0.5, gain: 0.25, pan: 0 },
    ],
    amp: { attack: 0.07, decay: 0.3, sustain: 0.85, release: 0.18 },
    filter: { type: 'lowpass', cutoffHz: 1900, q: 1.4, envOctaves: 0.3, envDecay: 0.2, keyTrack: 0.5, velocityOctaves: 0.8 },
    vibrato: { rateHz: 5.8, depthCents: 6, delay: 0.25 },
    velocity: 0.5,
    gain: 0.38,
    pan: 0.2,
    sends: { reverb: 0.25, chorus: 0.15, delay: 0.08 },
    humanize: { timingMs: 10, velocity: 0.06 },
  },
  woodblock: {
    oscillators: [
      { wave: 'sine', gain: 1, decay: 0.09 },
      { wave: 'triangle', ratio: 2.3, gain: 0.3, decay: 0.04 },
    ],
    noise: { gain: 0.25, filterHz: 1800, q: 3, decay: 0.02 },
    amp: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
    filter: { type: 'lowpass', cutoffHz: 3200, q: 0.7, envOctaves: 0, envDecay: 0.05, keyTrack: 0.3, velocityOctaves: 0.8 },
    pitchDrop: { cents: 350, seconds: 0.02 },
    velocity: 0.8,
    gain: 0.7,
    pan: -0.15,
    sends: { reverb: 0.12, chorus: 0, delay: 0.05 },
    oneShot: true,
    humanize: { timingMs: 6, velocity: 0.12 },
  },
  shaker: {
    oscillators: [],
    noise: { gain: 1, filterHz: 6500, q: 0.9, decay: 0 },
    amp: { attack: 0.012, decay: 0.09, sustain: 0, release: 0.04 },
    filter: { type: 'highpass', cutoffHz: 3500, q: 0.5, envOctaves: 0, envDecay: 0.05, keyTrack: 0, velocityOctaves: 0.5 },
    velocity: 0.8,
    gain: 4,
    pan: 0.45,
    sends: { reverb: 0.15, chorus: 0, delay: 0 },
    oneShot: true,
    humanize: { timingMs: 9, velocity: 0.2 },
  },
};

/** Apply a channel's additive overrides to a patch. Nested groups merge; `oscillators` replaces. */
export function mergeInstrument(base: Instrument, overrides: InstrumentOverrides | undefined): Instrument {
  if (!overrides) return base;
  const noise = overrides.noise && base.noise ? { ...base.noise, ...overrides.noise } : base.noise;
  const vibrato = overrides.vibrato && base.vibrato ? { ...base.vibrato, ...overrides.vibrato } : base.vibrato;
  return {
    ...base,
    oscillators: overrides.oscillators ?? base.oscillators,
    ...(noise ? { noise } : {}),
    amp: { ...base.amp, ...overrides.amp },
    filter: { ...base.filter, ...overrides.filter },
    ...(vibrato ? { vibrato } : {}),
    ...(overrides.pitchDrop ?? base.pitchDrop ? { pitchDrop: overrides.pitchDrop ?? base.pitchDrop! } : {}),
    velocity: overrides.velocity ?? base.velocity,
    gain: overrides.gain ?? base.gain,
    pan: overrides.pan ?? base.pan,
    sends: { ...base.sends, ...overrides.sends },
    ...(overrides.oneShot ?? base.oneShot ? { oneShot: true } : {}),
    humanize: { ...base.humanize, ...overrides.humanize },
  };
}

export function decibelsToGain(decibels: number): number {
  return 10 ** (decibels / 20);
}
