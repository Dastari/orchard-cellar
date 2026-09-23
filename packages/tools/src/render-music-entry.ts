/**
 * Browser half of `npm run music:render`. Renders one tracker song through the
 * exact runtime synth (MusicMixer + Sequencer + game bus levels and limiter) with
 * an OfflineAudioContext, then posts 16-bit PCM and level statistics back to the
 * Node driver. Runs only inside headless Chrome; never shipped with the game.
 */
import { DEFAULT_AUDIO_SETTINGS } from '@orchard/engine/audio/audio-bus';
import { MusicMixer } from '@orchard/engine/audio/music-synth';
import { compileSong, Sequencer } from '@orchard/engine/audio/sequencer';
import type { SongSource } from '@orchard/engine/audio/types';

declare global {
  interface Window {
    renderSong(song: SongSource, sampleRate: number, passes: number, report: string): Promise<void>;
  }
}

function levelStats(left: Float32Array, right: Float32Array, sampleRate: number): Record<string, number> {
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  const window = Math.floor(sampleRate * 0.4);
  let loudestWindow = 0;
  let windowSum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    const square = (l * l + r * r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    if (Math.abs(l) >= 0.999 || Math.abs(r) >= 0.999) clipped += 1;
    sum += square;
    windowSum += square;
    if (index >= window) {
      const old = ((left[index - window] ?? 0) ** 2 + (right[index - window] ?? 0) ** 2) / 2;
      windowSum -= old;
    }
    if (index >= window) loudestWindow = Math.max(loudestWindow, windowSum / window);
  }
  const db = (value: number): number => Math.round(10 * Math.log10(Math.max(1e-12, value)) * 10) / 10;
  return {
    peakDbfs: Math.round(20 * Math.log10(Math.max(1e-9, peak)) * 10) / 10,
    rmsDbfs: db(sum / left.length),
    loudest400msDbfs: db(loudestWindow),
    clippedSamples: clipped,
  };
}

window.renderSong = async (song, sampleRate, passes, report) => {
  const compiled = compileSong(song);
  const tail = 4;
  const seconds = compiled.lengthSeconds * passes + tail;
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  // Mirror the game bus: music volume → master volume → soft limiter.
  const music = context.createGain();
  music.gain.value = DEFAULT_AUDIO_SETTINGS.music;
  const master = context.createGain();
  master.gain.value = DEFAULT_AUDIO_SETTINGS.master;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 8;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.18;
  music.connect(master).connect(limiter).connect(context.destination);
  const mixer = new MusicMixer(context, music);
  const deck = mixer.createDeck(compiled);
  deck.fadeTo(1, 0.001, 0, 1);
  let voices = 0;
  const sequencer = new Sequencer({
    currentTime: () => 0,
    playVoice: (voice) => { voices += 1; deck.playVoice(voice); },
    setInterval: () => null,
    clearInterval: () => undefined,
  });
  sequencer.start(compiled, { at: 0, loop: passes > 1 });
  sequencer.tick(compiled.lengthSeconds * passes);
  sequencer.stop();
  const started = performance.now();
  const buffer = await context.startRendering();
  const renderMs = performance.now() - started;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const pcm = new Int16Array(left.length * 2);
  for (let index = 0; index < left.length; index += 1) {
    pcm[index * 2] = Math.max(-32768, Math.min(32767, Math.round((left[index] ?? 0) * 32767)));
    pcm[index * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round((right[index] ?? 0) * 32767)));
  }
  const stats = {
    song: song.name,
    seconds: Math.round(seconds * 10) / 10,
    voices,
    renderSpeed: Math.round(seconds * 1000 / renderMs * 10) / 10,
    ...levelStats(left, right, sampleRate),
  };
  await fetch(`${report}?stats=${encodeURIComponent(JSON.stringify(stats))}`, { method: 'POST', body: pcm.buffer });
};
