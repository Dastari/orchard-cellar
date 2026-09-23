import { dayProgressAtClockTime, type Season } from '@orchard/sim';
import { MusicMixer, type MusicDeck } from './music-synth.js';
import { compileSong, Sequencer, type CompiledSong } from './sequencer.js';
import { playSynthSfx } from './sfx.js';
import type { AmbienceTime, SfxSource, SongSource } from './types.js';

const AUDIO_SETTINGS_KEY = 'orchard-cellar.audio';
const MUSIC_PLAYBACK_KEY = 'orchard-cellar.music-playback';
const AMBIENCE_NAMES = ['bird_chirp_1', 'bird_chirp_2', 'bird_chirp_3', 'wind_gust'] as const;
const MUSIC_CROSSFADE_SECONDS = 8;
const MUSIC_FIRST_FADE_SECONDS = 2.5;
const MUSIC_END_FADE_SECONDS = 8;
const MUSIC_NAVIGATION_FADE_SECONDS = 0.65;
const MUSIC_STOP_FADE_SECONDS = 1;
const MUSIC_START_LATENCY_SECONDS = 0.1;
const SONG_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

export interface MusicCueDefinition {
  /** Loop the tracker song forever (title) or play one pass then fall silent (world). */
  readonly continuous: boolean;
  /** Randomised quiet interval between passes of a non-continuous cue. */
  readonly silenceSeconds: readonly [number, number];
}

/** Runtime cues. Each name is a tracker song at `packages/assets/music/<name>.song.json`. */
export const MUSIC_CUES = {
  theme_title: { continuous: true, silenceSeconds: [0, 0] },
  theme_spring: { continuous: false, silenceSeconds: [55, 140] },
  theme_night: { continuous: false, silenceSeconds: [40, 105] },
} as const satisfies Readonly<Record<string, MusicCueDefinition>>;

/** Cue behaviour for any song name; unlisted songs (Studio auditions) loop continuously. */
export function musicCueFor(name: string): MusicCueDefinition {
  return (MUSIC_CUES as Readonly<Record<string, MusicCueDefinition>>)[name] ?? { continuous: true, silenceSeconds: [0, 0] };
}

export function songUrl(name: string): string {
  if (!SONG_NAME_PATTERN.test(name)) throw new Error(`Invalid song name ${name}`);
  return `/generated/music/${name}.song.json`;
}

/**
 * Version 2 checkpoints record the tracker position in steps (tempo-independent).
 * Version 1 checkpoints came from the retired streamed recordings; their positions
 * are seconds into an MP3 and are deliberately ignored.
 */
export interface PersistedMusicPlayback {
  readonly version: 2;
  readonly song: string;
  readonly phase: 'playing' | 'gap';
  readonly positionSteps: number;
  readonly gapRemainingSeconds: number;
}

export function parsePersistedMusicPlayback(value: string | null): PersistedMusicPlayback | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedMusicPlayback> | null;
    if (parsed === null || typeof parsed !== 'object' || parsed.version !== 2
      || typeof parsed.song !== 'string' || !(parsed.song in MUSIC_CUES)
      || (parsed.phase !== 'playing' && parsed.phase !== 'gap')
      || typeof parsed.positionSteps !== 'number' || !Number.isFinite(parsed.positionSteps)
      || parsed.positionSteps < 0
      || typeof parsed.gapRemainingSeconds !== 'number' || !Number.isFinite(parsed.gapRemainingSeconds)
      || parsed.gapRemainingSeconds < 0) return null;
    return {
      version: 2,
      song: parsed.song,
      phase: parsed.phase,
      positionSteps: parsed.positionSteps,
      gapRemainingSeconds: parsed.gapRemainingSeconds,
    };
  } catch {
    return null;
  }
}

function loadMusicPlayback(): PersistedMusicPlayback | null {
  try {
    return parsePersistedMusicPlayback(localStorage.getItem(MUSIC_PLAYBACK_KEY));
  } catch {
    return null;
  }
}

/** One tracker song playing on its own deck (so two can cross-fade). */
class SongPlayback {
  readonly deck: MusicDeck;
  readonly sequencer: Sequencer;

  constructor(
    private readonly context: AudioContext,
    mixer: MusicMixer,
    readonly song: string,
    compiled: CompiledSong,
  ) {
    this.deck = mixer.createDeck(compiled);
    this.sequencer = new Sequencer({
      currentTime: () => context.currentTime,
      playVoice: (voice) => this.deck.playVoice(voice),
      setInterval: (callback, milliseconds) => window.setInterval(callback, milliseconds),
      clearInterval: (handle) => window.clearInterval(handle as number),
    });
  }

  start(fromStep: number, fadeSeconds: number, onEnded: () => void): void {
    const cue = musicCueFor(this.song);
    const at = this.context.currentTime + MUSIC_START_LATENCY_SECONDS;
    this.deck.fadeTo(1, fadeSeconds, at, 0);
    this.sequencer.start(this.deck.song, { at, fromStep, loop: cue.continuous, onEnded });
    if (!cue.continuous) {
      const remaining = this.sequencer.remainingSeconds(at);
      const fadeStart = Math.max(at + fadeSeconds, at + remaining - MUSIC_END_FADE_SECONDS);
      this.deck.fadeTo(0, Math.max(0.05, at + remaining - fadeStart), fadeStart, 1);
    }
  }

  positionSteps(): number { return this.sequencer.positionSteps(); }

  fadeOut(seconds: number): void { this.deck.fadeTo(0, seconds); }

  dispose(): void {
    this.sequencer.stop();
    this.deck.dispose();
  }
}

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
  fadeOutForNavigation(): Promise<void>;
  stop(): void;
  getStatus(): AudioStatus;
  getSettings(): AudioSettings;
  setVolume(bus: AudioVolumeBus, value: number): void;
  setBackgroundPlayback(bus: AudioBackgroundBus, enabled: boolean): void;
}

export type AudioVolumeBus = 'master' | 'music' | 'sfx';
export type AudioBackgroundBus = 'music' | 'sounds';

export interface AudioSettings {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly musicInBackground: boolean;
  readonly soundsInBackground: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.7,
  sfx: 0.35,
  musicInBackground: false,
  soundsInBackground: false,
};

function loadSettings(): AudioSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) ?? '') as Partial<AudioSettings>;
    return {
      master: typeof parsed.master === 'number' ? parsed.master : DEFAULT_AUDIO_SETTINGS.master,
      music: typeof parsed.music === 'number' ? parsed.music : DEFAULT_AUDIO_SETTINGS.music,
      sfx: typeof parsed.sfx === 'number' ? parsed.sfx : DEFAULT_AUDIO_SETTINGS.sfx,
      musicInBackground: typeof parsed.musicInBackground === 'boolean'
        ? parsed.musicInBackground : DEFAULT_AUDIO_SETTINGS.musicInBackground,
      soundsInBackground: typeof parsed.soundsInBackground === 'boolean'
        ? parsed.soundsInBackground : DEFAULT_AUDIO_SETTINGS.soundsInBackground,
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
  if (progress < dayProgressAtClockTime(8)) return 'dawn';
  if (progress < dayProgressAtClockTime(19)) return 'day';
  if (progress < dayProgressAtClockTime(21)) return 'dusk';
  if (progress < dayProgressAtClockTime(4)) return 'night';
  return 'dawn';
}

export function isAmbienceEligible(source: SfxSource, context: AmbienceContext): boolean {
  if (source.bus !== 'ambience' || context.location !== 'estate') return false;
  const timeMatches = source.schedule?.time?.includes(context.time) ?? true;
  const seasonMatches = source.schedule?.season?.includes(context.season) ?? true;
  return timeMatches && seasonMatches;
}

export function songForAmbience(context: AmbienceContext): string {
  if (context.location === 'cellar') return 'theme_spring';
  if (context.time === 'dusk' || context.time === 'night') return 'theme_night';
  return 'theme_spring';
}

export class AudioBus implements GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambience: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mixer: MusicMixer | null = null;
  private activePlayback: SongPlayback | null = null;
  private readonly retiringPlaybacks = new Set<SongPlayback>();
  private readonly songCache = new Map<string, Promise<CompiledSong>>();
  private desiredSong: string | null = null;
  private persistedPlayback = loadMusicPlayback();
  private musicInitialized = false;
  private musicInitialization: Promise<void> | null = null;
  private musicGapTimer: number | null = null;
  private musicGapEndsAtMs: number | null = null;
  private backgroundMusicGap: { readonly song: string; readonly remainingSeconds: number } | null = null;
  private pausedMusic: { readonly song: string; readonly positionSteps: number } | null = null;
  private musicChangeDeferredForBackground = false;
  private contextSuspendedForBackground = false;
  private backgroundSuspendPromise: Promise<void> | null = null;
  private musicCheckpointTimer: number | null = null;
  private musicTransitionGeneration = 0;
  private song: string | null = null;
  private ambienceContext: AmbienceContext = { season: 'spring', time: 'dawn', location: 'estate' };
  private ambienceTimer: number | null = null;
  private readonly sfxCache = new Map<string, Promise<SfxSource>>();
  private settings = loadSettings();

  constructor(private readonly ambienceEnabled = true) {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
  }

  async unlock(): Promise<void> {
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state !== 'running') await this.context.resume();
    if (!this.musicInitialized) {
      this.musicInitialization ??= this.initializeMusic();
      try {
        await this.musicInitialization;
      } finally {
        this.musicInitialization = null;
      }
    } else {
      await this.playSong(this.desiredSong ?? songForAmbience(this.ambienceContext));
    }
    if (this.ambienceEnabled) this.startAmbience();
  }

  async setSeason(season: Season): Promise<void> {
    this.ambienceContext = { ...this.ambienceContext, season };
    await this.playSong(songForAmbience(this.ambienceContext));
  }

  setAmbienceContext(season: Season, dayProgress: number, location: 'estate' | 'cellar'): void {
    const time = ambienceTimeAtProgress(dayProgress);
    if (season === this.ambienceContext.season
      && time === this.ambienceContext.time
      && location === this.ambienceContext.location) return;
    const next = { season, time, location } as const;
    this.ambienceContext = next;
    void this.playSong(songForAmbience(next)).catch(() => undefined);
  }

  async playSong(name: string): Promise<void> {
    songUrl(name);
    if (this.desiredSong === name && (this.song === name || this.musicGapTimer !== null)) return;
    this.desiredSong = name;
    if (!this.context || !this.mixer || !this.musicInitialized) return;
    if (document.hidden && !this.settings.musicInBackground) {
      this.musicChangeDeferredForBackground = true;
      return;
    }
    await this.transitionToSong(name);
  }

  async playSfx(name: string): Promise<void> {
    if (document.hidden && !this.settings.soundsInBackground) return;
    if (!this.context || !this.sfx || !this.reverb || this.context.state !== 'running') return;
    const source = await this.loadSfx(name);
    if (document.hidden && !this.settings.soundsInBackground) return;
    const output = source.bus === 'ambience' && this.ambience ? this.ambience : this.sfx;
    playSynthSfx(this.context, output, this.reverb, source);
  }

  async playFootstep(surface: 'grass' | 'path' | 'cellar'): Promise<void> {
    await this.playSfx(`footstep_${surface}`);
  }

  async fadeOutForNavigation(): Promise<void> {
    this.saveMusicPlayback();
    if (!this.context || this.activePlayback === null) return;
    for (const playback of [this.activePlayback, ...this.retiringPlaybacks]) playback.fadeOut(MUSIC_NAVIGATION_FADE_SECONDS);
    await new Promise<void>((resolve) => window.setTimeout(resolve, MUSIC_NAVIGATION_FADE_SECONDS * 1000));
    this.saveMusicPlayback();
  }

  stop(): void {
    this.musicTransitionGeneration += 1;
    this.clearMusicGap();
    this.persistedPlayback = null;
    this.pausedMusic = null;
    this.backgroundMusicGap = null;
    try { localStorage.removeItem(MUSIC_PLAYBACK_KEY); } catch { /* Storage can be disabled. */ }
    if (this.activePlayback) this.retirePlayback(this.activePlayback, MUSIC_STOP_FADE_SECONDS);
    this.activePlayback = null;
    this.desiredSong = null;
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

  getSettings(): AudioSettings { return { ...this.settings }; }

  setVolume(bus: AudioVolumeBus, value: number): void {
    const next = Math.max(0, Math.min(1, value));
    this.settings = { ...this.settings, [bus]: next };
    try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* Storage can be disabled. */ }
    if (bus === 'master' && this.master) this.master.gain.value = next;
    if (bus === 'music' && this.music) this.music.gain.value = next;
    if (bus === 'sfx') {
      if (this.sfx) this.sfx.gain.value = next;
      if (this.ambience) this.ambience.gain.value = next * 0.42;
    }
  }

  setBackgroundPlayback(bus: AudioBackgroundBus, enabled: boolean): void {
    const setting = bus === 'music' ? 'musicInBackground' : 'soundsInBackground';
    this.settings = { ...this.settings, [setting]: enabled };
    try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* Storage can be disabled. */ }
    if (document.hidden) this.applyBackgroundPlaybackPolicy();
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
    this.mixer = new MusicMixer(context, music);
    this.musicCheckpointTimer = window.setInterval(() => this.saveMusicPlayback(), 1_000);
  }

  private loadSong(name: string): Promise<CompiledSong> {
    let promise = this.songCache.get(name);
    if (!promise) {
      promise = loadJson<SongSource>(songUrl(name)).then(compileSong);
      promise.catch(() => this.songCache.delete(name));
      this.songCache.set(name, promise);
    }
    return promise;
  }

  private async initializeMusic(): Promise<void> {
    const requested = this.desiredSong ?? songForAmbience(this.ambienceContext);
    this.desiredSong = requested;
    const restored = this.persistedPlayback;
    if (restored !== null && restored.phase === 'gap' && restored.song === requested) {
      this.scheduleMusicGap(restored.song, restored.gapRemainingSeconds);
    } else if (restored !== null && restored.phase === 'playing') {
      this.desiredSong = restored.song;
      await this.transitionToSong(restored.song, restored.positionSteps);
      const destination = this.desiredSong === restored.song ? requested : this.desiredSong;
      this.desiredSong = destination;
      if (destination !== restored.song) await this.transitionToSong(destination);
    } else {
      await this.transitionToSong(requested);
    }
    this.persistedPlayback = null;
    this.musicInitialized = true;
    this.saveMusicPlayback();
  }

  private async transitionToSong(song: string, positionSteps = 0, fadeOverride?: number): Promise<void> {
    if (!this.context || !this.mixer) return;
    this.clearMusicGap();
    this.pausedMusic = null;
    const generation = ++this.musicTransitionGeneration;
    const compiled = await this.loadSong(song);
    if (generation !== this.musicTransitionGeneration || !this.context || !this.mixer) return;
    const previous = this.activePlayback;
    const fadeSeconds = fadeOverride ?? (previous === null ? MUSIC_FIRST_FADE_SECONDS : MUSIC_CROSSFADE_SECONDS);
    const playback = new SongPlayback(this.context, this.mixer, song, compiled);
    this.activePlayback = playback;
    this.song = song;
    if (previous !== null) this.retirePlayback(previous, fadeSeconds);
    playback.start(positionSteps, fadeSeconds, () => this.onMusicEnded(playback));
    this.saveMusicPlayback();
  }

  /** Fade a deck out and release its voices once silent. */
  private retirePlayback(playback: SongPlayback, fadeSeconds: number): void {
    playback.fadeOut(fadeSeconds);
    this.retiringPlaybacks.add(playback);
    window.setTimeout(() => {
      this.retiringPlaybacks.delete(playback);
      playback.dispose();
    }, fadeSeconds * 1000 + 100);
  }

  private onMusicEnded(playback: SongPlayback): void {
    if (this.activePlayback !== playback) return;
    const song = playback.song;
    this.activePlayback = null;
    this.song = null;
    this.retirePlayback(playback, 0.05);
    if (song !== this.desiredSong) return;
    const [minimum, maximum] = musicCueFor(song).silenceSeconds;
    const delaySeconds = minimum + Math.random() * (maximum - minimum);
    this.scheduleMusicGap(song, delaySeconds);
  }

  private scheduleMusicGap(song: string, delaySeconds: number): void {
    this.clearMusicGap();
    this.song = null;
    this.desiredSong = song;
    this.musicGapEndsAtMs = performance.now() + delaySeconds * 1000;
    this.musicGapTimer = window.setTimeout(() => {
      this.musicGapTimer = null;
      this.musicGapEndsAtMs = null;
      if (this.desiredSong === song) void this.transitionToSong(song).catch(() => undefined);
    }, delaySeconds * 1000);
    this.saveMusicPlayback();
  }

  private clearMusicGap(): void {
    if (this.musicGapTimer === null) return;
    window.clearTimeout(this.musicGapTimer);
    this.musicGapTimer = null;
    this.musicGapEndsAtMs = null;
  }

  private saveMusicPlayback(): void {
    const song = this.desiredSong;
    if (song === null || !(song in MUSIC_CUES)) return;
    let playback: PersistedMusicPlayback;
    if (this.musicGapTimer !== null || this.backgroundMusicGap !== null) {
      const backgroundGap = this.backgroundMusicGap;
      playback = {
        version: 2,
        song,
        phase: 'gap',
        positionSteps: 0,
        gapRemainingSeconds: backgroundGap?.remainingSeconds
          ?? Math.max(0, ((this.musicGapEndsAtMs ?? performance.now()) - performance.now()) / 1000),
      };
    } else {
      const active = this.activePlayback;
      const paused = this.pausedMusic;
      const positionSteps = paused?.song === song ? paused.positionSteps
        : active?.song === song ? active.positionSteps() : 0;
      playback = { version: 2, song, phase: 'playing', positionSteps, gapRemainingSeconds: 0 };
    }
    try { localStorage.setItem(MUSIC_PLAYBACK_KEY, JSON.stringify(playback)); } catch { /* Storage can be disabled. */ }
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
    if (document.hidden) {
      this.saveMusicPlayback();
      this.applyBackgroundPlaybackPolicy();
      return;
    }
    void this.restoreForegroundPlayback();
  };

  private applyBackgroundPlaybackPolicy(): void {
    if (!this.context) return;
    if (!this.settings.musicInBackground) this.pauseMusicForBackground();
    if (!this.settings.soundsInBackground) this.setSoundBusGains(0);
    if (!this.settings.musicInBackground && !this.settings.soundsInBackground
      && this.context.state === 'running') {
      this.contextSuspendedForBackground = true;
      this.backgroundSuspendPromise = this.context.suspend().catch(() => undefined);
    }
  }

  private pauseMusicForBackground(): void {
    if (this.musicGapTimer !== null && this.desiredSong !== null) {
      this.backgroundMusicGap = {
        song: this.desiredSong,
        remainingSeconds: Math.max(0, ((this.musicGapEndsAtMs ?? performance.now()) - performance.now()) / 1000),
      };
      window.clearTimeout(this.musicGapTimer);
      this.musicGapTimer = null;
      this.musicGapEndsAtMs = null;
    }
    const active = this.activePlayback;
    if (active !== null) {
      // Tracker playback has no media element to pause: remember the position,
      // silence the deck, and re-enter from the same step when visible again.
      this.pausedMusic = { song: active.song, positionSteps: active.positionSteps() };
      this.musicTransitionGeneration += 1;
      this.activePlayback = null;
      active.dispose();
    }
    for (const playback of this.retiringPlaybacks) playback.dispose();
    this.retiringPlaybacks.clear();
  }

  private async restoreForegroundPlayback(): Promise<void> {
    if (!this.context) return;
    const shouldFadeMaster = this.contextSuspendedForBackground;
    if (this.backgroundSuspendPromise !== null) await this.backgroundSuspendPromise;
    this.backgroundSuspendPromise = null;
    if (this.contextSuspendedForBackground && this.context.state !== 'running') await this.context.resume();
    this.contextSuspendedForBackground = false;
    this.setSoundBusGains(this.settings.sfx);
    if (shouldFadeMaster && this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(0.0001, now);
      this.master.gain.linearRampToValueAtTime(this.settings.master, now + 1);
    }
    const paused = this.pausedMusic;
    if (this.musicChangeDeferredForBackground && this.desiredSong !== null) {
      this.musicChangeDeferredForBackground = false;
      this.backgroundMusicGap = null;
      this.pausedMusic = null;
      await this.transitionToSong(this.desiredSong);
      return;
    }
    const pausedGap = this.backgroundMusicGap;
    this.backgroundMusicGap = null;
    if (pausedGap !== null) {
      this.scheduleMusicGap(pausedGap.song, pausedGap.remainingSeconds);
      return;
    }
    try {
      if (paused !== null) {
        await this.transitionToSong(paused.song, paused.positionSteps, 1);
      } else if (this.musicInitialized && this.desiredSong !== null && this.activePlayback === null
        && this.musicGapTimer === null && !this.settings.musicInBackground) {
        // A cue that was still loading when the tab was hidden was cancelled; start it now.
        await this.transitionToSong(this.desiredSong, 0, 1);
      }
    } catch { /* A later unlock gesture retries playback. */ }
  }

  private setSoundBusGains(sfxGain: number): void {
    if (this.sfx) this.sfx.gain.value = sfxGain;
    if (this.ambience) this.ambience.gain.value = sfxGain * 0.42;
  }

  private readonly onPageHide = (): void => { this.saveMusicPlayback(); };
}

export class NullAudioBus implements GameAudio {
  async unlock(): Promise<void> {}
  async setSeason(): Promise<void> {}
  setAmbienceContext(): void {}
  async playSong(): Promise<void> {}
  async playSfx(): Promise<void> {}
  async playFootstep(): Promise<void> {}
  async fadeOutForNavigation(): Promise<void> {}
  stop(): void {}
  getStatus(): AudioStatus { return { unlocked: false, state: 'unavailable', song: null, meter: 0, ambience: { season: 'spring', time: 'dawn', location: 'estate' } }; }
  getSettings(): AudioSettings { return DEFAULT_AUDIO_SETTINGS; }
  setVolume(): void {}
  setBackgroundPlayback(): void {}
}
