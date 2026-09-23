import type { AssetPaletteItem } from './object/asset-palette.js';
import { kitElement, kitElements, pressKit, chooseKit, keyKit } from './kit-test-driver.js';
import { UiRoot } from '@orchard/ui/studio';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createLiveIslandMapDocument, createMapPrefabDocument } from '@orchard/sim';
import type { StudioSpatialArt, CanvasTextEditor } from '@orchard/ui/studio';
import { StudioShellController } from '../shell/controller.js';
import type { StudioCanvasToolContext } from '../shell/canvas-tool.js';
import { buildAudioCanvasTool } from './audio/canvas.js';
import { AUDIO_PREVIEW_SFX, AudioPreviewModel } from './audio/model.js';
import { buildCharacterCanvasTool } from './character/canvas.js';
import { buildMapCanvasTool } from './map/canvas.js';
import { buildObjectCanvasTool } from './object/canvas.js';
import { buildTilesCanvasTool } from './tiles/canvas.js';
import { buildUiLabCanvasTool } from './ui-lab/canvas.js';

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 206, height: 620 });
const WORKSPACE = Object.freeze({ x: 300, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1140, y: 20, width: 260, height: 620 });

function context(path: string): StudioCanvasToolContext {
  const controller = new StudioShellController(async () => { throw new Error('unused'); }, null);
  expect(controller.navigate(path)).toBe(true);
  return { controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR, bounds: WORKSPACE,
    route: controller.activeRoute(), controller, invalidate: vi.fn() };
}

function fakeCanvasContext(): CanvasRenderingContext2D {
  const target = {
    save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(),
    rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
    ellipse: vi.fn(), fillText: vi.fn(),
    drawImage: vi.fn(), setLineDash: vi.fn(), putImageData: vi.fn(),
    createImageData: vi.fn((width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) })),
  };
  return new Proxy(target, { set(object, property, value) {
    Object.assign(object, { [property]: value }); return true;
  } }) as unknown as CanvasRenderingContext2D;
}

describe('canvas-native Build and asset tools', () => {
  it('delegates the lab to its complete retained kit canvas without legacy draw nodes', () => {
    expect(buildUiLabCanvasTool(context('/author/ui-lab'))).toEqual({ standalone: 'ui-lab' });
  });
  it.each(['/build/map', '/build/map/terrain-lab', '/build/map/procedural-world'])('builds map route %s with retained drawers', (path) => {
 const c=context(path);let s=buildMapCanvasTool(c);
 for(const id of ['objects','terrain','raise','lower','fill'])expect(kitElement(s,'map-tool-'+id)).toMatchObject({kind:'button'});
 expect(kitElement(s,'map-eyedropper')).toBeDefined();expect(kitElement(s,'map-workspace')).toBeUndefined();expect(kitElement(s,'map-auto-publish')).toBeUndefined();
 expect(kitElement(s,'map-auto-generation')).toMatchObject({kind:'select'});
 pressKit(s,'map-tool-terrain');s=buildMapCanvasTool(c);expect(kitElement(s,'map-filter-all')).toBeUndefined();
 const rows=kitElement(s,'map-palette-list')!.props['items'] as {id:string}[][];expect(rows.flat().some(x=>x.id==='map-material-grass_1')).toBe(true);
 pressKit(s,'map-height-up');s=buildMapCanvasTool(c);expect(kitElement(s,'map-current-height')?.label).toBe('Height 1');
 });

  it('keeps six pixel tools on one row and footer chrome inside the narrow drawer',()=>{
    const c=context('/build/map/terrain-lab');let s=buildMapCanvasTool(c);pressKit(s,'map-tool-terrain');s=buildMapCanvasTool(c);
    const root=new UiRoot({scale:1});root.resize(192,360);root.mount(s.kit!.controls!);root.arrange();
    const tools=['objects','terrain','raise','lower','fill'].map(name=>kitElement(s,'map-tool-'+name)!);
    tools.push(kitElement(s,'map-eyedropper')!);
    expect(new Set(tools.map(tool=>tool.rect.y)).size).toBe(1);
    expect(tools.every(tool=>tool.children.some(child=>child.kind==='map-pixel-tool-icon'))).toBe(true);
    for(const id of ['map-auto-generation','map-publish']){
      const button=kitElement(s,id)!;expect(button.rect.width).toBeLessThanOrEqual(192);
      expect(button.clip.width).toBe(button.rect.width);expect(button.clip.height).toBe(button.rect.height);
    }
    expect(kitElement(s,'map-publish')!.rect.y).toBeGreaterThan(kitElement(s,'map-auto-generation')!.rect.y);
    const entries=kitElements(s).filter(element=>element.id.startsWith('map-material-'));
    expect(entries.length).toBeGreaterThan(3);expect(entries.every(entry=>entry.rect.width===40&&entry.rect.height===40)).toBe(true);
    root.dispose();
  });

  it('places a drawer drag locally only after dropping onto the map, and cancels outside',()=>{
    const c=context('/build/map/terrain-lab');buildMapCanvasTool(c);
    const state=c.controller.toolState('map-canvas:terrain-lab',()=>{throw new Error('missing state')}) as {model:{document:()=>{objects:unknown[]}};interaction:{setCatalog:(value:ReturnType<typeof createMapPrefabDocument>[])=>void}};
    state.interaction.setCatalog([createMapPrefabDocument({id:'drag-fixture',title:'Drag fixture'})]);let s=buildMapCanvasTool(c);
    const root=new UiRoot({scale:1});root.resize(216,620);root.mount(s.kit!.controls!);root.arrange();
    const object=kitElements(s).find(element=>element.id.startsWith('map-prefab-')&&!element.disabled)!;
    const initial=state.model.document().objects.length,point={x:object.rect.x+10,y:object.rect.y+10};
    const event=(type:'down'|'move'|'up'|'cancel',point:{x:number;y:number})=>object.hooks.onPointer!({type,point,button:0,pointerId:1,capture(){},release(){}},object);
    event('down',point);event('move',{x:350,y:150});expect(state.model.document().objects).toHaveLength(initial);
    event('up',{x:350,y:150});expect(state.model.document().objects).toHaveLength(initial+1);
    event('down',point);event('move',{x:2,y:2});event('up',{x:2,y:2});expect(state.model.document().objects).toHaveLength(initial+1);
    root.dispose();s=buildMapCanvasTool(c);expect(kitElement(s,'map-publish')?.disabled).toBe(true);
  });

  it('keeps warm map scene construction inside one animation-frame budget', () => {
    const toolContext = context('/build/map');
    buildMapCanvasTool(toolContext);
    const samples = Array.from({ length: 8 }, () => {
      const started = performance.now();
      buildMapCanvasTool(toolContext);
      return performance.now() - started;
    });
    expect(Math.max(...samples)).toBeLessThan(16.7);
  });

  it('searches and filters a virtual object icon grid', () => {
 const c=context('/build/map');let s=buildMapCanvasTool(c);
 expect(kitElement(s,'map-object-search')?.kind).toBe('input');
 for(const filter of ['all','plants','fences','buildings','prefabs','other'])expect(kitElement(s,'map-filter-'+filter)).toBeDefined();
 pressKit(s,'map-filter-fences');s=buildMapCanvasTool(c);
 const rows=kitElement(s,'map-palette-list')!.props['items'] as {label:string}[][];
 expect(rows.flat().every(x=>/fence|hedge|gate|picket/i.test(x.label))).toBe(true);
 expect(kitElement(s,'map-left-view')).toBeUndefined();
});

  it('fits visibility and layer selection on one row',()=>{
 const s=buildMapCanvasTool(context('/build/map'));const root=new UiRoot({scale:1});root.resize(130,620);root.mount(s.kit!.inspector!);root.arrange();
 const eye=kitElement(s,'map-layer-visible-canopy')!,name=kitElement(s,'map-layer-select-canopy')!;
 expect(eye.rect.y).toBe(name.rect.y);expect(eye.rect.height).toBe(16);expect(eye.clip.width).toBe(eye.rect.width);root.dispose();
});

  it('exposes exactly one eye and one name per layer',()=>{
 const s=buildMapCanvasTool(context('/build/map'));
 for(const layer of createLiveIslandMapDocument().layers){expect(kitElement(s,'map-layer-visible-'+layer.id)).toBeDefined();expect(kitElement(s,'map-layer-select-'+layer.id)).toBeDefined();}
 expect(kitElements(s).some(x=>/^map-layer-(lock|solo|rename|front|back)-/.test(x.id))).toBe(false);
});

  it('changes layer selection independently from eye visibility',()=>{
 const c=context('/build/map');let s=buildMapCanvasTool(c);pressKit(s,'map-layer-visible-canopy');pressKit(s,'map-layer-select-objects');s=buildMapCanvasTool(c);
 expect(kitElement(s,'map-layer-visible-canopy')?.label).toContain('Show');expect(kitElement(s,'map-layer-select-objects')?.parent?.props['selected']).toBe(true);
 expect(kitElement(s,'map-layer-visible-objects')?.label).toContain('Hide');
});

  it('keeps annotation tools in the anchor inspector',()=>{
 const c=context('/build/map/terrain-lab');let s=buildMapCanvasTool(c);pressKit(s,'map-layer-select-anchors');s=buildMapCanvasTool(c);
 for(const kind of ['poi','label'])expect(kitElement(s,'map-anchor-tool-'+kind)).toMatchObject({disabled:false});
 pressKit(s,'map-anchor-tool-poi');expect(s.input?.keyDown?.({key:'Escape',repeat:false,shiftKey:false,altKey:false,ctrlKey:false,metaKey:false})).toBe(true);
});

  it('edits an annotation label through one compact Canvas-native action with strict cancel and validation', async () => {
    const toolContext = context('/build/map/terrain-lab');
    buildMapCanvasTool(toolContext);
    type AnchorLabelProbe = {
      readonly model: {
        document(): { readonly revision: number; readonly anchors: readonly {
          readonly id: string; readonly label?: string;
        }[] };
        placeAnchor(anchor: {
          readonly id: string; readonly kind: 'poi'; readonly label: string;
          readonly tileX: number; readonly tileY: number; readonly elevation: number;
        }): void;
        selectAnchor(id: string): void;
        undo(): void;
      };
    };
    const state = toolContext.controller.toolState<AnchorLabelProbe>('map-canvas:terrain-lab', () => {
      throw new Error('map state was not retained');
    });
    state.model.selectAnchor('editor-spawn');
    let surface = buildMapCanvasTool(toolContext);
    expect(kitElements(surface).some(({ id }) => id === 'map-selection-edit-anchor-label')).toBe(false);
    expect(kitElements(surface).some(({ id }) => id === 'map-selection-delete-anchor')).toBe(false);

    state.model.placeAnchor({
      id: 'poi-1', kind: 'poi', label: 'Old Label', tileX: 2, tileY: 2, elevation: 0,
    });
    state.model.selectAnchor('poi-1');
    const beforeRevision = state.model.document().revision;
    const editedAnchor = () => state.model.document().anchors.find(({ id }) => id === 'poi-1');
    await vi.waitFor(() => {
      surface = buildMapCanvasTool(toolContext);
      expect(kitElement(surface, 'map-selection-edit-anchor-label'))
        .toMatchObject({ kind: 'button', label: 'Edit label' });
    });
    expect(kitElement(surface, 'map-selection-edit-anchor-label')?.label)
      .toBe('Edit label');

    pressKit(surface, 'map-selection-edit-anchor-label');
    surface = buildMapCanvasTool(toolContext);
    const editor = kitElement(surface, 'map-selection-edit-anchor-label')?.props['editor'] as CanvasTextEditor | undefined;
    expect(editor?.snapshot()).toMatchObject({ value: 'Old Label', focused: true });
    expect(kitElement(surface, 'map-selection-edit-anchor-label'))
      .toMatchObject({ kind: 'input' });

    editor?.setValue('   ');
    surface = buildMapCanvasTool(toolContext);
    pressKit(surface, 'map-selection-confirm-anchor-label');
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document().revision).toBe(beforeRevision);
    expect(editedAnchor()?.label).toBe('Old Label');
    expect(editor?.snapshot().value).toBe('   ');
    expect(kitElement(surface, 'map-selection-edit-anchor-label'))
      .toMatchObject({ kind: 'input', props: { tone: 'danger' } });

    editor?.setValue('x'.repeat(97));
    surface = buildMapCanvasTool(toolContext);
    pressKit(surface, 'map-selection-confirm-anchor-label');
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document().revision).toBe(beforeRevision);
    expect(editedAnchor()?.label).toBe('Old Label');
    expect(editor?.snapshot().value).toHaveLength(97);
    expect(kitElement(surface, 'map-selection-anchor-label-error')?.label)
      .toContain('96 characters or fewer');

    editor?.setValue(' Orchard Gate ');
    surface = buildMapCanvasTool(toolContext);
    expect(surface.input?.keyDown?.({
      key: 'Enter', repeat: false, shiftKey: false, altKey: false,
      ctrlKey: false, metaKey: false,
    })).toBe(true);
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document()).toMatchObject({ revision: beforeRevision + 1 });
    expect(editedAnchor()).toMatchObject({
      id: 'poi-1', label: 'Orchard Gate', tileX: 2, tileY: 2, elevation: 0,
    });
    expect((kitElement(surface, 'map-selection-edit-anchor-label')?.kind === 'input')).toBe(false);
    state.model.undo();
    expect(editedAnchor()?.label).toBe('Old Label');

    surface = buildMapCanvasTool(toolContext);
    pressKit(surface, 'map-selection-edit-anchor-label');
    surface = buildMapCanvasTool(toolContext);
    const cancelledEditor = kitElement(surface, 'map-selection-edit-anchor-label')?.props['editor'] as CanvasTextEditor | undefined;
    cancelledEditor?.setValue('Discard Me');
    expect(surface.input?.keyDown?.({
      key: 'Escape', repeat: false, shiftKey: false, altKey: false,
      ctrlKey: false, metaKey: false,
    })).toBe(true);
    surface = buildMapCanvasTool(toolContext);
    expect(editedAnchor()?.label).toBe('Old Label');
    expect((kitElement(surface, 'map-selection-edit-anchor-label')?.kind === 'input')).toBe(false);

    pressKit(surface, 'map-selection-edit-anchor-label');
    surface = buildMapCanvasTool(toolContext);
    const disposedEditor = kitElement(surface, 'map-selection-edit-anchor-label')?.props['editor'] as CanvasTextEditor | undefined;
    disposedEditor?.setValue('Discard On Dispose');
    surface.lifecycle?.dispose();
    expect(disposedEditor?.snapshot().focused).toBe(false);
    expect(editedAnchor()?.label).toBe('Old Label');
  });

  it('previews finite-map crop loss in canvas chrome before one undoable resize command', () => {
    const protectedMap = buildMapCanvasTool(context('/build/map'));
    expect(kitElement(protectedMap, 'map-resize-mode')).toMatchObject({
      disabled: true, label: 'Live island dimensions are fixed by server authority',
    });
    expect(kitElements(protectedMap).some(({ id }) => id === 'map-resize-west-shrink')).toBe(false);
    const procedural = buildMapCanvasTool(context('/build/map/procedural-world'));
    expect(kitElement(procedural, 'map-resize-mode')).toMatchObject({
      disabled: true, label: 'Signed procedural worlds have no finite map edge',
    });
    expect(kitElements(procedural).some(({ id }) => id === 'map-resize-west-shrink')).toBe(false);

    const toolContext = context('/build/map/terrain-lab');
    let surface = buildMapCanvasTool(toolContext);
    expect(kitElement(surface, 'map-resize-mode')).toMatchObject({ disabled: false });
    pressKit(surface, 'map-resize-mode');
    surface = buildMapCanvasTool(toolContext);
    const resizeActions = kitElements(surface).filter(({ id, kind }) => kind === 'button' && /^map-resize-(west|east|north|south)-/u.test(id));
    expect(resizeActions).toHaveLength(8);
    expect(resizeActions.every(({ disabled }) => !disabled)).toBe(true);
    type ResizeProbe = {
      readonly model: { document(): { readonly width: number; readonly height: number } };
    };
    const state = toolContext.controller.toolState<ResizeProbe>('map-canvas:terrain-lab', () => {
      throw new Error('map state was not retained');
    });
    const initial = { width: state.model.document().width, height: state.model.document().height };

    pressKit(surface, 'map-resize-west-shrink');
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document()).toMatchObject(initial);
    expect(kitElement(surface, 'map-resize-preview-dimensions')?.label)
      .toContain(`CROP WEST · ${initial.width - 1}×${initial.height}`);
    expect(kitElement(surface, 'map-resize-preview-loss')?.label)
      .toMatch(/OBJECT \d+ · TRANSITION \d+ · OTHER \d+/u);
    expect(kitElements(surface).map(({ id }) => id)).toEqual(expect.arrayContaining([
      'map-resize-cancel', 'map-resize-confirm',
    ]));
    expect(surface.input?.pointerDown?.({
      point: { x: WORKSPACE.x + 100, y: WORKSPACE.y + 100 }, button: 0, pointerId: 1,
      spaceHeld: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    })).toBe(true);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => fakeCanvasContext() })),
    });
    const previewDrawing = fakeCanvasContext();
    expect(() => surface.draw?.(previewDrawing, {} as StudioSpatialArt)).not.toThrow();
    expect(previewDrawing.fillRect).toHaveBeenCalled();
    expect(previewDrawing.setLineDash).toHaveBeenCalledWith([6, 4]);
    vi.unstubAllGlobals();

    expect(surface.input?.keyDown?.({ key: 'Escape', repeat: false,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
    surface = buildMapCanvasTool(toolContext);
    expect(state.model.document()).toMatchObject(initial);
    expect(kitElements(surface).some(({ id }) => id === 'map-resize-confirm')).toBe(false);

    pressKit(surface, 'map-resize-west-shrink');
    surface = buildMapCanvasTool(toolContext);
    pressKit(surface, 'map-resize-confirm');
    expect(state.model.document()).toMatchObject({ width: initial.width - 1, height: initial.height });
    surface = buildMapCanvasTool(toolContext);
    pressKit(surface, 'map-undo');
    expect(state.model.document()).toMatchObject(initial);
    surface = buildMapCanvasTool(toolContext);
    pressKit(surface, 'map-redo');
    expect(state.model.document()).toMatchObject({ width: initial.width - 1, height: initial.height });
  });

  it('gates terrain authoring controls when the active terrain layer is hidden or locked', () => {
    const toolContext = context('/build/map');
    let surface = buildMapCanvasTool(toolContext);
    pressKit(surface, 'map-tool-terrain');
    pressKit(surface, 'map-layer-visible-terrain');
    surface = buildMapCanvasTool(toolContext);
    expect((kitElement(surface,'map-palette-list')!.props['items'] as {id:string;disabled?:boolean}[][]).flat().filter(({ id }) => id.startsWith('map-material-'))
      .every(({ disabled }) => disabled)).toBe(true);

    pressKit(surface, 'map-layer-visible-terrain');
    pressKit(surface, 'map-layer-select-generated_base');
    surface = buildMapCanvasTool(toolContext);
    expect((kitElement(surface,'map-palette-list')!.props['items'] as {id:string;disabled?:boolean}[][]).flat().filter(({ id }) => id.startsWith('map-material-'))
      .every(({ disabled }) => disabled)).toBe(true);
  });

  it('routes Space plus primary drag to map panning without an edit', () => {
    const toolContext = context('/build/map');
    const surface = buildMapCanvasTool(toolContext);
    const state = toolContext.controller.toolState<{
      readonly model: { canUndo(): boolean };
      readonly interaction: { snapshot(): { readonly camera: { readonly x: number; readonly y: number;
        readonly zoom: number } } };
    }>('map-canvas:live-island', () => { throw new Error('map state was not retained'); });
    const point = { x: WORKSPACE.x + 300, y: WORKSPACE.y + 220 };
    surface.input?.wheel?.({ point, deltaX: 0, deltaY: -1_000,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    const before = state.interaction.snapshot().camera;
    const pointer = { point, button: 0, pointerId: 7, spaceHeld: true,
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
    expect(surface.input?.spaceDragPan).toBe(true);
    expect(surface.input?.pointerDown?.(pointer)).toBe(true);
    expect(surface.input?.pointerMove?.({ ...pointer,
      point: { x: point.x - 40, y: point.y - 30 } })).toBe(true);
    expect(surface.input?.pointerUp?.(pointer)).toBe(true);
    expect(state.interaction.snapshot().camera).not.toEqual(before);
    expect(state.model.canUndo()).toBe(false);
  });

  it('terminates map terrain work and recreates retained state after lifecycle disposal', () => {
    const workers: Array<{ terminated: boolean }> = [];
    class FakeWorker {
      terminated = false;
      constructor() { workers.push(this); }
      addEventListener(): void { /* pending until disposal */ }
      postMessage(): void { /* pending until disposal */ }
      terminate(): void { this.terminated = true; }
    }
    vi.stubGlobal('Worker', FakeWorker);
    try {
      const toolContext = context('/build/map');
      const first = buildMapCanvasTool(toolContext);
      expect(first.lifecycle?.key).toBe('map-canvas:live-island');
      expect(workers).toHaveLength(1);

      first.lifecycle?.dispose();
      expect(workers[0]?.terminated).toBe(true);

      const second = buildMapCanvasTool(toolContext);
      expect(workers).toHaveLength(2);
      expect(workers[1]?.terminated).toBe(false);
      second.lifecycle?.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('restores camera, selected layer, visibility and search by route',()=>{
 const records=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>records.set(key,value)});
 try{const c=context('/build/map');let s=buildMapCanvasTool(c);pressKit(s,'map-tool-terrain');pressKit(s,'map-layer-visible-canopy');s=buildMapCanvasTool(c);
 (kitElement(s,'map-object-search')!.props['editor'] as CanvasTextEditor).setValue('grass');buildMapCanvasTool(c);
 const next=buildMapCanvasTool(context('/build/map'));expect(kitElement(next,'map-layer-visible-canopy')?.label).toContain('Show');
 expect((kitElement(next,'map-object-search')!.props['editor'] as CanvasTextEditor).snapshot().value).toBe('grass');
 expect(kitElement(next,'map-tool-terrain')?.parent?.children.some(child=>child.kind==='palette-selection-reticle')).toBe(true);}finally{vi.unstubAllGlobals();}
});

  it('uses kit tileset editors and preserves datum edits and JSON drafts', () => {
    const toolContext=context('/build/tiles');let surface=buildTilesCanvasTool(toolContext);
    expect(surface.draw).toBeUndefined();
    const initial=String(kitElements(surface).find(node=>node.kind==='text'&&String(node.props['text']).startsWith('Datum '))?.props['text']);
    pressKit(surface,'tiles-datum-up');surface=buildTilesCanvasTool(toolContext);
    expect(kitElements(surface).find(node=>node.kind==='text'&&String(node.props['text']).startsWith('Datum '))?.props['text']).not.toBe(initial);
    pressKit(surface,'tiles-tabs:tab:json');surface=buildTilesCanvasTool(toolContext);
    const draft=kitElement(surface,'tiles-json')!.props['editor'] as CanvasTextEditor;
    const value=JSON.parse(draft.snapshot().value) as {baseDatum:number;ruleCatalogue:{families:unknown[]}};
    expect(draft.snapshot().value.length).toBeGreaterThan(32_000);
    expect(value.ruleCatalogue.families).toHaveLength(6);
    draft.setValue(JSON.stringify({...value,baseDatum:value.baseDatum+2}));
    pressKit(surface,'tiles-apply');surface=buildTilesCanvasTool(toolContext);
    expect(kitElements(surface).some(node=>node.props['text']===`Datum ${value.baseDatum+2}`)).toBe(true);
    pressKit(surface,'tiles-tabs:tab:fixtures');surface=buildTilesCanvasTool(toolContext);
    expect(kitElements(surface).filter(node=>node.id.startsWith('tiles-fixture-')).length).toBeGreaterThan(0);
  });

  it('uses kit audio controls, reaches the final virtual cue, and tears down playback', async () => {
    vi.useFakeTimers();
    const play=vi.spyOn(AudioPreviewModel.prototype,'playSfx').mockResolvedValue();
    const stop=vi.spyOn(AudioPreviewModel.prototype,'stop');
    try {
      const toolContext=context('/author/audio');const surface=buildAudioCanvasTool(toolContext);
      expect(surface.draw).toBeUndefined();
      expect(kitElement(surface,'audio-meter')?.kind).toBe('progress');
      keyKit(surface,'audio-sfx','End');
      const last=AUDIO_PREVIEW_SFX.at(-1)!;
      pressKit(surface,`audio-sfx-${last}`);await Promise.resolve();
      expect(play).toHaveBeenCalledWith(last);
      expect(vi.getTimerCount()).toBe(1);
      surface.lifecycle?.dispose();expect(stop).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
      expect(buildAudioCanvasTool(toolContext).lifecycle).not.toBe(surface.lifecycle);
    } finally {vi.useRealTimers();play.mockRestore();stop.mockRestore();}
  });

  it('uses kit prefab controls and preserves the shared grid preference', () => {
    const toolContext=context('/build/object');let surface=buildObjectCanvasTool(toolContext);
    expect(surface.draw).toBeUndefined();
    expect(kitElement(surface,'object-prefab-grid')?.props['background']).toBe('checkerboard');
    const assets=toolContext.controller.toolState<{palette:readonly AssetPaletteItem[];selectedAsset:string|null}>('object-canvas',()=>{throw new Error('missing object state');});
    assets.palette=[{key:'test',assetId:1,assetName:'prop_test',category:'props',tags:[],layer:'object',footprint:[1,1],blocksMovement:false,builderAvailable:true,
      visual:{kind:'state',name:'default',frameIndex:0},frame:{x:0,y:0,width:16,height:16,durationTicks:1},animated:false}];
    assets.selectedAsset='test';surface=buildObjectCanvasTool(toolContext);
    pressKit(surface,'object-prefab-stamp');surface=buildObjectCanvasTool(toolContext);
    const root=new UiRoot({scale:1});root.resize(380,310);root.mount(surface.kit!.workspace!);root.arrange();
    const piece=kitElement(surface,'object-prefab-piece-piece-1')!;
    expect(piece.clip.width).toBeGreaterThanOrEqual(16);expect(piece.clip.height).toBeGreaterThanOrEqual(16);
    root.unmount(surface.kit!.workspace!);root.dispose();
    pressKit(surface,'object-prefab-tabs:tab:pieces');surface=buildObjectCanvasTool(toolContext);
    pressKit(surface,'object-prefab-select-piece-1');surface=buildObjectCanvasTool(toolContext);
    pressKit(surface,'object-prefab-right');surface=buildObjectCanvasTool(toolContext);
    expect(kitElement(surface,'object-prefab-select-piece-1')?.label).toContain('5,4');
    expect(toolContext.controller.toggleGrid()).toBe(false);surface=buildObjectCanvasTool(toolContext);
    expect(kitElement(surface,'object-prefab-grid')?.props['background']).toBe('none');
  });
  it('edits object behaviour through kit graph and JSON controls', () => {
    const toolContext=context('/build/object');let surface=buildObjectCanvasTool(toolContext);
    chooseKit(surface,'object-mode','Behaviour');surface=buildObjectCanvasTool(toolContext);
    pressKit(surface,'object-behaviour-add');surface=buildObjectCanvasTool(toolContext);
    const graph=kitElement(surface,'object-behaviour-graph')!;
    const nodes=graph.props['items'] as {id:string;kind:string}[];
    expect(nodes.map(node=>node.kind)).toEqual(['trigger','condition','effect']);
    const effect=nodes.find(node=>node.kind==='effect')!;
    pressKit(surface,`object-behaviour-node-${effect.id}`);surface=buildObjectCanvasTool(toolContext);
    expect(kitElement(surface,'object-behaviour-remove')?.disabled).toBe(false);
    pressKit(surface,'object-behaviour-remove');surface=buildObjectCanvasTool(toolContext);
    expect((kitElement(surface,'object-behaviour-graph')!.props['items'] as {id:string}[]).some(node=>node.id===effect.id)).toBe(false);
  });

  it('mutates retained character state through a semantic canvas action', () => {
    const toolContext = context('/author/character');
    const initial = buildCharacterCanvasTool(toolContext);
    expect(initial.draw).toBeUndefined();
    pressKit(initial,'character-facing-right');
    const updated = buildCharacterCanvasTool(toolContext);
    expect(kitElement(updated,'character-facing-right')?.props['tone']).toBe('success');
    expect(toolContext.invalidate).toHaveBeenCalled();
  });

  it('contains no DOM, HTML, or SVG implementation path in the canonical adapters', () => {
    const sources = [
      'map/canvas.ts', 'object/canvas.ts', 'tiles/canvas.ts',
      'character/canvas.ts', 'audio/canvas.ts', 'ui-lab/canvas.ts',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    expect(sources).not.toMatch(/document\.(?:createElement|querySelector|body|head)|createElement|HTMLElement|innerHTML|insertAdjacentHTML|<svg|SVGElement/u);
    expect(sources).toContain('ui.tabs(');
    expect(sources).not.toMatch(/layoutUiFlex|canvasAction|canvasLabel|finishCanvasTool/u);
    expect(sources).toContain('kit:');
  });

  it('leaves transparent editor workspaces open for the shared alpha grid', () => {
    for (const path of ['object/canvas.ts', 'tiles/canvas.ts', 'character/canvas.ts', 'ui-lab/canvas.ts']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source, path).not.toMatch(/fillRect\((?:workspaceBody|target)\.x,\s*(?:workspaceBody|target)\.y,\s*(?:workspaceBody|target)\.width/gu);
    }
  });
});
