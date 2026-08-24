import type { Season } from '@orchard/sim';
import { Sequencer } from './sequencer.js';
import { playSynthSfx } from './sfx.js';
import type { AmbienceTime, SfxSource, SongSource } from './types.js';

const AUDIO_SETTINGS_KEY = 'orchard-cellar.audio';
const AMBIENCE_NAMES = ['bird_chirp_1', 'bird_chirp_2', 'bird_chirp_3', 'wind_gust'] as const;

export interface AudioStatus {
  readonly unlocked: boolean;
  readonly state: AudioContextState | 'unavailable';
  readonly song: string | null;
  readonly meter: number;
  readonly ambience: AmbienceContext;
}

export interface AmbienceContext {
  readonly season: Season;
  readonly time: AmbienceTime;
  readonly location: 'estate' | 'cellar';
}

export interface GameAudio {
  unlock(): Promise<void>;
  setSeason(season: Season): Promise<void>;
  setAmbienceContext(season: Season, dayProgress: number, location: 'estate' | 'cellar'): void;
  playSong(name: string): Promise<void>;
  playSfx(name: string): Promise<void>;
  playFootstep(surface: 'grass' | 'path' | 'cellar'): Promise<void>;
  stop(): void;
  getStatus(): AudioStatus;
}

interface AudioSettings { readonly master: number; readonly music: number; readonly sfx: number }
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { master: 0.8, music: 0.7, sfx: 0.35 };

function loadSettings(): AudioSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) ?? '') as Partial<AudioSettings>;
    return {
      master: typeof parsed.master === 'number' ? parsed.master : DEFAULT_AUDIO_SETTINGS.master,
      music: typeof parsed.music === 'number' ? parsed.music : DEFAULT_AUDIO_SETTINGS.music,
      sfx: typeof parsed.sfx === 'number' ? parsed.sfx : DEFAULT_AUDIO_SETTINGS.sfx,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load audio source ${url}: ${response.status}`);
  return await response.json() as T;
}

function createImpulse(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 1.2);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let seed = 0x0cce11a;
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[index] = (seed / 0xffffffff * 2 - 1) * (1 - index / length) ** 2;
    }
  }
  return buffer;
}

export function ambienceTimeAtProgress(progress: number): AmbienceTime {
  if (progress < 0.12) return 'dawn';
  if (progress < 0.65) return 'day';
  if (progress < 0.78) return 'dusk';
  return 'night';
}

export function isAmbienceEligible(source: SfxSource, context: AmbienceContext): boolean {
  if (source.bus !== 'ambience' || context.location !== 'estate') return false;
  const timeMatches = source.schedule?.time?.includes(context.time) ?? true;
  const seasonMatches = source.schedule?.season?.includes(context.season) ?? true;
  return timeMatches && seasonMatches;
}

export class AudioBus implements GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambience: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sequencer: Sequencer | null = null;
  private song: string | null = null;
  private ambienceContext: AmbienceContext = { season: 'spring', time: 'dawn', location: 'estate' };
  private ambienceTimer: number | null = null;
  private readonly sfxCache = new Map<string, Promise<SfxSource>>();
  private readonly settings = loadSettings();

  constructor(private readonly ambienceEnabled = true) {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  async unlock(): Promise<void> {
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state !== 'running') await this.context.resume();
    await this.setSeason(this.ambienceContext.season);
    if (this.ambienceEnabled) this.startAmbience();
  }

  async setSeason(season: Season): Promise<void> {
    this.ambienceContext = { ...this.ambienceContext, season };
    const name = season === 'spring' ? 'theme_spring' : 'theme_spring';
    await this.playSong(name);
  }

  setAmbienceContext(season: Season, dayProgress: number, location: 'estate' | 'cellar'): void {
    this.ambienceContext = { season, time: ambienceTimeAtProgress(dayProgress), location };
  }

  async playSong(name: string): Promise<void> {
    if (!this.context || !this.sequencer || !this.music) return;
    if (this.song === name) return;
    const source = await loadJson<SongSource>(`/generated/music/${name}.song.json`);
    const now = this.context.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.linearRampToValueAtTime(0.0001, now + 0.2);
    this.sequencer.play(source);
    this.music.gain.linearRampToValueAtTime(this.settings.music, now + 1);
    this.song = name;
  }

  async playSfx(name: string): Promise<void> {
    if (!this.context || !this.sfx || !this.reverb || this.context.state !== 'running') return;
    const source = await this.loadSfx(name);
    const output = source.bus === 'ambience' && this.ambience ? this.ambience : this.sfx;
    playSynthSfx(this.context, output, this.reverb, source);
  }

  async playFootstep(surface: 'grass' | 'path' | 'cellar'): Promise<void> {
    await this.playSfx(`footstep_${surface}`);
  }

  stop(): void {
    this.sequencer?.stop();
    this.song = null;
  }

  getStatus(): AudioStatus {
    let meter = 0;
    if (this.analyser) {
      const values = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(values);
      for (const value of values) meter = Math.max(meter, Math.abs(value - 128) / 128);
    }
    return {
      unlocked: this.context !== null,
      state: this.context?.state ?? 'unavailable',
      song: this.song,
      meter,
      ambience: this.ambienceContext,
    };
  }

  private createGraph(): void {
    if (typeof AudioContext === 'undefined') return;
    const context = new AudioContext();
    const master = context.createGain();
    const music = context.createGain();
    const sfx = context.createGain();
    const ambience = context.createGain();
    const reverb = context.createConvolver();
    const reverbGain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    const analyser = context.createAnalyser();
    master.gain.value = this.settings.master;
    music.gain.value = this.settings.music;
    sfx.gain.value = this.settings.sfx;
    ambience.gain.value = this.settings.sfx * 0.42;
    reverb.buffer = createImpulse(context);
    reverbGain.gain.value = 0.28;
    limiter.threshold.value = -6;
    limiter.knee.value = 8;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    music.connect(master);
    sfx.connect(master);
    ambience.connect(master);
    reverb.connect(reverbGain).connect(master);
    master.connect(limiter).connect(analyser).connect(context.destination);
    this.context = context;
    this.master = master;
    this.music = music;
    this.sfx = sfx;
    this.ambience = ambience;
    this.reverb = reverb;
    this.analyser = analyser;
    this.sequencer = new Sequencer(context, music, reverb);
  }

  private loadSfx(name: string): Promise<SfxSource> {
    let promise = this.sfxCache.get(name);
    if (!promise) {
      promise = loadJson<SfxSource>(`/generated/sfx/${name}.sfx.json`);
      this.sfxCache.set(name, promise);
    }
    return promise;
  }

  private startAmbience(): void {
    if (this.ambienceTimer !== null) return;
    const schedule = (): void => {
      void Promise.all(AMBIENCE_NAMES.map(async (name) => [name, await this.loadSfx(name)] as const)).then((sources) => {
        const eligible = sources.filter(([, source]) => isAmbienceEligible(source, this.ambienceContext));
        const choice = eligible[Math.floor(Math.random() * eligible.length)];
        const [name, source] = choice ?? ['wind_gust', null];
        if (source && Math.random() <= (source.schedule?.probability ?? 1)) void this.playSfx(name);
        const range = source?.schedule?.intervalSeconds ?? [3, 5];
        const delay = (range[0] + Math.random() * (range[1] - range[0])) * 1000;
        this.ambienceTimer = window.setTimeout(schedule, delay);
      });
    };
    this.ambienceTimer = window.setTimeout(schedule, 1200);
  }

  private readonly onVisibilityChange = (): void => {
    if (!this.context || !this.master) return;
    if (document.hidden) {
      void this.context.suspend();
      return;
    }
    void this.context.resume().then(() => {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      this.master.gain.setValueAtTime(0.0001, now);
      this.master.gain.linearRampToValueAtTime(this.settings.master, now + 1);
    });
  };
}

export class NullAudioBus implements GameAudio {
  async unlock(): Promise<void> {}
  async setSeason(): Promise<void> {}
  setAmbienceContext(): void {}
  async playSong(): Promise<void> {}
  async playSfx(): Promise<void> {}
  async playFootstep(): Promise<void> {}
  stop(): void {}
  getStatus(): AudioStatus { return { unlocked: false, state: 'unavailable', song: null, meter: 0, ambience: { season: 'spring', time: 'dawn', location: 'estate' } }; }
}
