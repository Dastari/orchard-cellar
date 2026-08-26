import { dayProgressAtClockTime, type Season } from '@orchard/sim';
import { playSynthSfx } from './sfx.js';
import type { AmbienceTime, SfxSource } from './types.js';

const AUDIO_SETTINGS_KEY = 'orchard-cellar.audio';
const MUSIC_PLAYBACK_KEY = 'orchard-cellar.music-playback';
const AMBIENCE_NAMES = ['bird_chirp_1', 'bird_chirp_2', 'bird_chirp_3', 'wind_gust'] as const;
const MUSIC_CROSSFADE_SECONDS = 8;
const MUSIC_END_FADE_SECONDS = 8;
const MUSIC_NAVIGATION_FADE_SECONDS = 0.65;

interface StreamedMusicDefinition {
  readonly url: string;
  readonly continuous: boolean;
  readonly silenceSeconds: readonly [number, number];
}

export const STREAMED_MUSIC = {
  theme_title: {
    url: '/music/orchard-title.mp3', continuous: true, silenceSeconds: [0, 0],
  },
  theme_spring: {
    url: '/music/orchard-day.mp3', continuous: false, silenceSeconds: [55, 140],
  },
  theme_night: {
    url: '/music/orchard-night.mp3', continuous: false, silenceSeconds: [40, 105],
  },
} as const satisfies Readonly<Record<string, StreamedMusicDefinition>>;

type StreamedSongName = keyof typeof STREAMED_MUSIC;

export interface PersistedMusicPlayback {
  readonly version: 1;
  readonly song: StreamedSongName;
  readonly phase: 'playing' | 'gap';
  readonly positionSeconds: number;
  readonly gapRemainingSeconds: number;
}

export function parsePersistedMusicPlayback(value: string | null): PersistedMusicPlayback | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedMusicPlayback>;
    if (parsed.version !== 1 || typeof parsed.song !== 'string' || !(parsed.song in STREAMED_MUSIC)
      || (parsed.phase !== 'playing' && parsed.phase !== 'gap')
      || typeof parsed.positionSeconds !== 'number' || !Number.isFinite(parsed.positionSeconds)
      || parsed.positionSeconds < 0
      || typeof parsed.gapRemainingSeconds !== 'number' || !Number.isFinite(parsed.gapRemainingSeconds)
      || parsed.gapRemainingSeconds < 0) return null;
    return parsed as PersistedMusicPlayback;
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

interface MusicDeck {
  readonly element: HTMLAudioElement;
  readonly gain: GainNode;
  song: StreamedSongName | null;
  endingFadeScheduled: boolean;
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
  private musicDecks: readonly [MusicDeck, MusicDeck] | null = null;
  private activeMusicDeck: 0 | 1 | null = null;
  private desiredSong: StreamedSongName | null = null;
  private persistedPlayback = loadMusicPlayback();
  private musicInitialized = false;
  private musicInitialization: Promise<void> | null = null;
  private musicGapTimer: number | null = null;
  private musicGapEndsAtMs: number | null = null;
  private backgroundMusicGap: { readonly song: StreamedSongName; readonly remainingSeconds: number } | null = null;
  private musicPausedForBackground = false;
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
    if (!(name in STREAMED_MUSIC)) throw new Error(`Unknown streamed song ${name}`);
    const song = name as StreamedSongName;
    if (this.desiredSong === song && (this.song === song || this.musicGapTimer !== null)) return;
    this.desiredSong = song;
    if (!this.context || !this.musicDecks || !this.musicInitialized) return;
    if (document.hidden && !this.settings.musicInBackground) {
      this.musicChangeDeferredForBackground = true;
      return;
    }
    await this.transitionToSong(song);
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
    if (!this.context || !this.musicDecks || this.activeMusicDeck === null) return;
    const now = this.context.currentTime;
    for (const deck of this.musicDecks) {
      if (deck.element.paused) continue;
      deck.gain.gain.cancelScheduledValues(now);
      deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
      deck.gain.gain.linearRampToValueAtTime(0, now + MUSIC_NAVIGATION_FADE_SECONDS);
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, MUSIC_NAVIGATION_FADE_SECONDS * 1000));
    this.saveMusicPlayback();
  }

  stop(): void {
    this.musicTransitionGeneration += 1;
    this.clearMusicGap();
    this.persistedPlayback = null;
    try { localStorage.removeItem(MUSIC_PLAYBACK_KEY); } catch { /* Storage can be disabled. */ }
    const generation = this.musicTransitionGeneration;
    const now = this.context?.currentTime ?? 0;
    for (const deck of this.musicDecks ?? []) {
      deck.gain.gain.cancelScheduledValues(now);
      deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
      deck.gain.gain.linearRampToValueAtTime(0, now + 1);
      window.setTimeout(() => {
        if (generation !== this.musicTransitionGeneration) return;
        deck.element.pause();
        deck.element.removeAttribute('src');
        deck.element.load();
        deck.song = null;
      }, 1_050);
    }
    this.activeMusicDeck = null;
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
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings));
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
    this.musicDecks = [this.createMusicDeck(context, music, 0), this.createMusicDeck(context, music, 1)];
    this.musicCheckpointTimer = window.setInterval(() => this.saveMusicPlayback(), 1_000);
  }

  private createMusicDeck(context: AudioContext, destination: AudioNode, index: 0 | 1): MusicDeck {
    const element = new Audio();
    element.preload = 'metadata';
    const gain = context.createGain();
    gain.gain.value = 0;
    context.createMediaElementSource(element).connect(gain).connect(destination);
    const deck: MusicDeck = { element, gain, song: null, endingFadeScheduled: false };
    element.addEventListener('ended', () => this.onMusicEnded(index));
    element.addEventListener('timeupdate', () => this.onMusicTimeUpdate(index));
    return deck;
  }

  private async initializeMusic(): Promise<void> {
    const requested = this.desiredSong ?? songForAmbience(this.ambienceContext) as StreamedSongName;
    this.desiredSong = requested;
    const restored = this.persistedPlayback;
    if (restored !== null && restored.phase === 'gap' && restored.song === requested) {
      this.scheduleMusicGap(restored.song, restored.gapRemainingSeconds);
    } else if (restored !== null && restored.phase === 'playing') {
      this.desiredSong = restored.song;
      await this.transitionToSong(restored.song, restored.positionSeconds);
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

  private async transitionToSong(song: StreamedSongName, positionSeconds = 0): Promise<void> {
    if (!this.context || !this.musicDecks) return;
    this.clearMusicGap();
    const generation = ++this.musicTransitionGeneration;
    const previousIndex = this.activeMusicDeck;
    const previous = previousIndex === null ? null : this.musicDecks[previousIndex];
    const reusePausedDeck = previous !== null && this.song === null && previous.song === song;
    const incomingIndex: 0 | 1 = reusePausedDeck ? previousIndex! : previousIndex === 0 ? 1 : 0;
    const incoming = this.musicDecks[incomingIndex];
    const definition = STREAMED_MUSIC[song];
    if (incoming.song !== song) {
      incoming.element.src = definition.url;
      incoming.song = song;
    }
    incoming.element.loop = definition.continuous;
    incoming.endingFadeScheduled = false;
    try { incoming.element.currentTime = Math.max(0, positionSeconds); } catch { /* Seek retries after metadata. */ }
    const now = this.context.currentTime;
    incoming.gain.gain.cancelScheduledValues(now);
    incoming.gain.gain.setValueAtTime(0, now);
    await incoming.element.play();
    if (generation !== this.musicTransitionGeneration) {
      incoming.element.pause();
      return;
    }
    const fadeSeconds = previous === null || reusePausedDeck ? 2.5 : MUSIC_CROSSFADE_SECONDS;
    incoming.gain.gain.linearRampToValueAtTime(1, now + fadeSeconds);
    if (previous !== null && previous !== incoming) {
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
      previous.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      window.setTimeout(() => {
        if (generation === this.musicTransitionGeneration) previous.element.pause();
      }, fadeSeconds * 1000 + 50);
    }
    this.activeMusicDeck = incomingIndex;
    this.song = song;
    this.saveMusicPlayback();
  }

  private onMusicTimeUpdate(index: 0 | 1): void {
    if (this.activeMusicDeck !== index || !this.context || !this.musicDecks) return;
    const deck = this.musicDecks[index];
    const song = deck.song;
    if (song === null || STREAMED_MUSIC[song].continuous || deck.endingFadeScheduled) return;
    const remaining = deck.element.duration - deck.element.currentTime;
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > MUSIC_END_FADE_SECONDS) return;
    deck.endingFadeScheduled = true;
    const now = this.context.currentTime;
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
    deck.gain.gain.linearRampToValueAtTime(0, now + remaining);
  }

  private onMusicEnded(index: 0 | 1): void {
    if (this.activeMusicDeck !== index || !this.context || !this.musicDecks) return;
    const deck = this.musicDecks[index];
    const song = deck.song;
    if (song === null || song !== this.desiredSong) return;
    deck.gain.gain.setValueAtTime(0, this.context.currentTime);
    this.song = null;
    const [minimum, maximum] = STREAMED_MUSIC[song].silenceSeconds;
    const delaySeconds = minimum + Math.random() * (maximum - minimum);
    this.scheduleMusicGap(song, delaySeconds);
  }

  private scheduleMusicGap(song: StreamedSongName, delaySeconds: number): void {
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
    if (song === null) return;
    let playback: PersistedMusicPlayback;
    if (this.musicGapTimer !== null || this.backgroundMusicGap !== null) {
      const backgroundGap = this.backgroundMusicGap;
      playback = {
        version: 1,
        song,
        phase: 'gap',
        positionSeconds: 0,
        gapRemainingSeconds: backgroundGap?.remainingSeconds
          ?? Math.max(0, ((this.musicGapEndsAtMs ?? performance.now()) - performance.now()) / 1000),
      };
    } else {
      const deck = this.activeMusicDeck === null ? null : this.musicDecks?.[this.activeMusicDeck] ?? null;
      playback = {
        version: 1,
        song,
        phase: 'playing',
        positionSeconds: deck?.song === song && Number.isFinite(deck.element.currentTime)
          ? Math.max(0, deck.element.currentTime)
          : 0,
        gapRemainingSeconds: 0,
      };
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
    for (const deck of this.musicDecks ?? []) {
      if (deck.element.paused) continue;
      deck.element.pause();
      this.musicPausedForBackground = true;
    }
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
    if (this.musicChangeDeferredForBackground && this.desiredSong !== null) {
      this.musicChangeDeferredForBackground = false;
      this.backgroundMusicGap = null;
      this.musicPausedForBackground = false;
      await this.transitionToSong(this.desiredSong);
      return;
    }
    const pausedGap = this.backgroundMusicGap;
    this.backgroundMusicGap = null;
    if (pausedGap !== null) {
      this.scheduleMusicGap(pausedGap.song, pausedGap.remainingSeconds);
      return;
    }
    if (!this.musicPausedForBackground || !this.musicDecks || this.activeMusicDeck === null) return;
    this.musicPausedForBackground = false;
    const deck = this.musicDecks[this.activeMusicDeck];
    const now = this.context.currentTime;
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(0, now);
    try {
      await deck.element.play();
      deck.gain.gain.linearRampToValueAtTime(1, now + 1);
    } catch { /* Browser autoplay policy will retry after the next unlock gesture. */ }
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
