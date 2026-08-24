import { decibelsToGain, PATCHES } from './patches.js';
import type { SongSource } from './types.js';

const NOTE_NAMES: Readonly<Record<string, number>> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export function noteFrequency(note: string): number {
  const match = /^([A-G](?:#|b)?)(-?\d)$/.exec(note);
  if (!match) throw new Error(`Invalid tracker note ${note}`);
  const semitone = NOTE_NAMES[match[1] ?? ''];
  if (semitone === undefined) throw new Error(`Invalid tracker note ${note}`);
  const midi = (Number(match[2]) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

export class Sequencer {
  private stopTimer: number | null = null;
  private readonly active = new Set<OscillatorNode>();

  constructor(
    private readonly context: AudioContext,
    private readonly dryOutput: AudioNode,
    private readonly reverbInput: AudioNode,
  ) {}

  play(song: SongSource): void {
    this.stop();
    const start = this.context.currentTime + 0.08;
    const duration = this.scheduleLoop(song, start);
    if (song.loop !== false) this.queueNext(song, start + duration, duration);
  }

  stop(): void {
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
    for (const source of this.active) {
      try { source.stop(); } catch { /* already ended */ }
    }
    this.active.clear();
  }

  private queueNext(song: SongSource, start: number, duration: number): void {
    const milliseconds = Math.max(20, (start - this.context.currentTime - 0.5) * 1000);
    this.stopTimer = window.setTimeout(() => {
      this.scheduleLoop(song, start);
      this.queueNext(song, start + duration, duration);
    }, milliseconds);
  }

  private scheduleLoop(song: SongSource, start: number): number {
    const secondsPerStep = 60 / song.bpm / song.stepsPerBeat;
    const songGain = decibelsToGain(song.masterGainDb);
    for (const channel of song.channels) {
      let patternOffset = 0;
      for (const patternName of channel.patterns) {
        const pattern = song.patterns[patternName];
        if (!pattern) throw new Error(`Song ${song.name} references missing pattern ${patternName}`);
        for (const [step, note, length] of pattern.notes) {
          const swing = step % 2 === 1 ? secondsPerStep * song.swing : 0;
          this.scheduleNote(channel.patch, note, start + (patternOffset + step) * secondsPerStep + swing, length * secondsPerStep, channel.vol * songGain);
        }
        patternOffset += pattern.steps;
      }
    }
    return song.loopBars * song.beatsPerBar * 60 / song.bpm;
  }

  private scheduleNote(patchName: keyof typeof PATCHES, note: string, start: number, duration: number, volume: number): void {
    const patch = PATCHES[patchName];
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const reverb = this.context.createGain();
    const frequency = noteFrequency(note);
    oscillator.type = patch.wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (patch.vibratoDepth > 0) {
      oscillator.frequency.setValueCurveAtTime(
        Float32Array.from({ length: 32 }, (_, index) => frequency + Math.sin(index / 31 * Math.PI * 2 * patch.vibratoHz) * patch.vibratoDepth),
        start,
        Math.max(0.05, duration),
      );
    }
    filter.type = 'lowpass';
    filter.frequency.value = patch.filterHz;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + patch.attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * patch.sustain), start + patch.attack + patch.decay);
    gain.gain.setValueAtTime(Math.max(0.0001, volume * patch.sustain), start + duration);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration + patch.release);
    reverb.gain.value = patch.reverbSend;
    oscillator.connect(filter).connect(gain);
    gain.connect(this.dryOutput);
    gain.connect(reverb).connect(this.reverbInput);
    oscillator.start(start);
    oscillator.stop(start + duration + patch.release + 0.05);
    this.active.add(oscillator);
    oscillator.addEventListener('ended', () => this.active.delete(oscillator), { once: true });
  }
}
