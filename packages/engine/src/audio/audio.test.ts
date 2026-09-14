import { dayProgressAtClockTime } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { decibelsToGain, PATCHES } from './patches.js';
import { noteFrequency } from './sequencer.js';
import {
  ambienceTimeAtProgress,
  DEFAULT_AUDIO_SETTINGS,
  isAmbienceEligible,
  parsePersistedMusicPlayback,
  songForAmbience,
  STREAMED_MUSIC,
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
    expect(DEFAULT_AUDIO_SETTINGS.musicInBackground).toBe(false);
    expect(DEFAULT_AUDIO_SETTINGS.soundsInBackground).toBe(false);
  });

  it('gates authored ambience by place, time, and season', () => {
    const bird = {
      bus: 'ambience',
      schedule: { intervalSeconds: [5, 12], probability: 1, time: ['day'], season: ['spring', 'summer'] },
    } as unknown as SfxSource;
    expect(ambienceTimeAtProgress(dayProgressAtClockTime(7))).toBe('dawn');
    expect(ambienceTimeAtProgress(dayProgressAtClockTime(12))).toBe('day');
    expect(ambienceTimeAtProgress(dayProgressAtClockTime(20))).toBe('dusk');
    expect(ambienceTimeAtProgress(dayProgressAtClockTime(23))).toBe('night');
    expect(ambienceTimeAtProgress(dayProgressAtClockTime(5))).toBe('dawn');
    expect(isAmbienceEligible(bird, { season: 'spring', time: 'day', location: 'estate' })).toBe(true);
    expect(isAmbienceEligible(bird, { season: 'winter', time: 'day', location: 'estate' })).toBe(false);
    expect(isAmbienceEligible(bird, { season: 'spring', time: 'night', location: 'estate' })).toBe(false);
    expect(isAmbienceEligible(bird, { season: 'spring', time: 'day', location: 'cellar' })).toBe(false);
  });

  it('switches the exterior score to the authored night theme', () => {
    expect(songForAmbience({ season: 'spring', time: 'day', location: 'estate' })).toBe('theme_spring');
    expect(songForAmbience({ season: 'spring', time: 'dusk', location: 'estate' })).toBe('theme_night');
    expect(songForAmbience({ season: 'spring', time: 'night', location: 'estate' })).toBe('theme_night');
  });

  it('streams title, day, and night recordings while leaving atmospheric gaps in-world', () => {
    expect(STREAMED_MUSIC.theme_title).toMatchObject({ url: '/music/orchard-title.mp3', continuous: true });
    expect(STREAMED_MUSIC.theme_spring.continuous).toBe(false);
    expect(STREAMED_MUSIC.theme_spring.silenceSeconds[0]).toBeGreaterThan(0);
    expect(STREAMED_MUSIC.theme_night).toMatchObject({ url: '/music/orchard-night.mp3', continuous: false });
  });

  it('validates durable music checkpoints without accepting corrupt positions', () => {
    const checkpoint = {
      version: 1, song: 'theme_night', phase: 'playing', positionSeconds: 42.5, gapRemainingSeconds: 0,
    };
    expect(parsePersistedMusicPlayback(JSON.stringify(checkpoint))).toEqual(checkpoint);
    expect(parsePersistedMusicPlayback(JSON.stringify({ ...checkpoint, positionSeconds: -1 }))).toBeNull();
    expect(parsePersistedMusicPlayback(JSON.stringify({ ...checkpoint, song: 'missing' }))).toBeNull();
    expect(parsePersistedMusicPlayback('{')).toBeNull();
  });
});
