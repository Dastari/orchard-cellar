import { describe, expect, it } from 'vitest';
import { createReverbImpulse, MusicMixer } from './music-synth.js';
import { PATCHES } from './patches.js';
import { compileSong, Sequencer } from './sequencer.js';
import type { PatchName, SongSource } from './types.js';

/**
 * Minimal strict stand-in for BaseAudioContext. It rejects the inputs real browsers
 * reject (non-finite values, negative times, exponential ramps to zero, zero time
 * constants) so the synth's automation is checked without a browser.
 */
class FakeParam {
  value: number;
  readonly events: { readonly type: string; readonly value: number; readonly time: number }[] = [];
  constructor(value = 0) { this.value = value; }
  private record(type: string, value: number, time: number, extra = 1): this {
    if (!Number.isFinite(value) || !Number.isFinite(time) || time < 0 || !Number.isFinite(extra)) throw new RangeError(`${type} ${value} @ ${time}`);
    this.events.push({ type, value, time });
    return this;
  }
  setValueAtTime(value: number, time: number): this { return this.record('set', value, time); }
  linearRampToValueAtTime(value: number, time: number): this { return this.record('linear', value, time); }
  exponentialRampToValueAtTime(value: number, time: number): this {
    if (value <= 0) throw new RangeError('exponential ramp to non-positive value');
    return this.record('exponential', value, time);
  }
  setTargetAtTime(value: number, time: number, constant: number): this {
    if (!(constant > 0)) throw new RangeError('time constant must be positive');
    return this.record('target', value, time, constant);
  }
  cancelScheduledValues(time: number): this { return this.record('cancel', 0, time); }
}

class FakeNode {
  readonly connections: unknown[] = [];
  connect<T>(target: T): T { this.connections.push(target); return target; }
  disconnect(): void { this.connections.length = 0; }
}

class FakeSource extends FakeNode {
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  private readonly listeners: (() => void)[] = [];
  constructor(readonly context: FakeContext) { super(); context.sources.push(this); }
  start(time = 0): void {
    if (this.startedAt !== null) throw new Error('InvalidStateError: started twice');
    if (!Number.isFinite(time) || time < 0) throw new RangeError('start time');
    this.startedAt = time;
  }
  stop(time = 0): void {
    if (this.startedAt === null) throw new Error('InvalidStateError: stop before start');
    this.stoppedAt = this.stoppedAt === null ? time : Math.min(this.stoppedAt, time);
  }
  addEventListener(_type: string, listener: () => void): void { this.listeners.push(listener); }
  end(): void { for (const listener of this.listeners.splice(0)) listener(); }
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
}

class FakeBuffer {
  readonly duration: number;
  private readonly channels: Float32Array[];
  constructor(channels: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
    this.duration = length / sampleRate;
  }
  getChannelData(index: number): Float32Array { return this.channels[index]!; }
}

class FakeContext {
  readonly sampleRate = 8_000;
  currentTime = 0;
  readonly sources: FakeSource[] = [];
  createGain() { return Object.assign(new FakeNode(), { gain: new FakeParam(1) }); }
  createOscillator() { return new FakeOscillator(this); }
  createBufferSource() { return new FakeBufferSource(this); }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1), gain: new FakeParam(0) }); }
  createStereoPanner() { return Object.assign(new FakeNode(), { pan: new FakeParam(0) }); }
  createDelay() { return Object.assign(new FakeNode(), { delayTime: new FakeParam(0) }); }
  createConvolver() { return Object.assign(new FakeNode(), { buffer: null as unknown }); }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam(),
    });
  }
  createBuffer(channels: number, length: number, sampleRate: number) { return new FakeBuffer(channels, length, sampleRate); }
}

function everyPatchSong(): SongSource {
  const patches = Object.keys(PATCHES) as PatchName[];
  return {
    name: 'patch_tour', bpm: 90, swing: 0.05, stepsPerBeat: 4, beatsPerBar: 4, loopBars: 2, masterGainDb: -6,
    channels: patches.map((patch) => ({ patch, vol: 0.5, patterns: ['P'] })),
    patterns: { P: { steps: 32, notes: [[0, 'C4', 4], [6, 'G4', 1, 0.3], [16, 'E5', 12, 1]] } },
  };
}

describe('music synth graph', () => {
  it('builds a deterministic stereo hall impulse', () => {
    const context = new FakeContext();
    const first = createReverbImpulse(context as unknown as BaseAudioContext, 1);
    const second = createReverbImpulse(context as unknown as BaseAudioContext, 1);
    expect(first.getChannelData(1)).toHaveLength(first.length);
    expect(Array.from(first.getChannelData(0).slice(0, 4000))).toEqual(Array.from(second.getChannelData(0).slice(0, 4000)));
    expect(first.getChannelData(0)).not.toEqual(first.getChannelData(1));
    const tail = first.getChannelData(0).slice(-400).reduce((sum, value) => sum + Math.abs(value), 0);
    const body = first.getChannelData(0).slice(800, 1200).reduce((sum, value) => sum + Math.abs(value), 0);
    expect(tail).toBeLessThan(body / 50);
  });

  it('schedules valid automation for every patch, velocity, and resume case', () => {
    const context = new FakeContext();
    const destination = context.createGain();
    const mixer = new MusicMixer(context as unknown as BaseAudioContext, destination as unknown as AudioNode);
    const compiled = compileSong(everyPatchSong());
    const deck = mixer.createDeck(compiled);
    deck.fadeTo(1, 2.5, 0.1, 0);
    const sequencer = new Sequencer({
      currentTime: () => context.currentTime,
      playVoice: (voice) => deck.playVoice(voice),
      setInterval: () => null,
      clearInterval: () => undefined,
    });
    sequencer.start(compiled, { at: 0.1, loop: false });
    sequencer.tick(compiled.lengthSeconds + 1);
    sequencer.start(compiled, { at: 6, fromStep: 20, loop: false });
    sequencer.tick(20);
    const voices = context.sources.filter((source) => source.startedAt !== null && source.startedAt >= 0.1);
    expect(voices.length).toBeGreaterThan(50);
    for (const source of voices) {
      expect(source.stoppedAt).not.toBeNull();
      expect(source.stoppedAt!).toBeGreaterThan(source.startedAt!);
      // Every voice releases within a few seconds; none sustains indefinitely.
      expect(source.stoppedAt! - source.startedAt!).toBeLessThan(8);
    }
  });

  it('stops every sounding voice when a deck is disposed', () => {
    const context = new FakeContext();
    const mixer = new MusicMixer(context as unknown as BaseAudioContext, context.createGain() as unknown as AudioNode);
    const compiled = compileSong(everyPatchSong());
    const deck = mixer.createDeck(compiled);
    const firstVoice = context.sources.length;
    const sequencer = new Sequencer({
      currentTime: () => 0, playVoice: (voice) => deck.playVoice(voice), setInterval: () => null, clearInterval: () => undefined,
    });
    sequencer.start(compiled, { at: 0.1, loop: true });
    const before = context.sources.length;
    deck.dispose();
    // Strip vibrato LFOs and every scheduled voice are stopped; the shared mixer keeps running.
    const deckSources = context.sources.slice(firstVoice - compiled.channels.filter((channel) => channel.instrument.vibrato).length, before);
    expect(before - firstVoice).toBeGreaterThan(10);
    expect(deckSources.every((source) => source.stoppedAt !== null)).toBe(true);
    deck.playVoice({ note: compiled.notes[0]!, channel: compiled.channels[0]!, start: 1, duration: 1, velocity: 1, resumed: false });
    expect(context.sources.length).toBe(before);
  });

  it('releases finished voices from the deck', () => {
    const context = new FakeContext();
    const mixer = new MusicMixer(context as unknown as BaseAudioContext, context.createGain() as unknown as AudioNode);
    const compiled = compileSong(everyPatchSong());
    const deck = mixer.createDeck(compiled);
    const note = compiled.notes[0]!;
    const before = context.sources.length;
    deck.playVoice({ note, channel: compiled.channels[note.channel]!, start: 0.2, duration: 0.5, velocity: 0.8, resumed: false });
    const created = context.sources.slice(before);
    expect(created.length).toBeGreaterThan(0);
    const scheduledStops = created.map((source) => source.stoppedAt);
    for (const source of created) source.end();
    context.currentTime = 0.3;
    deck.dispose();
    // Ended voices were forgotten, so dispose leaves their scheduled stop untouched.
    expect(created.map((source) => source.stoppedAt)).toEqual(scheduledStops);
  });
});
