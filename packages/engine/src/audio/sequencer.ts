import { decibelsToGain, mergeInstrument, PATCHES } from './patches.js';
import type { Instrument, InstrumentSends, SongSource } from './types.js';

const NOTE_NAMES: Readonly<Record<string, number>> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export const DEFAULT_NOTE_VELOCITY = 0.8;

export function noteMidi(note: string): number {
  const match = /^([A-G](?:#|b)?)(-?\d)$/.exec(note);
  if (!match) throw new Error(`Invalid tracker note ${note}`);
  const semitone = NOTE_NAMES[match[1] ?? ''];
  if (semitone === undefined) throw new Error(`Invalid tracker note ${note}`);
  return (Number(match[2]) + 1) * 12 + semitone;
}

export function noteFrequency(note: string): number {
  return 440 * 2 ** ((noteMidi(note) - 69) / 12);
}

/**
 * Deterministic hash → [-1, 1). Humanisation must not use Math.random so the same
 * song renders identically in the browser, in tests, and in offline renders.
 */
export function humanizeUnit(...values: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= Math.round(value * 1000) | 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x2c1b3c6d) >>> 0;
  }
  hash ^= hash >>> 12;
  return (hash >>> 0) / 0x80000000 - 1;
}

function nameSeed(name: string): number {
  let seed = 0;
  for (let index = 0; index < name.length; index += 1) seed = (Math.imul(seed, 31) + name.charCodeAt(index)) | 0;
  return seed;
}

export interface CompiledChannel {
  readonly instrument: Instrument;
  /** Channel `vol` × song master gain. */
  readonly level: number;
  readonly pan: number;
  readonly sends: InstrumentSends;
}

export interface CompiledNote {
  readonly channel: number;
  readonly step: number;
  readonly lengthSteps: number;
  readonly midi: number;
  readonly frequency: number;
  readonly velocity: number;
  /** Nominal start in seconds from the start of a pass, swing applied, before humanisation. */
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

export interface CompiledSong {
  readonly source: SongSource;
  readonly secondsPerStep: number;
  readonly lengthSteps: number;
  readonly lengthSeconds: number;
  readonly channels: readonly CompiledChannel[];
  /** Every note of one pass, sorted by nominal start time. */
  readonly notes: readonly CompiledNote[];
  readonly seed: number;
}

export function compileSong(song: SongSource): CompiledSong {
  const secondsPerStep = 60 / song.bpm / song.stepsPerBeat;
  const lengthSteps = song.loopBars * song.beatsPerBar * song.stepsPerBeat;
  const songGain = decibelsToGain(song.masterGainDb);
  const channels: CompiledChannel[] = [];
  const notes: CompiledNote[] = [];
  song.channels.forEach((channel, channelIndex) => {
    const base = PATCHES[channel.patch];
    if (!base) throw new Error(`Song ${song.name} uses unknown patch ${channel.patch}`);
    const instrument = mergeInstrument(base, channel.instrument);
    channels.push({
      instrument,
      level: channel.vol * songGain,
      pan: Math.max(-1, Math.min(1, channel.pan ?? instrument.pan)),
      sends: { ...instrument.sends, ...channel.sends },
    });
    let patternOffset = 0;
    for (const patternName of channel.patterns) {
      const pattern = song.patterns[patternName];
      if (!pattern) throw new Error(`Song ${song.name} references missing pattern ${patternName}`);
      for (const [step, note, length, velocity] of pattern.notes) {
        const absolute = patternOffset + step;
        if (absolute >= lengthSteps) continue;
        const swing = absolute % 2 === 1 ? secondsPerStep * song.swing : 0;
        const midi = noteMidi(note);
        notes.push({
          channel: channelIndex,
          step: absolute,
          lengthSteps: length,
          midi,
          frequency: 440 * 2 ** ((midi - 69) / 12),
          velocity: Math.max(0, Math.min(1, velocity ?? DEFAULT_NOTE_VELOCITY)),
          startSeconds: absolute * secondsPerStep + swing,
          durationSeconds: length * secondsPerStep,
        });
      }
      patternOffset += pattern.steps;
    }
  });
  notes.sort((left, right) => left.startSeconds - right.startSeconds || left.channel - right.channel || left.midi - right.midi);
  return {
    source: song,
    secondsPerStep,
    lengthSteps,
    lengthSeconds: lengthSteps * secondsPerStep,
    channels,
    notes,
    seed: nameSeed(song.name),
  };
}

/** Humanised timing offset (seconds) and velocity for one note on one pass. */
export function humanizeNote(song: CompiledSong, note: CompiledNote, pass: number): { offsetSeconds: number; velocity: number } {
  const amount = song.source.humanize ?? 1;
  const { timingMs, velocity } = song.channels[note.channel]!.instrument.humanize;
  const timing = humanizeUnit(song.seed, note.channel, note.step, note.midi, pass);
  const dynamics = humanizeUnit(song.seed ^ 0x5bd1e995, note.channel, note.step, note.midi, pass);
  return {
    offsetSeconds: timing * timingMs * amount / 1000,
    velocity: Math.max(0.05, Math.min(1, note.velocity * (1 + dynamics * velocity * amount))),
  };
}

export interface ScheduledVoice {
  readonly note: CompiledNote;
  readonly channel: CompiledChannel;
  /** Absolute audio-context time. */
  readonly start: number;
  readonly duration: number;
  readonly velocity: number;
  /** True for notes re-entered mid-way when resuming from a saved position. */
  readonly resumed: boolean;
}

export interface SequencerHost {
  currentTime(): number;
  playVoice(voice: ScheduledVoice): void;
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface SequencerStartOptions {
  /** Audio time at which playback starts. */
  readonly at: number;
  /** Song position (in steps) to start from. */
  readonly fromStep?: number;
  readonly loop: boolean;
  readonly onEnded?: () => void;
}

/** Shortest remaining tail worth re-entering when resuming mid-note. */
const RESUME_MINIMUM_SECONDS = 0.35;

/**
 * Look-ahead tracker scheduler. A coarse timer (default 250 ms) queues every note
 * starting within the next `lookaheadSeconds` onto the sample-accurate audio clock.
 * The generous look-ahead keeps playback seamless when a background tab throttles
 * timers to once per second.
 */
export class Sequencer {
  private song: CompiledSong | null = null;
  private origin = 0;
  private startAt = 0;
  private cursor = 0;
  private loop = false;
  private timer: unknown = null;
  private onEnded: (() => void) | null = null;
  private ended = false;

  constructor(
    private readonly host: SequencerHost,
    private readonly lookaheadSeconds = 1.5,
    private readonly tickMilliseconds = 250,
  ) {}

  get playing(): boolean { return this.song !== null && !this.ended; }
  get currentSong(): CompiledSong | null { return this.song; }

  start(song: CompiledSong, options: SequencerStartOptions): void {
    this.stop();
    const fromStep = Math.max(0, Math.min(song.lengthSteps, options.fromStep ?? 0));
    const fromSeconds = fromStep * song.secondsPerStep;
    this.song = song;
    this.loop = options.loop;
    this.startAt = options.at;
    this.origin = options.at - fromSeconds;
    this.cursor = options.at;
    this.onEnded = options.onEnded ?? null;
    this.ended = false;
    if (fromSeconds > 0) this.resumeSustainedNotes(fromSeconds);
    this.tick();
    if (!this.ended) this.timer = this.host.setInterval(() => this.tick(), this.tickMilliseconds);
  }

  stop(): void {
    if (this.timer !== null) this.host.clearInterval(this.timer);
    this.timer = null;
    this.song = null;
    this.onEnded = null;
    this.ended = false;
  }

  /** Song position in steps at audio time `at`; wraps when looping, clamps otherwise. */
  positionSteps(at = this.host.currentTime()): number {
    const song = this.song;
    if (!song) return 0;
    const elapsed = Math.max(0, at - this.origin) / song.secondsPerStep;
    return this.loop ? elapsed % song.lengthSteps : Math.min(song.lengthSteps, elapsed);
  }

  /** Seconds until a non-looping song ends (Infinity when looping or stopped). */
  remainingSeconds(at = this.host.currentTime()): number {
    const song = this.song;
    if (!song || this.loop) return Number.POSITIVE_INFINITY;
    return Math.max(0, this.origin + song.lengthSeconds - at);
  }

  /** Schedule every note up to `horizon` (defaults to now + look-ahead). Offline renders pass the song end. */
  tick(horizon = this.host.currentTime() + this.lookaheadSeconds): void {
    const song = this.song;
    if (!song || this.ended) return;
    const end = this.loop ? Number.POSITIVE_INFINITY : this.origin + song.lengthSeconds;
    const limit = Math.min(horizon, end);
    while (this.cursor < limit) {
      const pass = Math.max(0, Math.floor((this.cursor - this.origin) / song.lengthSeconds + 1e-9));
      const passStart = this.origin + pass * song.lengthSeconds;
      const windowEnd = Math.min(limit, passStart + song.lengthSeconds);
      for (const note of song.notes) {
        const nominal = passStart + note.startSeconds;
        if (nominal < this.cursor) continue;
        if (nominal >= windowEnd) break;
        if (nominal < this.startAt) continue;
        const human = humanizeNote(song, note, pass);
        this.host.playVoice({
          note,
          channel: song.channels[note.channel]!,
          start: Math.max(this.startAt, nominal + human.offsetSeconds),
          duration: note.durationSeconds,
          velocity: human.velocity,
          resumed: false,
        });
      }
      this.cursor = windowEnd;
    }
    if (this.host.currentTime() >= end) {
      this.ended = true;
      if (this.timer !== null) this.host.clearInterval(this.timer);
      this.timer = null;
      const callback = this.onEnded;
      this.onEnded = null;
      callback?.();
    }
  }

  private resumeSustainedNotes(fromSeconds: number): void {
    const song = this.song!;
    for (const note of song.notes) {
      if (note.startSeconds >= fromSeconds) break;
      if (song.channels[note.channel]!.instrument.oneShot) continue;
      const remaining = note.startSeconds + note.durationSeconds - fromSeconds;
      if (remaining < RESUME_MINIMUM_SECONDS) continue;
      this.host.playVoice({
        note,
        channel: song.channels[note.channel]!,
        start: this.startAt,
        duration: remaining,
        velocity: note.velocity,
        resumed: true,
      });
    }
  }
}
