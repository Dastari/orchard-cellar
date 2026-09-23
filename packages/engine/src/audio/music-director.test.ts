import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_CONTEXT,
  MusicDirector,
  ruleSongs,
  seededRandom,
  selectMusicRule,
  validateAudioAssignment,
  type AudioAssignment,
  type MusicCommand,
  type MusicContext,
} from './music-director.js';

const musicRoot = new URL('../../../assets/music/', import.meta.url);
const shipped = JSON.parse(readFileSync(new URL('audio-assignment.json', musicRoot), 'utf8')) as AudioAssignment;
const shippedSongs = new Set(readdirSync(musicRoot).filter((name) => name.endsWith('.song.json')).map((name) => name.replace(/\.song\.json$/u, '')));

const world = (patch: Partial<MusicContext> = {}): MusicContext => ({ ...DEFAULT_MUSIC_CONTEXT, ...patch });

const assignment: AudioAssignment = {
  format: 'orchard-audio-assignment-v1',
  defaults: { silenceSeconds: [100, 200], entrySilenceSeconds: [10, 20], fadeInSeconds: 3, fadeOutSeconds: 6, stingerCooldownSeconds: 30 },
  rules: [
    { id: 'title', priority: 1000, when: { scene: ['title'] }, mode: 'continuous', cues: ['theme_title'] },
    {
      id: 'combat', priority: 900, when: { scene: ['world'], combat: true }, mode: 'combat', cues: ['combat_a'],
      fadeInSeconds: 1, fadeOutSeconds: 3, exitHoldSeconds: 5, enterStinger: 'sting_in', exitStinger: 'sting_out', afterSilenceSeconds: [30, 40],
    },
    { id: 'cellar', priority: 400, when: { zone: ['cellar'] }, mode: 'sparse', cues: ['cellar_a', 'shared'] },
    { id: 'quiet', priority: 300, when: { anyTags: ['hush'] }, mode: 'sparse', cues: [] },
    { id: 'night', priority: 200, when: { scene: ['world'], time: ['dusk', 'night'] }, mode: 'sparse', cues: ['night_a', 'shared'], silenceSeconds: [50, 60] },
    { id: 'day', priority: 100, when: { scene: ['world'] }, mode: 'sparse', cues: [{ song: 'day_a', weight: 3 }, 'day_b'] },
  ],
};

function plays(commands: readonly MusicCommand[]): string[] {
  return commands.map((command) => command.type === 'play' ? `play:${command.song}` : command.type === 'sting' ? `sting:${command.song}` : `stop:${command.fadeSeconds}`);
}

describe('music director rule selection', () => {
  it('chooses the highest-priority matching rule, earliest on ties', () => {
    expect(selectMusicRule(assignment, world({ scene: 'title' }))?.id).toBe('title');
    expect(selectMusicRule(assignment, world({ combat: true, time: 'night' }))?.id).toBe('combat');
    expect(selectMusicRule(assignment, world({ zone: 'cellar', time: 'night' }))?.id).toBe('cellar');
    expect(selectMusicRule(assignment, world({ time: 'dusk' }))?.id).toBe('night');
    expect(selectMusicRule(assignment, world({ tags: ['hush', 'x'] }))?.id).toBe('quiet');
    expect(selectMusicRule(assignment, world())?.id).toBe('day');
  });

  it('routes every shipped context to authored music', () => {
    expect(validateAudioAssignment(shipped, shippedSongs)).toEqual([]);
    const cases: [Partial<MusicContext>, string][] = [
      [{ scene: 'title' }, 'title'],
      [{ combat: true, zone: 'delve' }, 'combat'],
      [{ zone: 'delve', tags: ['delve:volcanic'] }, 'delve_volcanic'],
      [{ zone: 'delve' }, 'delve'],
      [{ biome: 'volcanic_ash' }, 'volcanic'],
      [{ zone: 'cellar' }, 'cellar'],
      [{ zone: 'interior', time: 'night' }, 'interior'],
      [{ weather: 'rain', time: 'night' }, 'rain'],
      [{ weather: 'rain', zone: 'interior' }, 'interior'],
      [{ time: 'night' }, 'night'],
      [{ time: 'dusk', zone: 'homestead' }, 'night'],
      [{ time: 'dawn', season: 'winter' }, 'day'],
    ];
    for (const [context, rule] of cases) expect(selectMusicRule(shipped, world(context))?.id, JSON.stringify(context)).toBe(rule);
    for (const rule of shipped.rules) for (const song of ruleSongs(rule)) expect(shippedSongs).toContain(song);
  });

  it('reports authoring mistakes precisely', () => {
    const broken = {
      ...assignment,
      rules: [
        { id: 'Bad Id', priority: 1, when: {}, mode: 'sparse', cues: [] },
        { id: 'a', priority: 1, when: { zone: ['moon'], mood: ['x'] }, mode: 'loud', cues: ['nope', { song: 'day_a', weight: -1 }], silenceSeconds: [9, 3], enterStinger: 'ghost' },
        { id: 'a', priority: 1, when: {}, mode: 'sparse', cues: [] },
      ],
    };
    const errors = validateAudioAssignment(broken, new Set(['day_a']));
    expect(errors).toEqual(expect.arrayContaining([
      'Bad Id: invalid id', 'a: mode must be continuous/sparse/combat', 'a: unknown condition mood', 'a: invalid zone',
      'a: unknown cue nope', 'a: cue weight must be >= 0', 'a: silenceSeconds must be [min, max] seconds', 'a: unknown enterStinger', 'a: duplicate id',
    ]));
    expect(validateAudioAssignment({ format: 'v0' }, new Set())).toHaveLength(1);
  });
});

describe('music director scheduling', () => {
  it('opens with an entry silence, plays one sparse piece, then leaves a long gap', () => {
    const director = new MusicDirector(assignment, seededRandom(7));
    expect(director.update(world(), 0)).toEqual([]);
    const entry = director.state(0);
    expect(entry).toMatchObject({ rule: 'day', phase: 'gap', song: null });
    expect(entry.gapRemainingSeconds).toBeGreaterThanOrEqual(10);
    expect(entry.gapRemainingSeconds).toBeLessThanOrEqual(20);
    expect(director.update(world(), 9.9)).toEqual([]);
    const first = director.update(world(), 20);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: 'play', loop: false, fadeSeconds: 3, rule: 'day' });
    expect(director.update(world(), 30)).toEqual([]);
    director.pieceEnded(90);
    const gap = director.state(90);
    expect(gap.phase).toBe('gap');
    expect(gap.gapRemainingSeconds).toBeGreaterThanOrEqual(100);
    expect(gap.gapRemainingSeconds).toBeLessThanOrEqual(200);
    expect(director.update(world(), 189)).toEqual([]);
    expect(plays(director.update(world(), 291))).toHaveLength(1);
  });

  it('is deterministic for a seed and avoids repeating the previous piece', () => {
    const run = (seed: number): string[] => {
      const director = new MusicDirector(assignment, seededRandom(seed));
      const songs: string[] = [];
      let now = 0;
      for (let index = 0; index < 60; index += 1) {
        for (const command of director.update(world(), now)) if (command.type === 'play') { songs.push(command.song); director.pieceEnded(now + 60); now += 60; }
        now += 30;
      }
      return songs;
    };
    expect(run(42)).toEqual(run(42));
    const songs = run(42);
    expect(songs.length).toBeGreaterThan(3);
    for (let index = 1; index < songs.length; index += 1) expect(songs[index]).not.toBe(songs[index - 1]);
  });

  it('crossfades into combat with a stinger, holds through lulls, and exits smoothly', () => {
    const director = new MusicDirector(assignment, seededRandom(1));
    director.update(world(), 0);
    director.update(world(), 30);
    expect(director.state(30).phase).toBe('playing');
    expect(plays(director.update(world({ combat: true }), 40))).toEqual(['sting:sting_in', 'play:combat_a']);
    expect(director.update(world({ combat: true }), 41)).toEqual([]);
    // A four-second lull is shorter than the five-second hold: the loop continues.
    expect(director.update(world(), 44)).toEqual([]);
    expect(director.update(world({ combat: true }), 45)).toEqual([]);
    expect(director.update(world(), 49)).toEqual([]);
    expect(plays(director.update(world(), 50.5))).toEqual(['stop:3', 'sting:sting_out']);
    const after = director.state(50.5);
    expect(after).toMatchObject({ rule: 'day', phase: 'gap' });
    expect(after.gapRemainingSeconds).toBeGreaterThanOrEqual(30);
    expect(after.gapRemainingSeconds).toBeLessThanOrEqual(40);
  });

  it('rate-limits stingers when fights flicker on and off', () => {
    const director = new MusicDirector(assignment, seededRandom(3));
    director.update(world(), 0);
    expect(plays(director.update(world({ combat: true }), 1))).toContain('sting:sting_in');
    expect(plays(director.update(world(), 10))).toContain('sting:sting_out');
    const again = plays(director.update(world({ combat: true }), 12));
    expect(again).toEqual(['play:combat_a']);
  });

  it('keeps a shared piece playing across zones and fades out pieces that do not belong', () => {
    const director = new MusicDirector(assignment, () => 0.99);
    director.update(world({ time: 'night' }), 0);
    const first = director.update(world({ time: 'night' }), 20);
    expect(first).toMatchObject([{ type: 'play', song: 'shared' }]);
    expect(director.update(world({ time: 'night', zone: 'cellar' }), 25)).toEqual([]);
    expect(director.state(25)).toMatchObject({ rule: 'cellar', phase: 'playing', song: 'shared' });
    const leave = plays(director.update(world({ time: 'day' }), 30));
    expect(leave).toEqual(['stop:6']);
    expect(director.state(30)).toMatchObject({ rule: 'day', phase: 'gap' });
  });

  it('shortens, but never lengthens, a silence when the context changes mid-gap', () => {
    const director = new MusicDirector(assignment, () => 0.5);
    director.update(world({ time: 'night' }), 0);
    director.update(world({ time: 'night' }), 20);
    director.pieceEnded(40);
    expect(director.state(40).gapRemainingSeconds).toBeCloseTo(55);
    director.update(world({ zone: 'cellar' }), 41);
    expect(director.state(41).gapRemainingSeconds).toBeCloseTo(20);
  });

  it('plays continuous rules immediately and loops them', () => {
    const director = new MusicDirector(assignment, seededRandom(9));
    expect(director.update(world({ scene: 'title' }), 0)).toEqual([{ type: 'play', song: 'theme_title', loop: true, fadeSeconds: 3, rule: 'title' }]);
    expect(director.update(world({ scene: 'title' }), 500)).toEqual([]);
    expect(plays(director.update(world(), 600))).toEqual(['stop:6']);
  });

  it('treats an empty cue list as deliberate silence', () => {
    const director = new MusicDirector(assignment, seededRandom(2));
    director.update(world({ tags: ['hush'] }), 0);
    expect(director.update(world({ tags: ['hush'] }), 100)).toEqual([]);
    expect(director.state(100)).toMatchObject({ rule: 'quiet', phase: 'idle' });
  });

  it('restores saved playback and gaps, but never a saved fight', () => {
    const playing = new MusicDirector(assignment, seededRandom(4));
    playing.restore({ rule: 'night', phase: 'playing', song: 'night_a', gapRemainingSeconds: 0 }, 100);
    expect(playing.loops('night')).toBe(false);
    expect(playing.update(world({ time: 'night' }), 101)).toEqual([]);
    expect(playing.state(101)).toMatchObject({ rule: 'night', phase: 'playing', song: 'night_a' });

    const gap = new MusicDirector(assignment, seededRandom(4));
    gap.restore({ rule: 'day', phase: 'gap', song: null, gapRemainingSeconds: 42 }, 10);
    expect(gap.update(world(), 11)).toEqual([]);
    expect(gap.state(11).gapRemainingSeconds).toBeCloseTo(41);

    const fight = new MusicDirector(assignment, seededRandom(4));
    fight.restore({ rule: 'combat', phase: 'playing', song: 'combat_a', gapRemainingSeconds: 0 }, 0);
    expect(fight.state(0)).toMatchObject({ rule: null, phase: 'idle' });
    expect(fight.loops('title')).toBe(true);
  });
});
