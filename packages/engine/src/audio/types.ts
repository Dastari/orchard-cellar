import type { Season } from '@orchard/sim';

export type PatchName = 'flute' | 'pad' | 'pluck' | 'bass' | 'bells' | 'strings' | 'accordion' | 'woodblock' | 'shaker';
export type AmbienceTime = 'dawn' | 'day' | 'dusk' | 'night';

export interface SongPattern {
  readonly steps: number;
  readonly notes: readonly (readonly [step: number, note: string, length: number])[];
}

export interface SongSource {
  readonly name: string;
  readonly bpm: number;
  readonly swing: number;
  readonly stepsPerBeat: number;
  readonly beatsPerBar: number;
  readonly loopBars: number;
  readonly masterGainDb: number;
  readonly loop?: boolean;
  readonly channels: readonly {
    readonly patch: PatchName;
    readonly vol: number;
    readonly patterns: readonly string[];
  }[];
  readonly patterns: Readonly<Record<string, SongPattern>>;
}

export interface SfxSource {
  readonly name: string;
  readonly category: string;
  readonly bus: 'sfx' | 'ambience';
  readonly gainDb: number;
  readonly synth: {
    readonly wave: OscillatorType;
    readonly frequencyHz: number;
    readonly attackMs: number;
    readonly decayMs: number;
    readonly sustain: number;
    readonly releaseMs: number;
    readonly slideHzPerSecond: number;
    readonly noiseMix: number;
    readonly filter: { readonly type: BiquadFilterType; readonly frequencyHz: number; readonly q: number };
    readonly reverbSend: number;
  };
  readonly jitter: {
    readonly pitch: readonly [number, number];
    readonly decay: readonly [number, number];
    readonly gainDb: readonly [number, number];
  };
  readonly schedule?: {
    readonly intervalSeconds: readonly [number, number];
    readonly probability: number;
    readonly time?: readonly AmbienceTime[];
    readonly season?: readonly Season[];
  };
}
