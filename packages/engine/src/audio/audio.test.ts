import { dayProgressAtClockTime } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { decibelsToGain, PATCHES } from './patches.js';
import { noteFrequency } from './sequencer.js';
import {
  ambienceTimeAtProgress,
  DEFAULT_AUDIO_SETTINGS,
  isAmbienceEligible,
  parsePersistedMusicPlayback,
  musicCueFor,
  MUSIC_CUES,
  songForAmbience,
  songUrl,
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

  it('plays tracker songs: the title loops while world cues leave atmospheric gaps', () => {
    expect(Object.keys(MUSIC_CUES)).toEqual(['theme_title', 'theme_spring', 'theme_night']);
    expect(MUSIC_CUES.theme_title.continuous).toBe(true);
    expect(MUSIC_CUES.theme_spring.continuous).toBe(false);
    expect(MUSIC_CUES.theme_spring.silenceSeconds[0]).toBeGreaterThan(0);
    expect(MUSIC_CUES.theme_night.continuous).toBe(false);
    expect(musicCueFor('theme_audition')).toEqual({ continuous: true, silenceSeconds: [0, 0] });
    expect(songUrl('theme_night')).toBe('/generated/music/theme_night.song.json');
    expect(() => songUrl('../secrets')).toThrow(/Invalid song name/);
    expect(songForAmbience({ season: 'spring', time: 'dawn', location: 'estate' })).toBe('theme_spring');
    expect(songForAmbience({ season: 'winter', time: 'night', location: 'cellar' })).toBe('theme_spring');
  });

  it('validates versioned tracker checkpoints and ignores retired streamed checkpoints', () => {
    const checkpoint = {
      version: 2, song: 'theme_night', phase: 'playing', positionSteps: 212.5, gapRemainingSeconds: 0,
    };
    expect(parsePersistedMusicPlayback(JSON.stringify(checkpoint))).toEqual(checkpoint);
    expect(parsePersistedMusicPlayback(JSON.stringify({ ...checkpoint, phase: 'gap', gapRemainingSeconds: 30 })))
      .toMatchObject({ phase: 'gap', gapRemainingSeconds: 30 });
    expect(parsePersistedMusicPlayback(JSON.stringify({ ...checkpoint, positionSteps: -1 }))).toBeNull();
    expect(parsePersistedMusicPlayback(JSON.stringify({ ...checkpoint, positionSteps: Number.NaN }))).toBeNull();
    expect(parsePersistedMusicPlayback(JSON.stringify({ ...checkpoint, song: 'missing' }))).toBeNull();
    expect(parsePersistedMusicPlayback(JSON.stringify({ ...checkpoint, extra: 'dropped' }))).toEqual(checkpoint);
    // Version 1 stored seconds into an MP3; it must never be reinterpreted as a tracker position.
    expect(parsePersistedMusicPlayback(JSON.stringify({
      version: 1, song: 'theme_night', phase: 'playing', positionSeconds: 42.5, gapRemainingSeconds: 0,
    }))).toBeNull();
    expect(parsePersistedMusicPlayback('null')).toBeNull();
    expect(parsePersistedMusicPlayback('{')).toBeNull();
    expect(parsePersistedMusicPlayback(null)).toBeNull();
  });
});
