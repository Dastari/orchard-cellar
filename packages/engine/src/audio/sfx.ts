import { decibelsToGain } from './patches.js';
import type { SfxSource } from './types.js';

function randomBetween(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

export function playSynthSfx(
  context: AudioContext,
  output: AudioNode,
  reverbInput: AudioNode,
  source: SfxSource,
): void {
  const now = context.currentTime;
  const pitch = 1 + randomBetween(source.jitter.pitch);
  const decay = Math.max(0.01, source.synth.decayMs / 1000 * (1 + randomBetween(source.jitter.decay)));
  const release = source.synth.releaseMs / 1000;
  const duration = decay + release + 0.04;
  const level = decibelsToGain(source.gainDb + randomBetween(source.jitter.gainDb));
  const oscillator = context.createOscillator();
  const oscillatorGain = context.createGain();
  const noise = context.createBufferSource();
  const noiseGain = context.createGain();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const reverb = context.createGain();
  const frequency = source.synth.frequencyHz * pitch;

  oscillator.type = source.synth.wave;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.linearRampToValueAtTime(Math.max(20, frequency + source.synth.slideHzPerSecond * duration), now + duration);
  oscillatorGain.gain.value = 1 - source.synth.noiseMix;
  noiseGain.gain.value = source.synth.noiseMix;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  filter.type = source.synth.filter.type;
  filter.frequency.value = source.synth.filter.frequencyHz;
  filter.Q.value = source.synth.filter.q;
  const attackEnd = now + source.synth.attackMs / 1000;
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), attackEnd);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * Math.max(source.synth.sustain, 0.001)), attackEnd + decay);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  reverb.gain.value = source.synth.reverbSend;
  oscillator.connect(oscillatorGain).connect(filter);
  noise.connect(noiseGain).connect(filter);
  filter.connect(envelope);
  envelope.connect(output);
  envelope.connect(reverb).connect(reverbInput);
  oscillator.start(now);
  noise.start(now);
  oscillator.stop(now + duration);
  noise.stop(now + duration);
}
