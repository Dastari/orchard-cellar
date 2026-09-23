import type { CompiledChannel, CompiledSong, ScheduledVoice } from './sequencer.js';
import type { Instrument } from './types.js';

/**
 * Web Audio rendering for tracker songs: a shared effects mixer (hall reverb,
 * stereo chorus, ping-pong echo, gentle glue compression) and per-song decks whose
 * channel strips host the note voices. Everything is deterministic — noise and
 * impulse responses come from seeded generators — and built from native nodes so
 * the per-note CPU cost stays small on phones and iPads.
 */

const MIDDLE_C_HZ = 261.63;
const DEFAULT_REVERB_RETURN = 0.9;
const DEFAULT_DELAY_BEATS = 0.75;
const DEFAULT_DELAY_FEEDBACK = 0.32;

function seededNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x80000000 - 1;
  };
}

/** Algorithmic stereo hall: early reflections, then decorrelated noise whose highs decay faster than lows. */
export function createReverbImpulse(context: BaseAudioContext, seconds = 2.8, seed = 0x0c3a11a): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = context.createBuffer(2, length, rate);
  const preDelay = Math.floor(rate * 0.018);
  const early = [[0.007, 0.5], [0.011, 0.42], [0.017, 0.36], [0.023, 0.3], [0.031, 0.24], [0.041, 0.18]] as const;
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel);
    const random = seededNoise(seed + channel * 0x9e3779b9);
    let smoothed = 0;
    for (let index = preDelay; index < length; index += 1) {
      const t = (index - preDelay) / rate;
      const progress = t / seconds;
      // One-pole low-pass whose smoothing grows with time: bright onset, dark tail.
      const damping = 0.15 + 0.8 * Math.min(1, progress * 1.4);
      smoothed += (1 - damping) * (random() - smoothed);
      const fadeIn = Math.min(1, t / 0.03);
      samples[index] = smoothed * Math.exp(-6.9 * progress) * fadeIn;
    }
    for (const [time, gain] of early) {
      const offset = Math.floor(rate * (time + (channel === 0 ? 0 : 0.0023)));
      if (offset < length) samples[offset] = (samples[offset] ?? 0) + gain * (channel === 0 ? 1 : -1);
    }
  }
  return buffer;
}

export function createNoiseBuffer(context: BaseAudioContext, seconds = 2, seed = 0x5eed): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const random = seededNoise(seed);
  for (let index = 0; index < length; index += 1) samples[index] = random();
  return buffer;
}

export interface MusicMixerInputs {
  readonly dry: AudioNode;
  readonly reverb: AudioNode;
  readonly chorus: AudioNode;
  readonly delay: AudioNode;
}

export class MusicMixer {
  readonly inputs: MusicMixerInputs;
  readonly noise: AudioBuffer;
  private readonly reverbReturn: GainNode;
  private readonly delayLeft: DelayNode;
  private readonly delayRight: DelayNode;
  private readonly delayFeedback: GainNode;
  private readonly modulators: OscillatorNode[] = [];

  constructor(readonly context: BaseAudioContext, destination: AudioNode) {
    const bus = context.createGain();
    const dry = context.createGain();
    dry.connect(bus);

    const reverbIn = context.createGain();
    const convolver = context.createConvolver();
    convolver.buffer = createReverbImpulse(context);
    this.reverbReturn = context.createGain();
    this.reverbReturn.gain.value = DEFAULT_REVERB_RETURN;
    reverbIn.connect(convolver).connect(this.reverbReturn).connect(bus);

    // Two short modulated delays panned apart: classic ensemble chorus.
    const chorusIn = context.createGain();
    const chorusReturn = context.createGain();
    chorusReturn.gain.value = 0.7;
    for (const [base, rate, depth, pan] of [[0.012, 0.23, 0.0025, -1], [0.019, 0.31, 0.003, 1]] as const) {
      const delay = context.createDelay(0.05);
      delay.delayTime.value = base;
      const lfo = context.createOscillator();
      lfo.frequency.value = rate;
      const lfoDepth = context.createGain();
      lfoDepth.gain.value = depth;
      lfo.connect(lfoDepth).connect(delay.delayTime);
      lfo.start();
      this.modulators.push(lfo);
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      chorusIn.connect(delay).connect(panner).connect(chorusReturn);
    }
    chorusReturn.connect(bus);

    // Ping-pong echo with a darkening feedback path; a little of it lands in the hall.
    const delayIn = context.createGain();
    const delayHighpass = context.createBiquadFilter();
    delayHighpass.type = 'highpass';
    delayHighpass.frequency.value = 280;
    this.delayLeft = context.createDelay(4);
    this.delayRight = context.createDelay(4);
    this.delayFeedback = context.createGain();
    this.delayFeedback.gain.value = DEFAULT_DELAY_FEEDBACK;
    const feedbackTone = context.createBiquadFilter();
    feedbackTone.type = 'lowpass';
    feedbackTone.frequency.value = 2600;
    const leftPan = context.createStereoPanner();
    leftPan.pan.value = -0.65;
    const rightPan = context.createStereoPanner();
    rightPan.pan.value = 0.65;
    const delayReturn = context.createGain();
    delayReturn.gain.value = 0.55;
    delayIn.connect(delayHighpass).connect(this.delayLeft);
    this.delayLeft.connect(leftPan).connect(delayReturn);
    this.delayLeft.connect(this.delayRight);
    this.delayRight.connect(rightPan).connect(delayReturn);
    this.delayRight.connect(this.delayFeedback).connect(feedbackTone).connect(this.delayLeft);
    delayReturn.connect(bus);
    const echoSpace = context.createGain();
    echoSpace.gain.value = 0.3;
    delayReturn.connect(echoSpace).connect(reverbIn);

    // Tame saw fizz, then glue the mix with slow, gentle compression.
    const air = context.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 7500;
    air.gain.value = -3;
    // Clear sub-rumble that only muddies small speakers.
    const rumble = context.createBiquadFilter();
    rumble.type = 'highpass';
    rumble.frequency.value = 45;
    rumble.Q.value = 0.6;
    const glue = context.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 14;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.025;
    glue.release.value = 0.3;
    const makeup = context.createGain();
    makeup.gain.value = 1.2;
    bus.connect(rumble).connect(air).connect(glue).connect(makeup).connect(destination);

    this.inputs = { dry, reverb: reverbIn, chorus: chorusIn, delay: delayIn };
    this.noise = createNoiseBuffer(context);
    this.configure(null);
  }

  /** Apply a song's tempo-synced echo and reverb level. */
  configure(song: CompiledSong | null): void {
    const fx = song?.source.fx;
    const beatSeconds = song ? 60 / song.source.bpm : 0.75;
    const delaySeconds = Math.min(3.9, beatSeconds * (fx?.delayBeats ?? DEFAULT_DELAY_BEATS));
    const now = this.context.currentTime;
    this.delayLeft.delayTime.setTargetAtTime(delaySeconds, now, 0.05);
    this.delayRight.delayTime.setTargetAtTime(delaySeconds, now, 0.05);
    this.delayFeedback.gain.setTargetAtTime(Math.max(0, Math.min(0.7, fx?.delayFeedback ?? DEFAULT_DELAY_FEEDBACK)), now, 0.05);
    this.reverbReturn.gain.setTargetAtTime(Math.max(0, Math.min(1.5, fx?.reverb ?? DEFAULT_REVERB_RETURN)), now, 0.05);
  }

  createDeck(song: CompiledSong): MusicDeck {
    this.configure(song);
    return new MusicDeck(this, song);
  }

  dispose(): void {
    for (const modulator of this.modulators) {
      try { modulator.stop(); } catch { /* Already stopped. */ }
    }
  }
}

interface ChannelStrip {
  readonly input: GainNode;
  readonly lfo: OscillatorNode | null;
}

/** One playing song: channel strips plus four identical fade gains (dry and each send). */
export class MusicDeck {
  private readonly fades: readonly GainNode[];
  private readonly strips: readonly ChannelStrip[];
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private disposed = false;

  constructor(private readonly mixer: MusicMixer, readonly song: CompiledSong) {
    const context = mixer.context;
    const { dry, reverb, chorus, delay } = mixer.inputs;
    const fades = [dry, reverb, chorus, delay].map((destination) => {
      const fade = context.createGain();
      fade.gain.value = 0;
      fade.connect(destination);
      return fade;
    });
    this.fades = fades;
    const [dryFade, reverbFade, chorusFade, delayFade] = fades as [GainNode, GainNode, GainNode, GainNode];
    this.strips = song.channels.map((channel) => {
      const input = context.createGain();
      input.gain.value = channel.level;
      const panner = context.createStereoPanner();
      panner.pan.value = channel.pan;
      input.connect(panner).connect(dryFade);
      for (const [amount, fade] of [[channel.sends.reverb, reverbFade], [channel.sends.chorus, chorusFade], [channel.sends.delay, delayFade]] as const) {
        if (amount <= 0) continue;
        const send = context.createGain();
        send.gain.value = amount;
        panner.connect(send).connect(fade);
      }
      let lfo: OscillatorNode | null = null;
      if (channel.instrument.vibrato) {
        lfo = context.createOscillator();
        lfo.frequency.value = channel.instrument.vibrato.rateHz;
        lfo.start();
      }
      return { input, lfo };
    });
  }

  /** Ramp the whole deck (dry and effect sends) to `value` over `seconds` starting at `at`. */
  fadeTo(value: number, seconds: number, at = this.mixer.context.currentTime, from?: number): void {
    for (const fade of this.fades) {
      fade.gain.cancelScheduledValues(at);
      fade.gain.setValueAtTime(from ?? fade.gain.value, at);
      fade.gain.linearRampToValueAtTime(value, at + Math.max(0.001, seconds));
    }
  }

  playVoice(voice: ScheduledVoice): void {
    if (this.disposed) return;
    const index = this.song.channels.indexOf(voice.channel);
    const strip = this.strips[index];
    if (!strip) return;
    playInstrumentVoice(this.mixer.context, this.mixer.noise, voice.channel, voice, strip, this.sources);
  }

  /** Stop every voice and release the deck's nodes. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Already ended. */ }
    }
    this.sources.clear();
    for (const strip of this.strips) {
      if (strip.lfo) { try { strip.lfo.stop(); } catch { /* Already stopped. */ } }
      strip.input.disconnect();
    }
    for (const fade of this.fades) fade.disconnect();
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Build and schedule one note voice. Exported for offline rendering and tests. */
export function playInstrumentVoice(
  context: BaseAudioContext,
  noise: AudioBuffer,
  channel: CompiledChannel,
  voice: ScheduledVoice,
  strip: { readonly input: AudioNode; readonly lfo: OscillatorNode | null },
  sources: Set<AudioScheduledSourceNode>,
): void {
  const instrument: Instrument = channel.instrument;
  const { amp, filter: filterSpec } = instrument;
  const start = voice.start;
  const frequency = voice.note.frequency;
  const velocity = clamp(voice.velocity, 0, 1);
  const peak = instrument.gain * (1 - instrument.velocity * (1 - velocity));
  const attack = voice.resumed ? Math.max(amp.attack, 0.3) : amp.attack;
  const heldUntil = start + (instrument.oneShot ? attack + amp.decay : Math.max(0.02, voice.duration));
  const attackEnd = Math.min(start + attack, heldUntil);
  const attackPeak = attack > 0 ? peak * Math.min(1, (attackEnd - start) / attack) : peak;
  const stopAt = heldUntil + amp.release * 1.6 + 0.05;

  const output = context.createGain();
  output.gain.setValueAtTime(0, start);
  output.gain.linearRampToValueAtTime(attackPeak, attackEnd);
  if (heldUntil > attackEnd) output.gain.setTargetAtTime(peak * amp.sustain, attackEnd, Math.max(0.001, amp.decay / 4));
  output.gain.setTargetAtTime(0, heldUntil, Math.max(0.001, amp.release / 4));
  output.connect(strip.input);

  const filter = context.createBiquadFilter();
  filter.type = filterSpec.type;
  filter.Q.value = filterSpec.q;
  const nyquistSafe = context.sampleRate * 0.45;
  const restingCutoff = clamp(
    filterSpec.cutoffHz * 2 ** (filterSpec.keyTrack * Math.log2(frequency / MIDDLE_C_HZ)) * 2 ** (-filterSpec.velocityOctaves * (1 - velocity)),
    40,
    nyquistSafe,
  );
  filter.frequency.setValueAtTime(clamp(restingCutoff * 2 ** filterSpec.envOctaves, 40, nyquistSafe), start);
  if (filterSpec.envOctaves !== 0) filter.frequency.setTargetAtTime(restingCutoff, start, Math.max(0.001, filterSpec.envDecay / 3));
  filter.connect(output);

  let vibrato: GainNode | null = null;
  if (instrument.vibrato && strip.lfo && !voice.resumed) {
    vibrato = context.createGain();
    const onset = start + instrument.vibrato.delay;
    vibrato.gain.setValueAtTime(0, start);
    vibrato.gain.setValueAtTime(0, onset);
    vibrato.gain.linearRampToValueAtTime(instrument.vibrato.depthCents, onset + 0.5);
    strip.lfo.connect(vibrato);
  }

  const layers = instrument.oscillators;
  const totalGain = layers.reduce((sum, layer) => sum + (layer.gain ?? 1), 0) || 1;
  const voiceSources: AudioScheduledSourceNode[] = [];
  for (const layer of layers) {
    const oscillator = context.createOscillator();
    oscillator.type = layer.wave;
    const layerFrequency = clamp(frequency * (layer.ratio ?? 1), 1, nyquistSafe);
    if (instrument.pitchDrop && !voice.resumed) {
      oscillator.frequency.setValueAtTime(clamp(layerFrequency * 2 ** (instrument.pitchDrop.cents / 1200), 1, nyquistSafe), start);
      oscillator.frequency.exponentialRampToValueAtTime(layerFrequency, start + Math.max(0.001, instrument.pitchDrop.seconds));
    } else {
      oscillator.frequency.setValueAtTime(layerFrequency, start);
    }
    oscillator.detune.value = layer.detuneCents ?? 0;
    if (vibrato) vibrato.connect(oscillator.detune);
    const gain = context.createGain();
    const level = (layer.gain ?? 1) / totalGain;
    gain.gain.setValueAtTime(level, start);
    if (layer.decay !== undefined) gain.gain.setTargetAtTime(0, start, Math.max(0.001, layer.decay / 4));
    oscillator.connect(gain);
    if (layer.pan !== undefined && layer.pan !== 0) {
      const panner = context.createStereoPanner();
      panner.pan.value = clamp(layer.pan, -1, 1);
      gain.connect(panner).connect(filter);
    } else {
      gain.connect(filter);
    }
    oscillator.start(start);
    voiceSources.push(oscillator);
  }

  if (instrument.noise && instrument.noise.gain > 0) {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = clamp(instrument.noise.filterHz, 40, nyquistSafe);
    band.Q.value = instrument.noise.q;
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(instrument.noise.gain, start);
    if (instrument.noise.decay > 0) noiseGain.gain.setTargetAtTime(0, start, instrument.noise.decay / 4);
    source.connect(band).connect(noiseGain).connect(filter);
    // Deterministic read offset so repeated notes do not share an identical noise grain.
    const offset = ((voice.note.step * 0.137 + voice.note.midi * 0.071) % 1) * Math.max(0, noise.duration - 0.5);
    source.start(start, offset);
    voiceSources.push(source);
  }

  for (const source of voiceSources) {
    source.stop(stopAt);
    sources.add(source);
  }
  const last = voiceSources[0];
  if (!last) return;
  last.addEventListener('ended', () => {
    for (const source of voiceSources) sources.delete(source);
    if (vibrato && strip.lfo) { try { strip.lfo.disconnect(vibrato); } catch { /* Already disconnected. */ } }
    output.disconnect();
  }, { once: true });
}
