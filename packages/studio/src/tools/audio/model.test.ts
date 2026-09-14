import { describe, expect, it, vi } from 'vitest';
import type { GameAudio } from '@orchard/engine/audio/audio-bus';
import { AUDIO_PREVIEW_SFX, AUDIO_PREVIEW_SONGS, AudioPreviewModel } from './model.js';

function fakeAudio() {
  return {
    unlock: vi.fn(async () => undefined), playSong: vi.fn(async () => undefined), playSfx: vi.fn(async () => undefined),
    stop: vi.fn(), getStatus: vi.fn(() => ({ unlocked: true, state: 'running' as const, song: null, meter: 0,
      ambience: { season: 'spring' as const, time: 'day' as const, location: 'estate' as const } })),
    setSeason: vi.fn(async () => undefined), setAmbienceContext: vi.fn(), playFootstep: vi.fn(async () => undefined),
    fadeOutForNavigation: vi.fn(async () => undefined), getSettings: vi.fn(() => ({ master: 1, music: 1, sfx: 1, musicInBackground: false, soundsInBackground: false })),
    setVolume: vi.fn(), setBackgroundPlayback: vi.fn(),
  } satisfies GameAudio;
}

describe('Audio Preview model', () => {
  it('constructs no playback system until the user explicitly plays a cue', async () => {
    const audio = fakeAudio(); const factory = vi.fn(() => audio); const model = new AudioPreviewModel(factory);
    expect(model.audioConstructed()).toBe(false); expect(factory).not.toHaveBeenCalled();
    await model.playSong('theme_spring');
    expect(factory).toHaveBeenCalledOnce(); expect(audio.unlock).toHaveBeenCalledBefore(audio.playSong);
  });

  it('exposes the complete migrated preview cue catalogs', () => {
    expect(AUDIO_PREVIEW_SONGS).toEqual(['theme_title', 'theme_spring', 'theme_night']);
    expect(AUDIO_PREVIEW_SFX).toContain('footstep_cellar'); expect(AUDIO_PREVIEW_SFX).toContain('wind_gust');
  });
});
