import type { Season } from '@orchard/sim';

export type PatchName = 'flute' | 'pad' | 'pluck' | 'bass' | 'bells' | 'strings' | 'accordion' | 'woodblock' | 'shaker';
export type AmbienceTime = 'dawn' | 'day' | 'dusk' | 'night';

/** Oscillator waveforms available to instruments (custom PeriodicWaves are not authored). */
export type InstrumentWave = 'sine' | 'triangle' | 'sawtooth' | 'square';

/** One oscillator layer of an instrument voice. */
export interface InstrumentOscillator {
  readonly wave: InstrumentWave;
  /** Frequency multiple of the played note: 1 = unison, 2 = octave up, 2.76 = bell partial. */
  readonly ratio?: number;
  /** Fixed detune in cents; pairs of ±cents make a chorused, "analogue" layer. */
  readonly detuneCents?: number;
  /** Linear mix level of this layer before the voice filter (default 1). */
  readonly gain?: number;
  /** When set, this layer fades out on its own over `decay` seconds (bell/tine partials). */
  readonly decay?: number;
  /** Stereo position of this layer, -1 (left) … 1 (right); used to spread pads. */
  readonly pan?: number;
}

export interface InstrumentEnvelope {
  /** Seconds from silence to the velocity peak. */
  readonly attack: number;
  /** Time constant (seconds, roughly 95% settled) from peak to the sustain level. */
  readonly decay: number;
  /** Sustain level as a fraction of the peak (0 = percussive). */
  readonly sustain: number;
  /** Seconds for the note to die away after its length ends. */
  readonly release: number;
}

export interface InstrumentFilter {
  readonly type: 'lowpass' | 'bandpass' | 'highpass';
  /** Resting cutoff for a middle-C note at full velocity. */
  readonly cutoffHz: number;
  /** Resonance (Q). 0.5–1 is smooth; above 4 becomes whistly. */
  readonly q: number;
  /** Octaves the cutoff opens above `cutoffHz` at the note start (the "brightness pluck"). */
  readonly envOctaves: number;
  /** Time constant (seconds) for the filter envelope to settle back to `cutoffHz`. */
  readonly envDecay: number;
  /** 0 = fixed cutoff, 1 = cutoff follows pitch fully (keeps high notes as bright as low ones). */
  readonly keyTrack: number;
  /** Octaves the cutoff closes at velocity 0 (soft notes are darker, like real instruments). */
  readonly velocityOctaves: number;
}

export interface InstrumentNoise {
  /** Linear level of the filtered-noise layer (breath, rosin, rattle). */
  readonly gain: number;
  /** Band-pass centre frequency of the noise. */
  readonly filterHz: number;
  readonly q: number;
  /** Seconds for the noise burst to fade; 0 = follow the amplitude envelope (breathy sustain). */
  readonly decay: number;
}

export interface InstrumentVibrato {
  readonly rateHz: number;
  readonly depthCents: number;
  /** Seconds after note start before vibrato fades in (natural players wait before vibrating). */
  readonly delay: number;
}

export interface InstrumentSends {
  /** Level sent to the shared hall reverb. */
  readonly reverb: number;
  /** Level sent to the stereo chorus (width and shimmer). */
  readonly chorus: number;
  /** Level sent to the tempo-synced ping-pong echo. */
  readonly delay: number;
}

/** Complete synth definition for one patch. See docs/12-audio-design.md §2.2. */
export interface Instrument {
  readonly oscillators: readonly InstrumentOscillator[];
  readonly noise?: InstrumentNoise;
  readonly amp: InstrumentEnvelope;
  readonly filter: InstrumentFilter;
  readonly vibrato?: InstrumentVibrato;
  /** Pitch starts `cents` sharp and glides down to the note over `seconds` (woody thump, tine). */
  readonly pitchDrop?: { readonly cents: number; readonly seconds: number };
  /** 0 = every note equally loud, 1 = velocity fully scales loudness. */
  readonly velocity: number;
  /** Output trim so patches sit at comparable loudness at `vol` 1. */
  readonly gain: number;
  /** Default stereo position of the channel, -1 … 1. */
  readonly pan: number;
  readonly sends: InstrumentSends;
  /** Ignore authored note length; the voice ends after attack + decay + release (drums, plucks). */
  readonly oneShot?: boolean;
  /** Default random timing (±ms) and velocity (±fraction) humanisation for this patch. */
  readonly humanize: { readonly timingMs: number; readonly velocity: number };
}

/** Additive per-channel overrides: nested objects merge shallowly; `oscillators` replaces the list. */
export interface InstrumentOverrides {
  readonly oscillators?: readonly InstrumentOscillator[];
  readonly noise?: Partial<InstrumentNoise>;
  readonly amp?: Partial<InstrumentEnvelope>;
  readonly filter?: Partial<InstrumentFilter>;
  readonly vibrato?: Partial<InstrumentVibrato>;
  readonly pitchDrop?: { readonly cents: number; readonly seconds: number };
  readonly velocity?: number;
  readonly gain?: number;
  readonly pan?: number;
  readonly sends?: Partial<InstrumentSends>;
  readonly oneShot?: boolean;
  readonly humanize?: Partial<Instrument['humanize']>;
}

/** `[step, note, lengthInSteps, velocity?]`; velocity is 0–1 and defaults to 0.8. */
export type SongNote = readonly [step: number, note: string, length: number, velocity?: number];

export interface SongPattern {
  readonly steps: number;
  readonly notes: readonly SongNote[];
}

export interface SongChannel {
  readonly patch: PatchName;
  readonly vol: number;
  readonly patterns: readonly string[];
  /** Stereo position -1 … 1; defaults to the patch pan. */
  readonly pan?: number;
  /** Per-channel send levels; default to the patch sends. */
  readonly sends?: Partial<InstrumentSends>;
  /** Per-channel tweaks to the patch sound. */
  readonly instrument?: InstrumentOverrides;
}

/** Song-wide effect settings. All optional; defaults suit the calm-farm style. */
export interface SongFx {
  /** Reverb return level (default 0.9). */
  readonly reverb?: number;
  /** Echo time in beats (default 0.75 = dotted eighth). */
  readonly delayBeats?: number;
  /** Echo feedback 0–0.7 (default 0.32). */
  readonly delayFeedback?: number;
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
  readonly channels: readonly SongChannel[];
  readonly patterns: Readonly<Record<string, SongPattern>>;
  /** Multiplies every patch's humanisation (0 = machine-tight, default 1). */
  readonly humanize?: number;
  readonly fx?: SongFx;
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
