import { AudioBus } from '@orchard/engine/audio/audio-bus';
import { ui, uiFixed, CanvasTextEditor } from '@orchard/ui/studio';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { AUDIO_PREVIEW_SFX, AUDIO_PREVIEW_SONGS, AudioPreviewModel } from './model.js';

export function buildAudioCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const state = context.controller.toolState('audio-kit', () => ({
    model: new AudioPreviewModel(() => new AudioBus(false)),
    timer: null as ReturnType<typeof setInterval> | null,
    disposed: false,
    query: new CanvasTextEditor({maxLength:120}),
    category: 'all',
  }));
  const model = state.model, status = model.status();
  const stop = () => {
    model.stop();
    if (state.timer !== null) clearInterval(state.timer);
    state.timer = null;
  };
  const play = (request: () => Promise<void>) => {
    void request().then(() => {
      if (state.disposed) { model.stop(); return; }
      state.timer ??= setInterval(context.invalidate, 100);
    }).catch((error: unknown) => {
      context.controller.notifications.push('error', 'Audio preview failed', error instanceof Error ? error.message : String(error));
    }).finally(context.invalidate);
  };
  const peak = Math.max(0, Math.min(1, status?.meter ?? 0));
  const title = (cue: string) => cue.replaceAll('_', ' ').replace(/^ui\b/u, 'UI').replace(/^./u,char=>char.toUpperCase());
  const matches = (cue: string) => title(cue).toLowerCase().includes(state.query.snapshot().value.toLowerCase().trim());
  const controls = ui.flex({ width: 'grow', gap: 8 }, [
    ui.input({id:'audio-query',label:'Find a sound',placeholder:'Find a sound',editor:state.query,onChange:context.invalidate}),
    ui.select({id:'audio-category',label:'Library',value:state.category,options:[
      {value:'all',label:'All sounds'},{value:'music',label:'Music'},{value:'effects',label:'Sound effects'},
    ],onChange:value=>{state.category=value;context.invalidate();}}),
  ]);
  const songs = AUDIO_PREVIEW_SONGS.filter(matches);
  const effects = AUDIO_PREVIEW_SFX.filter(matches);
  const library = ui.flex({width:'grow',height:'grow',gap:8},[
    ...(state.category==='effects'||songs.length===0?[]:[
      ui.text('Music'),
      ui.flex({direction:'row',wrap:true,width:'grow',gap:4},songs.map(cue=>ui.button({
        id:`audio-song-${cue}`,label:title(cue),tone:status?.song===cue?'success':'primary',
        onPress:()=>play(()=>model.playSong(cue)),
      }))),
    ]),
    ...(state.category==='music'||effects.length===0?[]:[
      ui.text('Sound effects'),
      ui.list({id:'audio-sfx',label:'Sound effects',items:effects,key:cue=>cue,
        rowHeight:uiFixed(24),layout:{width:'grow',height:'grow'},
        render:cue=>ui.button({id:`audio-sfx-${cue}`,label:title(cue),leading:ui.icon({cf:'sound'}),layout:{width:'grow'},onPress:()=>play(()=>model.playSfx(cue))})}),
    ]),
    ...((state.category==='effects'?effects.length:state.category==='music'?songs.length:songs.length+effects.length)===0?[ui.text('No sounds match your search.')]:[]),
  ]);
  const workspace = ui.flex({ width: 'grow', height: 'grow', gap: 8, padding: 8 }, [
    controls.setStyle({direction:'row',wrap:true}),
    library,
    ui.separator(),
    ui.flex({direction:'row',width:'grow',gap:8,align:'center'},[
      ui.button({id:'audio-stop',label:'Stop',tone:'danger',onPress:()=>{stop();context.invalidate();}}),
      ui.text(model.error() ?? (status?.song ? `${title(status.song)} · ${status.state}` : 'Ready to audition'),{id:'audio-status',layout:{width:'grow'}}),
    ]),
    ui.progress({ id: 'audio-meter', value: peak, tone: peak > .85 ? 'danger' : peak > .6 ? 'warning' : 'success', layout: { height: uiFixed(8),shrink:0 } }),
  ]);
  return { kit: { workspace }, lifecycle: {
    key: 'audio-kit', dispose: () => { state.disposed = true; stop(); context.controller.releaseToolState('audio-kit', state); },
  } };
}
