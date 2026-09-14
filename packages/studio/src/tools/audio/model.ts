import type { AudioStatus, GameAudio } from '@orchard/engine/audio/audio-bus';

export const AUDIO_PREVIEW_SONGS = ['theme_title', 'theme_spring', 'theme_night'] as const;
export const AUDIO_PREVIEW_SFX = [
  'footstep_grass', 'footstep_path', 'footstep_cellar',
  'ui_hover', 'ui_confirm',
  'bird_chirp_1', 'bird_chirp_2', 'bird_chirp_3', 'wind_gust',
] as const;

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

  async playSong(name: typeof AUDIO_PREVIEW_SONGS[number]): Promise<void> {
    await this.activate((audio) => audio.playSong(name));
  }

  async playSfx(name: typeof AUDIO_PREVIEW_SFX[number]): Promise<void> {
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
