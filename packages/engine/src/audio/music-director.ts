import type { Season } from '@orchard/sim';
import type { AmbienceTime } from './types.js';

/**
 * Data-driven music director. Given the player's context (scene, time of day,
 * season, zone, biome, weather, combat, mood tags) it chooses a rule from the
 * authored audio assignment (`packages/assets/music/audio-assignment.json`) and
 * emits playback commands. It works like Minecraft's music: sparse pieces play
 * once, followed by long randomised silences. Combat music enters and leaves
 * quickly and is framed by stingers.
 *
 * The director is a pure state machine. Time is passed in and randomness comes
 * from an injected generator, so scheduling is deterministic and testable.
 */

export const AUDIO_ASSIGNMENT_FORMAT = 'orchard-audio-assignment-v1';
export const MUSIC_SCENES = ['title', 'world'] as const;
export const MUSIC_ZONES = ['overworld', 'homestead', 'interior', 'cellar', 'delve'] as const;
export const MUSIC_WEATHER = ['clear', 'rain'] as const;
export const MUSIC_RULE_MODES = ['continuous', 'sparse', 'combat'] as const;

export type MusicScene = typeof MUSIC_SCENES[number];
export type MusicZone = typeof MUSIC_ZONES[number];
export type MusicWeather = typeof MUSIC_WEATHER[number];
export type MusicRuleMode = typeof MUSIC_RULE_MODES[number];

export interface MusicContext {
  readonly scene: MusicScene;
  readonly season: Season;
  readonly time: AmbienceTime;
  readonly zone: MusicZone;
  /** Map biome under the player (e.g. `volcanic_ash`), or null indoors. */
  readonly biome: string | null;
  readonly weather: MusicWeather;
  readonly combat: boolean;
  /** Free-form mood tags supplied by the game, e.g. `delve:volcanic`, `room:boss`. */
  readonly tags: readonly string[];
}

export const DEFAULT_MUSIC_CONTEXT: MusicContext = {
  scene: 'world', season: 'spring', time: 'day', zone: 'overworld', biome: null, weather: 'clear', combat: false, tags: [],
};

/** Conditions are ANDed; each list matches when the context value is one of its entries. */
export interface MusicRuleWhen {
  readonly scene?: readonly MusicScene[];
  readonly season?: readonly Season[];
  readonly time?: readonly AmbienceTime[];
  readonly zone?: readonly MusicZone[];
  readonly biome?: readonly string[];
  readonly weather?: readonly MusicWeather[];
  readonly combat?: boolean;
  /** Every listed tag must be present. */
  readonly tags?: readonly string[];
  /** At least one listed tag must be present. */
  readonly anyTags?: readonly string[];
}

export interface MusicCueChoice {
  readonly song: string;
  /** Relative chance of being picked (default 1). */
  readonly weight?: number;
}

export interface MusicRule {
  readonly id: string;
  readonly description?: string;
  /** The highest priority wins; ties go to the rule listed first. */
  readonly priority: number;
  readonly when: MusicRuleWhen;
  readonly mode: MusicRuleMode;
  /** Songs to choose from. An empty list means the rule is deliberately silent. */
  readonly cues: readonly (string | MusicCueChoice)[];
  /** Quiet interval after a piece ends (sparse rules). */
  readonly silenceSeconds?: readonly [number, number];
  /** Quiet interval before the first piece after entering this rule. */
  readonly entrySilenceSeconds?: readonly [number, number];
  readonly fadeInSeconds?: number;
  /** Fade applied when leaving this rule while one of its pieces is playing. */
  readonly fadeOutSeconds?: number;
  /** Combat rules: keep playing this long after the combat signal clears. */
  readonly exitHoldSeconds?: number;
  readonly enterStinger?: string;
  readonly exitStinger?: string;
  /** Combat rules: quiet interval before the underlying rule plays again. */
  readonly afterSilenceSeconds?: readonly [number, number];
}

export interface AudioAssignment {
  readonly format: typeof AUDIO_ASSIGNMENT_FORMAT;
  readonly defaults: {
    readonly silenceSeconds: readonly [number, number];
    readonly entrySilenceSeconds: readonly [number, number];
    readonly fadeInSeconds: number;
    readonly fadeOutSeconds: number;
    /** Minimum seconds between two plays of the same stinger. */
    readonly stingerCooldownSeconds: number;
  };
  readonly rules: readonly MusicRule[];
}

export type MusicCommand =
  | { readonly type: 'play'; readonly song: string; readonly loop: boolean; readonly fadeSeconds: number; readonly rule: string }
  | { readonly type: 'stop'; readonly fadeSeconds: number }
  | { readonly type: 'sting'; readonly song: string };

export type MusicDirectorPhase = 'idle' | 'playing' | 'gap';

export interface MusicDirectorState {
  readonly rule: string | null;
  readonly phase: MusicDirectorPhase;
  readonly song: string | null;
  /** Seconds left in the current silence (0 unless in a gap). */
  readonly gapRemainingSeconds: number;
}

function matches(when: MusicRuleWhen, context: MusicContext): boolean {
  if (when.scene && !when.scene.includes(context.scene)) return false;
  if (when.season && !when.season.includes(context.season)) return false;
  if (when.time && !when.time.includes(context.time)) return false;
  if (when.zone && !when.zone.includes(context.zone)) return false;
  if (when.biome && (context.biome === null || !when.biome.includes(context.biome))) return false;
  if (when.weather && !when.weather.includes(context.weather)) return false;
  if (when.combat !== undefined && when.combat !== context.combat) return false;
  if (when.tags && !when.tags.every((tag) => context.tags.includes(tag))) return false;
  if (when.anyTags && !when.anyTags.some((tag) => context.tags.includes(tag))) return false;
  return true;
}

/** The rule that applies to a context: highest priority, then earliest in the file. */
export function selectMusicRule(assignment: AudioAssignment, context: MusicContext): MusicRule | null {
  let best: MusicRule | null = null;
  for (const rule of assignment.rules) {
    if (!matches(rule.when, context)) continue;
    if (best === null || rule.priority > best.priority) best = rule;
  }
  return best;
}

export function ruleSongs(rule: MusicRule): readonly string[] {
  return rule.cues.map((cue) => typeof cue === 'string' ? cue : cue.song);
}

/** Deterministic PRNG (mulberry32) for reproducible silence lengths and cue picks. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class MusicDirector {
  private rule: MusicRule | null = null;
  private phase: MusicDirectorPhase = 'idle';
  private song: string | null = null;
  private gapEndsAt = 0;
  private lastCombatAt = Number.NEGATIVE_INFINITY;
  private readonly lastSongByRule = new Map<string, string>();
  private readonly lastStingAt = new Map<string, number>();

  constructor(
    private readonly assignment: AudioAssignment,
    private readonly random: () => number = Math.random,
  ) {}

  state(now: number): MusicDirectorState {
    return {
      rule: this.rule?.id ?? null,
      phase: this.phase,
      song: this.phase === 'playing' ? this.song : null,
      gapRemainingSeconds: this.phase === 'gap' ? Math.max(0, this.gapEndsAt - now) : 0,
    };
  }

  /** Re-enter a saved state after a reload. Combat is never restored. */
  restore(state: MusicDirectorState, now: number): void {
    const rule = this.assignment.rules.find((candidate) => candidate.id === state.rule) ?? null;
    if (rule === null || rule.mode === 'combat') return;
    this.rule = rule;
    if (state.phase === 'playing' && state.song !== null) {
      this.phase = 'playing';
      this.song = state.song;
    } else if (state.phase === 'gap') {
      this.phase = 'gap';
      this.gapEndsAt = now + Math.max(0, state.gapRemainingSeconds);
    }
  }

  /** Whether a restored song should loop (continuous and combat rules loop). */
  loops(ruleId: string | null): boolean {
    const rule = this.assignment.rules.find((candidate) => candidate.id === ruleId);
    return rule !== undefined && rule.mode !== 'sparse';
  }

  /** Evaluate the context at time `now` (seconds) and return what to play. */
  update(context: MusicContext, now: number): MusicCommand[] {
    if (context.combat) this.lastCombatAt = now;
    const commands: MusicCommand[] = [];
    let effective = context;
    // Combat hysteresis: keep combat music through short lulls in the fight.
    if (!context.combat && this.rule?.mode === 'combat'
      && now - this.lastCombatAt < (this.rule.exitHoldSeconds ?? 0)) effective = { ...context, combat: true };
    const next = selectMusicRule(this.assignment, effective);
    if (next !== this.rule) this.enterRule(next, now, commands);
    if (this.phase === 'gap' && now >= this.gapEndsAt && this.rule !== null) this.startPiece(this.rule, commands);
    return commands;
  }

  /** The bus reports that a non-looping piece finished naturally. */
  pieceEnded(now: number): void {
    if (this.phase !== 'playing' || this.rule === null) return;
    this.song = null;
    this.beginGap(this.rule.silenceSeconds ?? this.assignment.defaults.silenceSeconds, now);
  }

  private enterRule(next: MusicRule | null, now: number, commands: MusicCommand[]): void {
    const previous = this.rule;
    this.rule = next;
    const leavingCombat = previous?.mode === 'combat' && next?.mode !== 'combat';
    if (next?.mode === 'combat') {
      if (next.enterStinger) this.sting(next.enterStinger, now, commands);
      this.startPiece(next, commands);
      return;
    }
    if (leavingCombat) {
      commands.push({ type: 'stop', fadeSeconds: previous.fadeOutSeconds ?? this.assignment.defaults.fadeOutSeconds });
      if (previous.exitStinger) this.sting(previous.exitStinger, now, commands);
      this.song = null;
      if (next === null) { this.phase = 'idle'; return; }
      if (next.mode === 'continuous') { this.startPiece(next, commands); return; }
      this.beginGap(previous.afterSilenceSeconds ?? next.entrySilenceSeconds ?? this.assignment.defaults.entrySilenceSeconds, now);
      return;
    }
    if (next === null) {
      if (this.phase === 'playing') commands.push({ type: 'stop', fadeSeconds: previous?.fadeOutSeconds ?? this.assignment.defaults.fadeOutSeconds });
      this.phase = 'idle';
      this.song = null;
      return;
    }
    // A piece that also belongs to the new rule keeps playing (e.g. walking indoors mid-phrase).
    if (this.phase === 'playing' && this.song !== null && ruleSongs(next).includes(this.song)) return;
    if (next.mode === 'continuous') { this.startPiece(next, commands); return; }
    if (this.phase === 'playing') {
      commands.push({ type: 'stop', fadeSeconds: previous?.fadeOutSeconds ?? this.assignment.defaults.fadeOutSeconds });
      this.song = null;
      this.beginGap(next.entrySilenceSeconds ?? this.assignment.defaults.entrySilenceSeconds, now);
      return;
    }
    const entry = next.entrySilenceSeconds ?? this.assignment.defaults.entrySilenceSeconds;
    if (this.phase === 'gap') {
      // Keep the quiet already under way, but never longer than the new rule's entry silence.
      this.gapEndsAt = Math.min(this.gapEndsAt, now + entry[1]);
      return;
    }
    this.beginGap(entry, now);
  }

  private beginGap(range: readonly [number, number], now: number): void {
    this.phase = 'gap';
    this.gapEndsAt = now + range[0] + this.random() * Math.max(0, range[1] - range[0]);
  }

  private startPiece(rule: MusicRule, commands: MusicCommand[]): void {
    const song = this.pick(rule);
    if (song === null) {
      if (this.phase === 'playing') commands.push({ type: 'stop', fadeSeconds: rule.fadeOutSeconds ?? this.assignment.defaults.fadeOutSeconds });
      this.phase = 'idle';
      this.song = null;
      return;
    }
    this.phase = 'playing';
    this.song = song;
    this.lastSongByRule.set(rule.id, song);
    commands.push({
      type: 'play', song, rule: rule.id, loop: rule.mode !== 'sparse',
      fadeSeconds: rule.fadeInSeconds ?? this.assignment.defaults.fadeInSeconds,
    });
  }

  /** Weighted pick that avoids repeating the rule's previous piece when it has alternatives. */
  private pick(rule: MusicRule): string | null {
    const all = rule.cues.map((cue) => typeof cue === 'string' ? { song: cue, weight: 1 } : { song: cue.song, weight: cue.weight ?? 1 })
      .filter((cue) => cue.weight > 0);
    if (all.length === 0) return null;
    const previous = this.lastSongByRule.get(rule.id);
    const pool = all.length > 1 ? all.filter((cue) => cue.song !== previous) : all;
    const total = pool.reduce((sum, cue) => sum + cue.weight, 0);
    let roll = this.random() * total;
    for (const cue of pool) {
      roll -= cue.weight;
      if (roll < 0) return cue.song;
    }
    return pool[pool.length - 1]!.song;
  }

  private sting(song: string, now: number, commands: MusicCommand[]): void {
    const last = this.lastStingAt.get(song) ?? Number.NEGATIVE_INFINITY;
    if (now - last < this.assignment.defaults.stingerCooldownSeconds) return;
    this.lastStingAt.set(song, now);
    commands.push({ type: 'sting', song });
  }
}

/** Structural validation for the authored assignment; returns human-readable errors. */
export function validateAudioAssignment(value: unknown, knownSongs: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const record = (candidate: unknown): candidate is Record<string, unknown> => typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
  const range = (candidate: unknown): boolean => Array.isArray(candidate) && candidate.length === 2
    && candidate.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) && (candidate[0] as number) <= (candidate[1] as number);
  const list = (candidate: unknown, allowed?: readonly string[]): boolean => Array.isArray(candidate)
    && candidate.every((entry) => typeof entry === 'string' && (allowed === undefined || allowed.includes(entry)));
  if (!record(value) || value['format'] !== AUDIO_ASSIGNMENT_FORMAT) return [`audio assignment must declare format ${AUDIO_ASSIGNMENT_FORMAT}`];
  const defaults = value['defaults'];
  if (!record(defaults) || !range(defaults['silenceSeconds']) || !range(defaults['entrySilenceSeconds'])
    || typeof defaults['fadeInSeconds'] !== 'number' || typeof defaults['fadeOutSeconds'] !== 'number'
    || typeof defaults['stingerCooldownSeconds'] !== 'number') errors.push('audio assignment defaults are incomplete');
  if (!Array.isArray(value['rules'])) return [...errors, 'audio assignment rules missing'];
  const ids = new Set<string>();
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  const times = ['dawn', 'day', 'dusk', 'night'];
  for (const [index, rule] of value['rules'].entries()) {
    const label = record(rule) && typeof rule['id'] === 'string' ? rule['id'] : `rules[${index}]`;
    if (!record(rule) || typeof rule['id'] !== 'string' || !/^[a-z][a-z0-9_]*$/u.test(rule['id'])) { errors.push(`${label}: invalid id`); continue; }
    if (ids.has(rule['id'])) errors.push(`${label}: duplicate id`);
    ids.add(rule['id']);
    if (typeof rule['priority'] !== 'number') errors.push(`${label}: priority must be a number`);
    if (!MUSIC_RULE_MODES.includes(rule['mode'] as MusicRuleMode)) errors.push(`${label}: mode must be ${MUSIC_RULE_MODES.join('/')}`);
    const when = rule['when'];
    if (!record(when)) { errors.push(`${label}: when must be an object`); continue; }
    for (const key of Object.keys(when)) {
      if (!['scene', 'season', 'time', 'zone', 'biome', 'weather', 'combat', 'tags', 'anyTags'].includes(key)) errors.push(`${label}: unknown condition ${key}`);
    }
    if (when['scene'] !== undefined && !list(when['scene'], MUSIC_SCENES)) errors.push(`${label}: invalid scene`);
    if (when['season'] !== undefined && !list(when['season'], seasons)) errors.push(`${label}: invalid season`);
    if (when['time'] !== undefined && !list(when['time'], times)) errors.push(`${label}: invalid time`);
    if (when['zone'] !== undefined && !list(when['zone'], MUSIC_ZONES)) errors.push(`${label}: invalid zone`);
    if (when['weather'] !== undefined && !list(when['weather'], MUSIC_WEATHER)) errors.push(`${label}: invalid weather`);
    for (const key of ['biome', 'tags', 'anyTags']) if (when[key] !== undefined && !list(when[key])) errors.push(`${label}: ${key} must be a string list`);
    if (when['combat'] !== undefined && typeof when['combat'] !== 'boolean') errors.push(`${label}: combat must be true or false`);
    if (!Array.isArray(rule['cues'])) { errors.push(`${label}: cues must be a list`); continue; }
    for (const cue of rule['cues']) {
      const song = typeof cue === 'string' ? cue : record(cue) ? cue['song'] : undefined;
      if (typeof song !== 'string' || !knownSongs.has(song)) errors.push(`${label}: unknown cue ${String(song)}`);
      if (record(cue) && cue['weight'] !== undefined && (typeof cue['weight'] !== 'number' || cue['weight'] < 0)) errors.push(`${label}: cue weight must be >= 0`);
    }
    for (const key of ['silenceSeconds', 'entrySilenceSeconds', 'afterSilenceSeconds']) {
      if (rule[key] !== undefined && !range(rule[key])) errors.push(`${label}: ${key} must be [min, max] seconds`);
    }
    for (const key of ['fadeInSeconds', 'fadeOutSeconds', 'exitHoldSeconds']) {
      if (rule[key] !== undefined && (typeof rule[key] !== 'number' || (rule[key] as number) < 0)) errors.push(`${label}: ${key} must be >= 0`);
    }
    for (const key of ['enterStinger', 'exitStinger']) {
      if (rule[key] !== undefined && (typeof rule[key] !== 'string' || !knownSongs.has(rule[key] as string))) errors.push(`${label}: unknown ${key}`);
    }
  }
  return errors;
}
