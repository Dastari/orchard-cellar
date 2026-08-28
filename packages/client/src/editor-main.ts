import { initializeLoadingScreen, setLoadingScreenStage } from './loading-screen.js';
import { offlineEditorPath } from './editor/editor-route.js';
import './style.css';

const parameters = new URLSearchParams(location.search);
const requestedMap = parameters.get('map') ?? 'procedural-world';
parameters.delete('mode');
parameters.delete('source');
parameters.delete('map');
const editorSearch = parameters.size === 0 ? '' : `?${parameters.toString()}`;
history.replaceState(null, '', `${offlineEditorPath(requestedMap)}${editorSearch}${location.hash}`);

document.title = 'Orchard & Cellar — Seed World Editor';
setLoadingScreenStage({
  title: 'OPENING THE SEED WORLD',
  detail: 'NO ACCOUNT OR WORLD DATABASE CONNECTION REQUIRED',
  progress: 24,
});
await initializeLoadingScreen();

try {
  await import('./editor/offline-editor.js');
} catch (error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  document.querySelector<HTMLCanvasElement>('#game')?.setAttribute('data-editor-error', message);
  setLoadingScreenStage({
    title: 'EDITOR COULD NOT OPEN',
    detail: message.toUpperCase(),
    progress: 100,
  });
  throw error;
}
