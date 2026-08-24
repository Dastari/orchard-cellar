import { AudioBus } from './audio/audio-bus.js';

const SONGS = ['theme_title', 'theme_spring'] as const;
const SFX = [
  'footstep_grass', 'footstep_path', 'footstep_cellar',
  'ui_hover', 'ui_confirm',
  'bird_chirp_1', 'bird_chirp_2', 'bird_chirp_3', 'wind_gust',
] as const;

const audio = new AudioBus(false);
const songs = document.querySelector<HTMLElement>('#songs');
const sfx = document.querySelector<HTMLElement>('#sfx');
const status = document.querySelector<HTMLElement>('#status');
const error = document.querySelector<HTMLElement>('#error');
const meter = document.querySelector<HTMLProgressElement>('#meter');

function button(name: string, activate: () => Promise<void>): HTMLButtonElement {
  const element = document.createElement('button');
  element.textContent = name;
  element.dataset['cue'] = name;
  element.addEventListener('click', () => {
    if (error) error.textContent = '';
    void audio.unlock().then(activate).catch((reason: unknown) => {
      if (error) error.textContent = `ERROR ${reason instanceof Error ? reason.message : String(reason)}`;
    });
  });
  return element;
}

for (const name of SONGS) songs?.append(button(name, async () => await audio.playSong(name)));
for (const name of SFX) sfx?.append(button(name, async () => await audio.playSfx(name)));
document.querySelector('#stop')?.addEventListener('click', () => audio.stop());

window.setInterval(() => {
  const current = audio.getStatus();
  if (meter) {
    meter.value = current.meter;
    meter.dataset['peak'] = current.meter.toFixed(3);
  }
  if (status) status.textContent = `${current.state} · ${current.song ?? 'no song'} · peak ${current.meter.toFixed(3)}`;
}, 80);

Object.assign(window, { __orchardAudioPreview: { audio, songs: SONGS, sfx: SFX } });
