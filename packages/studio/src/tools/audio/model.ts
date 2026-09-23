import type { AudioStatus, GameAudio } from '@orchard/engine/audio/audio-bus';

/**
 * Cue names discovered from the shared authored sources, so new songs/SFX appear without
 * code changes. The eager `name` import bundles only each file's name string, not its data.
 */
export function audioCueNames(paths: readonly string[], suffix: '.song.json' | '.sfx.json'): readonly string[] {
  return paths.map((path) => path.slice(path.lastIndexOf('/') + 1))
    .filter((file) => file.endsWith(suffix))
    .map((file) => file.slice(0, -suffix.length))
    .sort((left, right) => left.localeCompare(right));
}

// Title first, then the rest alphabetically: the order a composer usually auditions in.
export const AUDIO_PREVIEW_SONGS: readonly string[] = audioCueNames(
  Object.keys(import.meta.glob('../../../../assets/music/*.song.json', { eager: true, import: 'name' })), '.song.json',
).toSorted((left, right) => Number(right === 'theme_title') - Number(left === 'theme_title'));
export const AUDIO_PREVIEW_SFX: readonly string[] = audioCueNames(
  Object.keys(import.meta.glob('../../../../assets/sfx/*.sfx.json', { eager: true, import: 'name' })), '.sfx.json',
);

export const AUDIO_TOOL_REGISTRATION = Object.freeze({
  id: 'audio', label: 'Audio Preview', mode: 'author' as const, icon: 'editor.audio',
  routes: Object.freeze(['/author/audio'] as const),
  docks: Object.freeze(['asset_library', 'audio_mixer', 'validation'] as const),
  commands: Object.freeze([{ id: 'audio.play', label: 'Play selected sound' }] as const),
});

export type AudioPreviewFactory = () => GameAudio;

export class AudioPreviewModel {
  #audio: GameAudio | null = null;
  #lastError: string | null = null;
  constructor(private readonly createAudio: AudioPreviewFactory) {}

  audioConstructed(): boolean { return this.#audio !== null; }
  error(): string | null { return this.#lastError; }
  status(): AudioStatus | null { return this.#audio?.getStatus() ?? null; }

  async playSong(name: string): Promise<void> {
    await this.activate((audio) => audio.playSong(name));
  }

  async playSfx(name: string): Promise<void> {
    await this.activate((audio) => audio.playSfx(name));
  }

  stop(): void { this.#audio?.stop(); }

  private async activate(play: (audio: GameAudio) => Promise<void>): Promise<void> {
    this.#audio ??= this.createAudio();
    this.#lastError = null;
    try { await this.#audio.unlock(); await play(this.#audio); }
    catch (error: unknown) { this.#lastError = error instanceof Error ? error.message : String(error); throw error; }
  }
}
