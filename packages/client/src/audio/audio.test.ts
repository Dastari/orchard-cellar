import { describe, expect, it } from 'vitest';
import { decibelsToGain, PATCHES } from './patches.js';
import { noteFrequency } from './sequencer.js';
import {
  ambienceTimeAtProgress,
  DEFAULT_AUDIO_SETTINGS,
  isAmbienceEligible,
  songForAmbience,
} from './audio-bus.js';
import type { SfxSource } from './types.js';

describe('text-authored audio', () => {
  it('keeps the closed patch set and stable note tuning', () => {
    expect(Object.keys(PATCHES)).toEqual(['flute', 'pad', 'pluck', 'bass', 'bells', 'strings', 'accordion', 'woodblock', 'shaker']);
    expect(noteFrequency('A4')).toBe(440);
    expect(noteFrequency('G4')).toBeCloseTo(391.996, 2);
    expect(() => noteFrequency('H2')).toThrow(/Invalid tracker note/);
  });

  it('converts bus levels from decibels', () => {
    expect(decibelsToGain(0)).toBe(1);
    expect(decibelsToGain(-6)).toBeCloseTo(0.501, 2);
    expect(DEFAULT_AUDIO_SETTINGS.sfx / DEFAULT_AUDIO_SETTINGS.music).toBeCloseTo(decibelsToGain(-6), 2);
  });

  it('gates authored ambience by place, time, and season', () => {
    const bird = {
      bus: 'ambience',
      schedule: { intervalSeconds: [5, 12], probability: 1, time: ['day'], season: ['spring', 'summer'] },
    } as unknown as SfxSource;
    expect(ambienceTimeAtProgress(0.05)).toBe('dawn');
    expect(ambienceTimeAtProgress(0.4)).toBe('day');
    expect(ambienceTimeAtProgress(0.7)).toBe('dusk');
    expect(ambienceTimeAtProgress(0.9)).toBe('night');
    expect(isAmbienceEligible(bird, { season: 'spring', time: 'day', location: 'estate' })).toBe(true);
    expect(isAmbienceEligible(bird, { season: 'winter', time: 'day', location: 'estate' })).toBe(false);
    expect(isAmbienceEligible(bird, { season: 'spring', time: 'night', location: 'estate' })).toBe(false);
    expect(isAmbienceEligible(bird, { season: 'spring', time: 'day', location: 'cellar' })).toBe(false);
  });

  it('switches the exterior score to the authored night theme', () => {
    expect(songForAmbience({ season: 'spring', time: 'day', location: 'estate' })).toBe('theme_spring');
    expect(songForAmbience({ season: 'spring', time: 'night', location: 'estate' })).toBe('theme_night');
  });
});
