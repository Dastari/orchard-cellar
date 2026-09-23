import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeInstrument, PATCHES } from './patches.js';
import {
  compileSong,
  humanizeNote,
  humanizeUnit,
  noteMidi,
  Sequencer,
  type ScheduledVoice,
  type SequencerHost,
} from './sequencer.js';
import type { SongSource } from './types.js';

const musicRoot = new URL('../../../assets/music/', import.meta.url);

function loadSongs(): SongSource[] {
  return readdirSync(musicRoot).filter((name) => name.endsWith('.song.json')).sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, musicRoot), 'utf8')) as SongSource);
}

function song(overrides: Partial<SongSource> = {}): SongSource {
  return {
    name: 'test_song',
    bpm: 60,
    swing: 0,
    stepsPerBeat: 4,
    beatsPerBar: 4,
    loopBars: 1,
    masterGainDb: 0,
    humanize: 0,
    channels: [
      { patch: 'bass', vol: 1, patterns: ['A'] },
      { patch: 'bells', vol: 0.5, patterns: ['B'] },
    ],
    patterns: {
      A: { steps: 16, notes: [[0, 'C3', 8], [8, 'G2', 8, 0.5]] },
      B: { steps: 16, notes: [[3, 'E5', 2], [12, 'G5', 4]] },
    },
    ...overrides,
  };
}

class FakeHost implements SequencerHost {
  time = 0;
  readonly voices: ScheduledVoice[] = [];
  private readonly timers = new Map<number, () => void>();
  private nextTimer = 1;
  currentTime(): number { return this.time; }
  playVoice(voice: ScheduledVoice): void { this.voices.push(voice); }
  setInterval(callback: () => void): unknown { const id = this.nextTimer++; this.timers.set(id, callback); return id; }
  clearInterval(handle: unknown): void { this.timers.delete(handle as number); }
  get timerCount(): number { return this.timers.size; }
  advance(seconds: number, stepSeconds = 0.25): void {
    const end = this.time + seconds;
    while (this.time < end - 1e-9) {
      this.time = Math.min(end, this.time + stepSeconds);
      for (const callback of [...this.timers.values()]) callback();
    }
  }
}

describe('tracker song compilation', () => {
  it('computes step timing, swing, velocity defaults, and per-channel mix', () => {
    const compiled = compileSong(song({ swing: 0.5, masterGainDb: -6 }));
    expect(compiled.secondsPerStep).toBe(0.25);
    expect(compiled.lengthSteps).toBe(16);
    expect(compiled.lengthSeconds).toBe(4);
    const swung = compiled.notes.find((note) => note.step === 3)!;
    expect(swung.startSeconds).toBeCloseTo(3 * 0.25 + 0.125);
    expect(swung.velocity).toBe(0.8);
    expect(compiled.notes.find((note) => note.step === 8)!.velocity).toBe(0.5);
    expect(compiled.channels[0]!.level).toBeCloseTo(0.501, 2);
    expect(compiled.channels[1]!.pan).toBe(PATCHES.bells.pan);
    expect(compiled.notes.map((note) => note.startSeconds)).toEqual([...compiled.notes.map((note) => note.startSeconds)].sort((a, b) => a - b));
  });

  it('applies additive channel overrides without mutating the closed patch set', () => {
    const compiled = compileSong(song({
      channels: [{ patch: 'bass', vol: 1, patterns: ['A'], pan: -0.4, sends: { reverb: 0.5 }, instrument: { amp: { release: 2 }, filter: { cutoffHz: 400 } } }],
    }));
    const channel = compiled.channels[0]!;
    expect(channel.pan).toBe(-0.4);
    expect(channel.sends).toEqual({ ...PATCHES.bass.sends, reverb: 0.5 });
    expect(channel.instrument.amp).toEqual({ ...PATCHES.bass.amp, release: 2 });
    expect(channel.instrument.filter.cutoffHz).toBe(400);
    expect(PATCHES.bass.amp.release).not.toBe(2);
    expect(mergeInstrument(PATCHES.flute, undefined)).toBe(PATCHES.flute);
  });

  it('humanises deterministically and within the patch limits', () => {
    expect(humanizeUnit(1, 2, 3)).toBe(humanizeUnit(1, 2, 3));
    expect(humanizeUnit(1, 2, 3)).not.toBe(humanizeUnit(1, 2, 4));
    const compiled = compileSong(song({ humanize: 1 }));
    for (const note of compiled.notes) {
      for (const pass of [0, 1, 2]) {
        const human = humanizeNote(compiled, note, pass);
        const limits = compiled.channels[note.channel]!.instrument.humanize;
        expect(Math.abs(human.offsetSeconds)).toBeLessThanOrEqual(limits.timingMs / 1000);
        expect(human).toEqual(humanizeNote(compiled, note, pass));
        expect(human.velocity).toBeGreaterThan(0);
        expect(human.velocity).toBeLessThanOrEqual(1);
      }
    }
    const tight = compileSong(song({ humanize: 0 }));
    expect(humanizeNote(tight, tight.notes[0]!, 0)).toEqual({ offsetSeconds: 0, velocity: tight.notes[0]!.velocity });
  });

  it('keeps every shipped song valid, in range, and on the closed patch set', () => {
    const songs = loadSongs();
    expect(songs.map((entry) => entry.name)).toEqual(expect.arrayContaining(['theme_night', 'theme_spring', 'theme_title']));
    for (const source of songs) {
      const compiled = compileSong(source);
      const kind = (source as SongSource & { kind?: string }).kind ?? 'theme';
      // Themes and pieces are sparse, listenable passes; stingers are short flourishes.
      if (kind === 'sting') expect(compiled.lengthSeconds).toBeLessThan(12);
      else expect(compiled.lengthSeconds).toBeGreaterThan(kind === 'combat' ? 15 : 40);
      expect(compiled.notes.length).toBeGreaterThan(kind === 'sting' ? 3 : 20);
      // No sustained drone: nothing but occasional string swells holds past two bars.
      for (const note of compiled.notes) {
        if (source.channels[note.channel]!.patch !== 'strings') expect(note.durationSeconds).toBeLessThan(8);
      }
      for (const channel of source.channels) expect(Object.keys(PATCHES)).toContain(channel.patch);
      for (const note of compiled.notes) {
        expect(note.midi).toBeGreaterThanOrEqual(noteMidi('C2'));
        expect(note.midi).toBeLessThanOrEqual(noteMidi('C7'));
        expect(note.step + note.lengthSteps).toBeLessThanOrEqual(compiled.lengthSteps);
      }
    }
  });
});

describe('look-ahead sequencer', () => {
  it('schedules each note exactly once, ahead of time, on the audio clock', () => {
    const host = new FakeHost();
    const sequencer = new Sequencer(host, 1, 250);
    const compiled = compileSong(song());
    sequencer.start(compiled, { at: 0.1, loop: false });
    expect(host.voices.map((voice) => voice.note.step)).toEqual([0, 3]);
    host.advance(1);
    expect(host.voices.map((voice) => voice.note.step)).toEqual([0, 3]);
    host.advance(0.25);
    expect(host.voices.map((voice) => voice.note.step)).toEqual([0, 3, 8]);
    for (const voice of host.voices) expect(voice.start).toBeCloseTo(0.1 + voice.note.startSeconds);
    host.advance(5);
    expect(host.voices.map((voice) => voice.note.step)).toEqual([0, 3, 8, 12]);
    expect(host.voices.every((voice) => !voice.resumed)).toBe(true);
  });

  it('ends a one-pass song once and releases its timer', () => {
    const host = new FakeHost();
    let ended = 0;
    const sequencer = new Sequencer(host, 1, 250);
    sequencer.start(compileSong(song()), { at: 0, loop: false, onEnded: () => { ended += 1; } });
    expect(sequencer.remainingSeconds()).toBe(4);
    host.advance(3.5);
    expect(ended).toBe(0);
    host.advance(1);
    expect(ended).toBe(1);
    expect(sequencer.playing).toBe(false);
    expect(host.timerCount).toBe(0);
    host.advance(10);
    expect(ended).toBe(1);
    expect(host.voices).toHaveLength(4);
  });

  it('loops seamlessly and reports a wrapped position', () => {
    const host = new FakeHost();
    const sequencer = new Sequencer(host, 1.5, 250);
    sequencer.start(compileSong(song()), { at: 0, loop: true });
    host.advance(12);
    const starts = host.voices.filter((voice) => voice.note.step === 0).map((voice) => voice.start);
    expect(starts.slice(0, 3)).toEqual([0, 4, 8]);
    expect(sequencer.remainingSeconds()).toBe(Number.POSITIVE_INFINITY);
    host.time = 13;
    expect(sequencer.positionSteps()).toBeCloseTo(4);
    const counts = new Map<string, number>();
    for (const voice of host.voices) counts.set(`${voice.note.step}@${Math.round(voice.start)}`, (counts.get(`${voice.note.step}@${Math.round(voice.start)}`) ?? 0) + 1);
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  });

  it('resumes from a saved step, re-entering sustained notes but not percussive ones', () => {
    const host = new FakeHost();
    host.time = 10;
    const sequencer = new Sequencer(host, 1, 250);
    // Step 4 is inside the bass note that started on step 0 and after the bell on step 3.
    sequencer.start(compileSong(song()), { at: 10, fromStep: 4, loop: false });
    const resumed = host.voices.filter((voice) => voice.resumed);
    expect(resumed).toHaveLength(1);
    expect(resumed[0]!.note.step).toBe(0);
    expect(resumed[0]!.start).toBe(10);
    expect(resumed[0]!.duration).toBeCloseTo(1);
    expect(host.voices.some((voice) => voice.note.step === 3)).toBe(false);
    host.advance(1);
    const next = host.voices.find((voice) => voice.note.step === 8)!;
    expect(next.start).toBeCloseTo(11);
    expect(sequencer.positionSteps(11)).toBeCloseTo(8);
    expect(sequencer.remainingSeconds(11)).toBeCloseTo(2);
  });

  it('stops scheduling immediately when stopped', () => {
    const host = new FakeHost();
    const sequencer = new Sequencer(host, 1, 250);
    sequencer.start(compileSong(song()), { at: 0, loop: true });
    const scheduled = host.voices.length;
    sequencer.stop();
    host.advance(20);
    expect(host.voices).toHaveLength(scheduled);
    expect(host.timerCount).toBe(0);
    expect(sequencer.positionSteps()).toBe(0);
  });

  it('never starts a humanised note before the requested start time', () => {
    const host = new FakeHost();
    const sequencer = new Sequencer(host, 2, 250);
    const compiled = compileSong(song({ humanize: 1 }));
    sequencer.start(compiled, { at: 0.1, loop: true });
    host.advance(9);
    expect(Math.min(...host.voices.map((voice) => voice.start))).toBeGreaterThanOrEqual(0.1);
  });
});
