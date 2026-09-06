import { AudioBus } from '@orchard/engine/audio/audio-bus';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import {
  canvasAction,
  canvasLabel,
  canvasPanel,
  canvasParts,
  canvasRows,
  canvasSlots,
  finishCanvasTool,
  reportCanvasError,
} from '../build-canvas-common.js';
import { AUDIO_PREVIEW_SFX, AUDIO_PREVIEW_SONGS, AudioPreviewModel } from './model.js';

export function buildAudioCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const model = context.controller.toolState('audio-canvas', () => new AudioPreviewModel(() => new AudioBus(false)));
  const status = model.status();
  const parts = canvasParts();
  const controlsBody = context.controlsBounds ?? context.bounds;
  const workspaceBody = context.workspaceBounds ?? context.bounds;
  const shell = canvasSlots(controlsBody, [
    { id: 'header', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'music', minSize: { width: 0, height: 110 }, main: { mode: 'fit', preferred: 180, min: 110 } },
    { id: 'sfx', minSize: { width: 0, height: 110 }, main: { mode: 'grow', min: 110 } },
  ], { gap: 6 });
  const header = canvasSlots(shell['header']!, [
    { id: 'title', minSize: { width: 90, height: 40 }, main: { mode: 'grow', min: 90 } },
    { id: 'stop', minSize: { width: 84, height: 40 }, main: { mode: 'fixed', size: 84 } },
  ], { direction: 'row', gap: 4 });
  canvasLabel(parts, 'title', 'GAME AUDIO AUDITION', header['title']!, { heading: true });
  canvasAction(parts, 'stop', 'Stop all preview audio', header['stop']!, () => {
    model.stop(); context.invalidate();
  }, { glyph: '■ STOP', tone: 'danger' });
  const workspaceSlots = canvasSlots(workspaceBody, [
    { id: 'title', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'status', minSize: { width: 0, height: 54 }, main: { mode: 'fixed', size: 54 } },
    { id: 'meter', minSize: { width: 0, height: 100 }, main: { mode: 'grow', min: 100 } },
  ], { gap: 8 });
  canvasLabel(parts, 'workspace-title', 'CANVAS AUDIO MONITOR', workspaceSlots['title']!, { heading: true });
  canvasLabel(parts, 'status', model.error() === null
    ? `${status?.state.toUpperCase() ?? 'IDLE'} · ${status?.song ?? 'NO SONG'} · PEAK ${(status?.meter ?? 0).toFixed(3)}`
    : `ERROR · ${model.error()}`,
  workspaceSlots['status']!, { field: true, tone: model.error() === null ? 'normal' : 'danger' });
  canvasLabel(parts, 'meter', `PEAK ${(status?.meter ?? 0).toFixed(3)}\nAUDIO CONTEXT ${model.audioConstructed() ? 'ACTIVE' : 'NOT CREATED'}\nSELECT A CUE IN THE LEFT TOOL DRAWER`,
    workspaceSlots['meter']!, { field: true, tone: status?.state === 'running' ? 'success' : 'normal' });
  const musicFrame = shell['music']!;
  const sfxFrame = shell['sfx']!;
  const music = canvasPanel(parts, 'music-panel', musicFrame, 'thin', 4);
  const sfx = canvasPanel(parts, 'sfx-panel', sfxFrame, 'thin', 4);
  const musicSlots = canvasSlots(music, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'cues', minSize: { width: 0, height: 42 }, main: { mode: 'grow', min: 42 } },
  ], { gap: 6 });
  canvasLabel(parts, 'music-title', 'MUSIC', musicSlots['title']!, { heading: true });
  const songRows = canvasRows(musicSlots['cues']!, AUDIO_PREVIEW_SONGS.length, 42, 6);
  AUDIO_PREVIEW_SONGS.slice(0, songRows.length).forEach((cue, index) => canvasAction(parts, `song-${cue}`,
    `Play music cue ${cue}`, songRows[index]!, () => {
      void model.playSong(cue).catch((error: unknown) => reportCanvasError(context, 'Music preview failed', error)).finally(context.invalidate);
    }, { role: 'option', glyph: `▶ ${cue}`, active: status?.song === cue }));
  const sfxSlots = canvasSlots(sfx, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'cues', minSize: { width: 0, height: 40 }, main: { mode: 'grow', min: 36 } },
  ], { gap: 6 });
  canvasLabel(parts, 'sfx-title', 'SOUND EFFECTS', sfxSlots['title']!, { heading: true });
  const sfxRows = canvasRows(sfxSlots['cues']!, AUDIO_PREVIEW_SFX.length, 40, 4);
  AUDIO_PREVIEW_SFX.slice(0, sfxRows.length).forEach((cue, index) => canvasAction(parts, `sfx-${cue}`,
    `Play sound effect ${cue}`, sfxRows[index]!, () => {
      void model.playSfx(cue).catch((error: unknown) => reportCanvasError(context, 'Sound preview failed', error)).finally(context.invalidate);
    }, { role: 'option', glyph: `♪ ${cue}` }));
  return finishCanvasTool(context, parts, (drawing) => {
    const meter = Math.max(0, Math.min(1, model.status()?.meter ?? 0));
    const target = workspaceSlots['meter']!;
    drawing.save();
    drawing.fillStyle = '#2a3731'; drawing.fillRect(target.x, target.y, target.width, target.height);
    drawing.fillStyle = meter > 0.85 ? '#c95b4b' : meter > 0.6 ? '#e1aa43' : '#6ea85f';
    drawing.fillRect(target.x + 12, target.y + target.height - 22,
      Math.max(0, (target.width - 24) * meter), 12);
    drawing.strokeStyle = '#f3dfad'; drawing.strokeRect(target.x + 12, target.y + target.height - 22,
      Math.max(0, target.width - 24), 12);
    drawing.fillStyle = '#f3dfad'; drawing.font = '14px monospace'; drawing.textAlign = 'center';
    drawing.fillText(model.audioConstructed() ? 'AUDIO BUS READY' : 'SELECT A CUE TO CREATE AUDIO CONTEXT',
      target.x + target.width / 2, target.y + target.height / 2);
    drawing.restore();
  });
}
