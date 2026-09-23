import { dayProgressAtClockTime, type Season } from '@orchard/sim';
import {
  DEFAULT_MUSIC_CONTEXT,
  MusicDirector,
  type AudioAssignment,
  type MusicCommand,
  type MusicContext,
} from './music-director.js';
import { MusicMixer, type MusicDeck } from './music-synth.js';
import { compileSong, Sequencer, type CompiledSong } from './sequencer.js';
import { playSynthSfx } from './sfx.js';
import type { AmbienceTime, SfxSource, SongSource } from './types.js';

const AUDIO_SETTINGS_KEY = 'orchard-cellar.audio';
const MUSIC_PLAYBACK_KEY = 'orchard-cellar.music-playback';
const AUDIO_ASSIGNMENT_URL = '/generated/music/audio-assignment.json';
const AMBIENCE_NAMES = ['bird_chirp_1', 'bird_chirp_2', 'bird_chirp_3', 'wind_gust'] as const;
const MUSIC_FIRST_FADE_SECONDS = 2.5;
const MUSIC_NAVIGATION_FADE_SECONDS = 0.65;
const MUSIC_STOP_FADE_SECONDS = 1;
const MUSIC_TAIL_SECONDS = 4;
const MUSIC_START_LATENCY_SECONDS = 0.1;
const MUSIC_DIRECTOR_TICK_MS = 1_000;
const SONG_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

export function songUrl(name: string): string {
  if (!SONG_NAME_PATTERN.test(name)) throw new Error(`Invalid song name ${name}`);
  return `/generated/music/${name}.song.json`;
}

/**
 * Version 2 checkpoints record the director rule, the tracker position in steps
 * (tempo-independent) or the remaining silence. Version 1 checkpoints came from the
 * retired streamed recordings; their positions are seconds into an MP3 and are
 * deliberately ignored.
 */
export interface PersistedMusicPlayback {
  readonly version: 2;
  /** Playing song; empty while in a silence gap. */
  readonly song: string;
  readonly phase: 'playing' | 'gap';
  readonly positionSteps: number;
  readonly gapRemainingSeconds: number;
  /** Director rule the checkpoint belongs to. */
  readonly rule?: string;
}

export function parsePersistedMusicPlayback(value: string | null): PersistedMusicPlayback | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedMusicPlayback> | null;
    if (parsed === null || typeof parsed !== 'object' || parsed.version !== 2
      || (parsed.phase !== 'playing' && parsed.phase !== 'gap')
      || typeof parsed.song !== 'string'
      || !(SONG_NAME_PATTERN.test(parsed.song) || (parsed.phase === 'gap' && parsed.song === ''))
      || typeof parsed.positionSteps !== 'number' || !Number.isFinite(parsed.positionSteps)
      || parsed.positionSteps < 0
      || typeof parsed.gapRemainingSeconds !== 'number' || !Number.isFinite(parsed.gapRemainingSeconds)
      || parsed.gapRemainingSeconds < 0
      || (parsed.rule !== undefined && (typeof parsed.rule !== 'string' || !SONG_NAME_PATTERN.test(parsed.rule)))) return null;
    return {
      version: 2,
      song: parsed.song,
      phase: parsed.phase,
      positionSteps: parsed.positionSteps,
      gapRemainingSeconds: parsed.gapRemainingSeconds,
      ...(parsed.rule === undefined ? {} : { rule: parsed.rule }),
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
    readonly loop: boolean,
    readonly rule: string | null,
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
    const at = this.context.currentTime + MUSIC_START_LATENCY_SECONDS;
    this.deck.fadeTo(1, fadeSeconds, at, 0);
    this.sequencer.start(this.deck.song, { at, fromStep, loop: this.loop, onEnded });
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
  /** Director rule currently in charge, or null for manual auditions. */
  readonly rule: string | null;
  readonly meter: number;
  readonly ambience: AmbienceContext;
}

export interface AmbienceContext {
  readonly season: Season;
  readonly time: AmbienceTime;
  readonly location: 'estate' | 'cellar';
}

/** Context fields the game can update; see MusicContext in music-director.ts. */
export type MusicContextUpdate = Partial<MusicContext>;

export interface GameAudio {
  unlock(): Promise<void>;
  setSeason(season: Season): Promise<void>;
  setAmbienceContext(season: Season, dayProgress: number, location: 'estate' | 'cellar'): void;
  /** Feed the music director (scene, zone, biome, weather, combat, mood tags). */
  setMusicContext(update: MusicContextUpdate): void;
  /** Audition one song directly, bypassing the director (Studio). */
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

function sameMusicContext(left: MusicContext, right: MusicContext): boolean {
  return left.scene === right.scene && left.season === right.season && left.time === right.time
    && left.zone === right.zone && left.biome === right.biome && left.weather === right.weather
    && left.combat === right.combat && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => right.tags[index] === tag);
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
  private assignment: Promise<AudioAssignment> | null = null;
  private director: MusicDirector | null = null;
  private directorStart: Promise<void> | null = null;
  private directorTimer: number | null = null;
  private musicContext: MusicContext = DEFAULT_MUSIC_CONTEXT;
  private musicContextSet = false;
  private manualSong: string | null = null;
  private persistedPlayback = loadMusicPlayback();
  /** Music clock excludes time spent paused in the background, so silences keep their length. */
  private pausedAtMs: number | null = null;
  private pausedTotalMs = 0;
  private pausedMusic: { readonly song: string; readonly positionSteps: number; readonly loop: boolean; readonly rule: string | null } | null = null;
  private contextSuspendedForBackground = false;
  private backgroundSuspendPromise: Promise<void> | null = null;
  private musicCheckpointTimer: number | null = null;
  private musicTransitionGeneration = 0;
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
    await this.startMusic();
    if (this.ambienceEnabled) this.startAmbience();
  }

  async setSeason(season: Season): Promise<void> {
    this.ambienceContext = { ...this.ambienceContext, season };
    this.setMusicContext({ season });
  }

  setAmbienceContext(season: Season, dayProgress: number, location: 'estate' | 'cellar'): void {
    const time = ambienceTimeAtProgress(dayProgress);
    if (season !== this.ambienceContext.season || time !== this.ambienceContext.time
      || location !== this.ambienceContext.location) this.ambienceContext = { season, time, location };
    this.setMusicContext({ season, time });
  }

  setMusicContext(update: MusicContextUpdate): void {
    const next: MusicContext = { ...this.musicContext, ...update };
    const firstContext = !this.musicContextSet;
    const changed = !sameMusicContext(next, this.musicContext);
    if (!changed && !firstContext) return;
    this.musicContext = next;
    this.musicContextSet = true;
    if (firstContext) {
      // The director owns music from the first context onward (auditions end here).
      this.manualSong = null;
      void this.startMusic().catch(() => undefined);
      return;
    }
    this.runDirector();
  }

  async playSong(name: string): Promise<void> {
    songUrl(name);
    if (this.manualSong === name && this.activePlayback?.song === name) return;
    this.manualSong = name;
    if (!this.context || !this.mixer) return;
    const compiled = await this.loadSong(name);
    if (this.manualSong !== name) return;
    await this.transitionToSong(name, 0, this.activePlayback === null ? MUSIC_FIRST_FADE_SECONDS : 2, compiled.source.loop !== false, null);
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
    this.persistedPlayback = null;
    this.pausedMusic = null;
    this.manualSong = null;
    this.director = null;
    this.directorStart = null;
    this.musicContextSet = false;
    if (this.directorTimer !== null) window.clearInterval(this.directorTimer);
    this.directorTimer = null;
    try { localStorage.removeItem(MUSIC_PLAYBACK_KEY); } catch { /* Storage can be disabled. */ }
    if (this.activePlayback) this.retirePlayback(this.activePlayback, MUSIC_STOP_FADE_SECONDS);
    this.activePlayback = null;
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
      song: this.activePlayback?.song ?? null,
      rule: this.manualSong === null ? this.director?.state(this.musicNow()).rule ?? null : null,
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

  private musicNow(): number {
    const now = performance.now();
    const paused = this.pausedAtMs === null ? 0 : now - this.pausedAtMs;
    return (now - this.pausedTotalMs - paused) / 1000;
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

  private loadAssignment(): Promise<AudioAssignment> {
    if (this.assignment === null) {
      this.assignment = loadJson<AudioAssignment>(AUDIO_ASSIGNMENT_URL);
      this.assignment.catch(() => { this.assignment = null; });
    }
    return this.assignment;
  }

  /** Start whatever owns the music: a manual audition, or the director once a context exists. */
  private async startMusic(): Promise<void> {
    if (!this.context || !this.mixer) return;
    if (this.manualSong !== null) {
      const song = this.manualSong;
      this.manualSong = null;
      await this.playSong(song);
      return;
    }
    if (!this.musicContextSet) return;
    if (this.director !== null) { this.runDirector(); return; }
    this.directorStart ??= this.startDirector().finally(() => { this.directorStart = null; });
    await this.directorStart;
  }

  private async startDirector(): Promise<void> {
    const assignment = await this.loadAssignment();
    if (this.director !== null || !this.context || this.manualSong !== null || !this.musicContextSet) return;
    const director = new MusicDirector(assignment);
    this.director = director;
    const restored = this.persistedPlayback;
    this.persistedPlayback = null;
    const now = this.musicNow();
    if (restored !== null && restored.rule !== undefined) {
      director.restore({
        rule: restored.rule,
        phase: restored.phase,
        song: restored.phase === 'playing' ? restored.song : null,
        gapRemainingSeconds: restored.gapRemainingSeconds,
      }, now);
      const state = director.state(now);
      if (state.phase === 'playing' && state.song !== null) {
        try {
          await this.transitionToSong(state.song, restored.positionSteps, MUSIC_FIRST_FADE_SECONDS, director.loops(state.rule), state.rule);
        } catch { /* The director picks something else below. */ }
      }
    }
    this.runDirector();
    this.directorTimer ??= window.setInterval(() => this.runDirector(), MUSIC_DIRECTOR_TICK_MS);
    this.saveMusicPlayback();
  }

  private runDirector(): void {
    if (this.director === null || this.manualSong !== null || this.pausedAtMs !== null || !this.context) return;
    this.execute(this.director.update(this.musicContext, this.musicNow()));
  }

  private execute(commands: readonly MusicCommand[]): void {
    for (const command of commands) {
      if (command.type === 'play') {
        void this.transitionToSong(command.song, 0, command.fadeSeconds, command.loop, command.rule).catch(() => undefined);
      } else if (command.type === 'stop') {
        this.musicTransitionGeneration += 1;
        if (this.activePlayback) this.retirePlayback(this.activePlayback, command.fadeSeconds);
        this.activePlayback = null;
      } else {
        void this.playSting(command.song).catch(() => undefined);
      }
    }
    if (commands.length > 0) this.saveMusicPlayback();
  }

  private async playSting(song: string): Promise<void> {
    if (!this.context || !this.mixer) return;
    const compiled = await this.loadSong(song);
    if (!this.context || !this.mixer) return;
    const sting = new SongPlayback(this.context, this.mixer, song, compiled, false, null);
    sting.start(0, 0.02, () => this.retirePlayback(sting, MUSIC_TAIL_SECONDS));
    this.retiringPlaybacks.add(sting);
  }

  private async transitionToSong(song: string, positionSteps: number, fadeSeconds: number, loop: boolean, rule: string | null): Promise<void> {
    if (!this.context || !this.mixer) return;
    this.pausedMusic = null;
    const generation = ++this.musicTransitionGeneration;
    const compiled = await this.loadSong(song);
    if (generation !== this.musicTransitionGeneration || !this.context || !this.mixer) return;
    const previous = this.activePlayback;
    const playback = new SongPlayback(this.context, this.mixer, song, compiled, loop, rule);
    this.activePlayback = playback;
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
    this.activePlayback = null;
    // Let the last notes and reverb ring out naturally.
    this.retirePlayback(playback, MUSIC_TAIL_SECONDS);
    if (playback.rule !== null) this.director?.pieceEnded(this.musicNow());
    this.saveMusicPlayback();
  }

  private saveMusicPlayback(): void {
    if (this.director === null || this.manualSong !== null) return;
    const now = this.musicNow();
    const state = this.director.state(now);
    if (state.rule === null || state.phase === 'idle') return;
    const paused = this.pausedMusic;
    const active = this.activePlayback;
    let playback: PersistedMusicPlayback;
    if (state.phase === 'playing' && state.song !== null) {
      const positionSteps = paused?.song === state.song ? paused.positionSteps
        : active?.song === state.song ? active.positionSteps() : 0;
      playback = { version: 2, song: state.song, phase: 'playing', positionSteps, gapRemainingSeconds: 0, rule: state.rule };
    } else {
      playback = { version: 2, song: '', phase: 'gap', positionSteps: 0, gapRemainingSeconds: state.gapRemainingSeconds, rule: state.rule };
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
    if (this.pausedAtMs !== null) return;
    this.pausedAtMs = performance.now();
    const active = this.activePlayback;
    if (active !== null) {
      // Tracker playback has no media element to pause: remember the position,
      // silence the deck, and re-enter from the same step when visible again.
      this.pausedMusic = { song: active.song, positionSteps: active.positionSteps(), loop: active.loop, rule: active.rule };
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
    if (this.pausedAtMs !== null) {
      this.pausedTotalMs += performance.now() - this.pausedAtMs;
      this.pausedAtMs = null;
    }
    const paused = this.pausedMusic;
    try {
      if (paused !== null) await this.transitionToSong(paused.song, paused.positionSteps, 1, paused.loop, paused.rule);
    } catch { /* A later unlock gesture retries playback. */ }
    // Context changes while hidden (e.g. night fell) are applied now.
    this.runDirector();
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
  setMusicContext(): void {}
  async playSong(): Promise<void> {}
  async playSfx(): Promise<void> {}
  async playFootstep(): Promise<void> {}
  async fadeOutForNavigation(): Promise<void> {}
  stop(): void {}
  getStatus(): AudioStatus { return { unlocked: false, state: 'unavailable', song: null, rule: null, meter: 0, ambience: { season: 'spring', time: 'dawn', location: 'estate' } }; }
  getSettings(): AudioSettings { return DEFAULT_AUDIO_SETTINGS; }
  setVolume(): void {}
  setBackgroundPlayback(): void {}
}
