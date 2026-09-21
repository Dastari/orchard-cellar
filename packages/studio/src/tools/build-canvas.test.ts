import type { AssetPaletteItem } from './object/asset-palette.js';
import { kitElement, kitElements, pressKit, chooseKit, keyKit } from './kit-test-driver.js';
import { ui, UiRoot, scrollUiElement } from '@orchard/ui/studio';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createLiveIslandMapDocument } from '@orchard/sim';
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
  it.each(['/build/map', '/build/map/terrain-lab', '/build/map/procedural-world'])('builds map route %s with retained drawers', async (path) => {
    const toolContext=context(path);let surface=buildMapCanvasTool(toolContext);
    expect(surface.kit?.controls).toBeDefined();expect(surface.kit?.inspector).toBeDefined();
    expect(surface.kit?.overlays).toBeDefined();
    const root = new UiRoot({scale:2}); root.resize(1280,736);
    root.mount(ui.workbench({navigation:[],workspace:ui.text('Map'),controls:{title:'',surface:'thin',fill:true,content:surface.kit!.controls!}}));root.arrange();
    for (const id of ['map-workspace','map-left-view','map-auto-publish']) {
      const control=kitElement(surface,id)!;
      expect(control.rect.height).toBeGreaterThanOrEqual(24);
      expect(control.clip).toEqual(control.rect);
    }
    const controls=surface.kit!.controls!;controls.parent!.remove(controls);root.dispose();
    expect(kitElement(surface,'map-export')).toMatchObject({kind:'button',disabled:false});
    expect(kitElement(surface,'map-left-view')).toMatchObject({kind:'select'});
    const layers=kitElement(surface,'map-layer-tree')!.props['items'] as {node:{id:string}}[];
    expect(layers.map(row=>row.node.id)).toEqual(['anchors','canopy','player_owned','gameplay','objects','ground','terrain','generated_base']);
    expect(kitElement(surface,'map-layer-lock-generated_base')).toMatchObject({disabled:true});
    expect(kitElement(surface,'map-layer-lock-terrain')).toMatchObject({disabled:false});
    pressKit(surface,'map-export');
    expect(toolContext.controller.notifications.items().at(-1)).toMatchObject({kind:'error',title:'Map export unavailable',detail:'This browser preview does not provide a file-download bridge.'});
    if(path==='/build/map') {
      chooseKit(surface,'map-left-view','World');let outliner=buildMapCanvasTool(toolContext);
      const tree=kitElement(outliner,'map-outliner-world')!;
      tree.setProps({active:(tree.props['items'] as {node:{id:string}}[]).findIndex(row=>row.node.id==='space:0:layer:objects')});
      keyKit(outliner,'map-outliner-world','ArrowRight');outliner=buildMapCanvasTool(toolContext);
      expect((kitElement(outliner,'map-outliner-world')!.props['items'] as {node:{id:string}}[]).some(row=>row.node.id.startsWith('map-object:'))).toBe(true);
      chooseKit(outliner,'map-left-view','Live');outliner=buildMapCanvasTool(toolContext);
      expect(kitElement(outliner,'map-live-outliner-empty')?.label).toBe('CONNECT TO VIEW LIVE WORLD');
      chooseKit(outliner,'map-left-view','Palette');surface=buildMapCanvasTool(toolContext);
      expect(kitElements(surface).some(node=>node.kind==='combobox')).toBe(true);
      const palette=kitElement(surface,'map-palette-list')!;
      expect((palette.props['items'] as {id:string}[]).length).toBeGreaterThan(0);
      expect(palette.children[0]!.children.length).toBeLessThanOrEqual(11);
      expect(kitElement(surface,'map-eyedropper')?.label).toBe('Sample map content into the palette (I)');
      for(const mode of ['brush','surface_family','cliff_family','exact_override','farmland_visual'])expect(kitElement(surface,`map-terrain-mode-${mode}`)).toBeDefined();
      expect(kitElement(surface,'map-terrain-mode-brush')).toMatchObject({props:{tone:'success'}});
      pressKit(surface,'map-terrain-tool-transition');let transition=buildMapCanvasTool(toolContext);
      expect(kitElements(transition).filter(({id})=>id.startsWith('map-transition-'))).toHaveLength(5);
      pressKit(transition,'map-transition-stairs');pressKit(transition,'map-transition-width-more');transition=buildMapCanvasTool(toolContext);
      expect(kitElement(transition,'map-transition-stairs')).toMatchObject({props:{tone:'success'}});
      expect(kitElement(transition,'map-map-stats')?.label).toContain('STAIRS W3');
      pressKit(transition,'map-transition-ladder');transition=buildMapCanvasTool(toolContext);
      expect(kitElement(transition,'map-transition-width-more')).toMatchObject({disabled:true});
      pressKit(transition,'map-eyedropper');surface=buildMapCanvasTool(toolContext);
      expect(kitElement(surface,'map-eyedropper')).toMatchObject({props:{tone:'success'}});
      expect(kitElement(surface,'map-map-stats')?.label).toContain('EYEDROPPER · CLICK MAP');
      pressKit(surface,'map-eyedropper');chooseKit(surface,'map-workspace','biomes');surface=buildMapCanvasTool(toolContext);
      expect((kitElement(surface,'map-palette-list')!.props['items'] as {id:string}[]).every(item=>item.id.startsWith('map-biome-'))).toBe(true);
      const landmark=createLiveIslandMapDocument().landmarks[0]!;
      toolContext.controller.selection.select({kind:'entity',entityKind:'map-object',id:landmark.id,spaceId:0});
      await vi.waitFor(()=>{surface=buildMapCanvasTool(toolContext);expect(kitElement(surface,'map-selection-hide')).toMatchObject({kind:'button',props:{tone:'success'}});});
      expect(kitElement(surface,'map-selection-provenance-label')?.label).toContain('AUTHORED');
      expect(kitElement(surface,'map-selection-layer-label')?.label).toMatch(/LAYER.*CANOPY.*INACTIVE.*VISIBLE.*EDITABLE/u);
      expect(kitElement(surface,'map-selection-material-label')?.label).toMatch(/BIOME.*SURFACE/u);
      chooseKit(surface,'map-selection-view','Schema');surface=buildMapCanvasTool(toolContext);
      expect(kitElement(surface,'map-selection-group-document-label')?.label).toBe('DOCUMENT · 3 FIELDS');
      expect(kitElements(surface).some(({id})=>id.startsWith('map-selection-property-'))).toBe(true);
      expect(kitElements(surface).some(({id})=>id.startsWith('map-selection-why-'))).toBe(true);
      chooseKit(surface,'map-selection-view','Selection');surface=buildMapCanvasTool(toolContext);
      for(const name of ['hide','clone','rotate','flip','scale','delete'])expect(kitElement(surface,`map-selection-${name}`)).toMatchObject({kind:'button'});
      expect(kitElement(surface,'map-layer-select-terrain')).toMatchObject({props:{tone:'success'}});
      pressKit(surface,'map-layer-visible-canopy');surface=buildMapCanvasTool(toolContext);
      expect(kitElement(surface,'map-layer-visible-canopy')?.label).toContain('Show');
      chooseKit(surface,'map-workspace','scatter');surface=buildMapCanvasTool(toolContext);
      expect(kitElement(surface,'map-scatter-less')).toBeDefined();expect(kitElement(surface,'map-scatter-more')).toBeDefined();
      expect(kitElement(surface,'map-scatter-density')?.label).toBe('35% DENSITY');
      expect(kitElement(surface,'map-map-stats')?.label).toContain('DRAW TO SCATTER');
    }
    vi.stubGlobal('document',{createElement:vi.fn(()=>({width:0,height:0,getContext:()=>fakeCanvasContext()}))});
    expect(()=>surface.draw?.(fakeCanvasContext(),{} as StudioSpatialArt)).not.toThrow();vi.unstubAllGlobals();
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

  it('mounts searchable virtual kit Outliners and guarded one-entry authored tree edits', () => {
    const toolContext=context('/build/map');
    let surface=buildMapCanvasTool(toolContext);
    chooseKit(surface,'map-left-view','World');
    surface=buildMapCanvasTool(toolContext);
    const landmark=createLiveIslandMapDocument().landmarks[0]!;
    const search=kitElement(surface,'map-outliner-search-world')!.props['editor'] as CanvasTextEditor;
    const tree=()=>kitElement(surface,'map-outliner-world')!;
    const rows=()=>tree().props['items'] as {node:{id:string}}[];
    const active=()=>rows()[Number(tree().props['active'])]?.node.id;
    const focusRow=(id:string)=>tree().setProps({active:rows().findIndex(row=>row.node.id===id)});
    search.setValue(landmark.id);surface=buildMapCanvasTool(toolContext);
    expect(rows().map(row=>row.node.id)).toContain('space:0');
    expect(rows().filter(row=>row.node.id.startsWith('map-object:')).map(row=>row.node.id)).toEqual([`map-object:${landmark.id}`]);
    pressKit(surface,'map-outliner-clear-world');surface=buildMapCanvasTool(toolContext);
    focusRow('space:0:layer:ground');keyKit(surface,'map-outliner-world','ArrowRight');surface=buildMapCanvasTool(toolContext);
    expect(active()).toBe('space:0:layer:ground');
    keyKit(surface,'map-outliner-world','ArrowRight');surface=buildMapCanvasTool(toolContext);
    expect(active()).toMatch(/^map-object:/u);
    keyKit(surface,'map-outliner-world','Enter');
    expect(toolContext.controller.selection.current()).toMatchObject({kind:'entity',entityKind:'map-object',spaceId:0});
    toolContext.controller.selection.select({kind:'entity',entityKind:'map-object',id:landmark.id,spaceId:0});
    surface=buildMapCanvasTool(toolContext);
    const targetLayer=landmark.layer==='canopy'?'ground':'canopy';
    search.setValue(targetLayer);surface=buildMapCanvasTool(toolContext);
    const reparent=`map-outliner-reparent-space:0:layer:${targetLayer}`;
    expect(kitElement(surface,reparent)).toMatchObject({disabled:false});pressKit(surface,reparent);
    const retained=toolContext.controller.toolState<{readonly model:{document():ReturnType<typeof createLiveIslandMapDocument>}}>('map-canvas:live-island',()=>{throw new Error('missing map state');});
    expect(retained.model.document().landmarks.find(({id})=>id===landmark.id)?.layer).toBe(targetLayer);
    pressKit(buildMapCanvasTool(toolContext),'map-undo');
    expect(retained.model.document().landmarks.find(({id})=>id===landmark.id)?.layer).toBe(landmark.layer);
    search.setValue('world objects');surface=buildMapCanvasTool(toolContext);focusRow('space:0:layer:objects');
    expect(keyKit(surface,'map-outliner-world','ArrowUp',{ctrlKey:true})).toBe(true);
    expect(retained.model.document().layers.map(({id})=>id).indexOf('objects')).toBeLessThan(retained.model.document().layers.map(({id})=>id).indexOf('ground'));
    pressKit(buildMapCanvasTool(toolContext),'map-undo');
    surface=buildMapCanvasTool(toolContext);chooseKit(surface,'map-left-view','Live');surface=buildMapCanvasTool(toolContext);
    expect(kitElement(surface,'map-live-outliner-title')?.label).toContain('READ ONLY');
    expect(kitElements(surface).some(({id})=>id.startsWith('map-outliner-reparent-'))).toBe(false);
  });

  it('fits all three layer actions inside a default-width retained drawer', () => {
    const surface=buildMapCanvasTool(context('/build/map'));
    const root=new UiRoot({scale:1});root.resize(95,320);root.mount(surface.kit!.inspector!);root.arrange();
    for(const name of ['visible','lock','solo']) {
      const action=root.entries().find(({element})=>element.id===`map-layer-${name}-anchors`)!.element;
      expect(action.clip.width).toBe(action.rect.width);expect(action.clip.height).toBe(action.rect.height);
      expect(action.rect.width).toBe(24);expect(action.rect.height).toBe(24);
    }
    root.dispose();
  });

  it('provides compact canvas-native layer rename/reorder controls with locked system boundaries', () => {
    const toolContext = context('/build/map');
    let surface = buildMapCanvasTool(toolContext);
    expect(kitElement(surface,'map-layer-rename-terrain')).toMatchObject({disabled:false});
    expect(kitElement(surface,'map-layer-front-terrain')).toMatchObject({disabled:true});
    expect(kitElement(surface,'map-layer-back-terrain')).toMatchObject({disabled:true});
    pressKit(surface,'map-layer-rename-terrain');
    surface=buildMapCanvasTool(toolContext);
    const editor=kitElement(surface,'map-layer-rename-terrain')!.props['editor'] as CanvasTextEditor;
    expect(editor.snapshot().value).toBe('Terrain Overrides');
    editor.setValue('Cultivated Ground');
    pressKit(surface,'map-layer-rename-confirm-terrain');
    surface=buildMapCanvasTool(toolContext);
    expect(kitElement(surface,'map-layer-select-terrain')?.label).toBe('Cultivated Ground');
    expect(kitElement(surface,'map-layer-rename-terrain')?.kind).toBe('button');
    pressKit(surface,'map-layer-select-objects');
    surface=buildMapCanvasTool(toolContext);
    expect(kitElement(surface,'map-layer-back-objects')).toMatchObject({disabled:false});
    pressKit(surface,'map-layer-back-objects');
    surface=buildMapCanvasTool(toolContext);
    const ids=kitElements(surface).filter(({id})=>id.startsWith('map-layer-select-')).map(({id})=>id);
    expect(ids.indexOf('map-layer-select-ground')).toBeLessThan(ids.indexOf('map-layer-select-objects'));
    expect(kitElement(surface,'map-layer-select-objects')).toMatchObject({props:{tone:'success'}});
    pressKit(surface,'map-undo');
    pressKit(buildMapCanvasTool(toolContext),'map-undo');
    surface=buildMapCanvasTool(toolContext);
    expect(kitElement(surface,'map-layer-select-terrain')?.label).toBe('Terrain Overrides');
    pressKit(surface,'map-layer-select-generated_base');
    surface=buildMapCanvasTool(toolContext);
    for(const action of ['rename','front','back']) expect(kitElement(surface,`map-layer-${action}-generated_base`)).toMatchObject({disabled:true});
  });

  it('supports keyboard layer ranges and safe bulk eye/lock actions', () => {
    const toolContext=context('/build/map');
    let surface=buildMapCanvasTool(toolContext);
    const selected=()=>kitElements(surface).filter(node=>node.id.startsWith('map-layer-select-')&&node.props['tone']==='success').map(node=>node.id);
    pressKit(surface,'map-layer-select-objects',{ctrlKey:true});
    surface=buildMapCanvasTool(toolContext);
    expect(selected()).toEqual(['map-layer-select-objects','map-layer-select-terrain']);
    pressKit(surface,'map-layers-bulk-visibility');
    surface=buildMapCanvasTool(toolContext);
    for(const id of ['objects','terrain']) expect(kitElement(surface,`map-layer-visible-${id}`)?.label).toContain('Show');
    pressKit(surface,'map-layers-bulk-visibility');
    surface=buildMapCanvasTool(toolContext);
    pressKit(surface,'map-layer-select-player_owned',{shiftKey:true});
    surface=buildMapCanvasTool(toolContext);
    expect(selected()).toEqual(['map-layer-select-player_owned','map-layer-select-gameplay','map-layer-select-objects']);
    pressKit(surface,'map-layers-bulk-lock');
    surface=buildMapCanvasTool(toolContext);
    expect(kitElement(surface,'map-layer-lock-player_owned')).toMatchObject({disabled:true});
    for(const id of ['gameplay','objects']) expect(kitElement(surface,`map-layer-lock-${id}`)).toMatchObject({disabled:false,props:{tone:'success'}});
    expect(kitElement(surface,'map-layers-bulk-lock')?.label).toBe('Unlock selected');
    pressKit(surface,'map-layers-bulk-lock');
    surface=buildMapCanvasTool(toolContext);
    pressKit(surface,'map-layer-select-canopy',{metaKey:true});
    surface=buildMapCanvasTool(toolContext); expect(selected()).toHaveLength(4);
    pressKit(surface,'map-layer-select-terrain');
    surface=buildMapCanvasTool(toolContext); expect(selected()).toEqual(['map-layer-select-terrain']);
    expect(kitElements(surface).some(({id})=>id.startsWith('map-layers-bulk-'))).toBe(false);
    const state=toolContext.controller.toolState<{readonly model:{canUndo():boolean;isLayerUserLocked(layer:'objects'|'gameplay'):boolean};readonly interaction:{snapshot():{readonly activeLayer:string}}}>
      ('map-canvas:live-island',()=>{throw new Error('missing map state');});
    expect(state.interaction.snapshot().activeLayer).toBe('terrain');
    expect(state.model.isLayerUserLocked('objects')).toBe(false);
    expect(state.model.isLayerUserLocked('gameplay')).toBe(false);
    expect(state.model.canUndo()).toBe(false);
  });

  it('offers labelled annotation anchor tools and disabled runtime-authority references', () => {
    const toolContext = context('/build/map/terrain-lab');
    buildMapCanvasTool(toolContext);
    type AnchorProbe = {
      readonly model: {
        selectWorkspace(workspace: 'objects'): void;
        toggleLayer(layer: 'anchors'): void;
      };
      readonly interaction: {
        selectLayer(layer: 'anchors'): void;
        snapshot(): { readonly selectedAnchorKind: 'poi' | 'label' | null };
      };
    };
    const state = toolContext.controller.toolState<AnchorProbe>('map-canvas:terrain-lab', () => {
      throw new Error('map state was not retained');
    });
    state.model.selectWorkspace('objects');
    state.interaction.selectLayer('anchors');
    let surface = buildMapCanvasTool(toolContext);

    expect(kitElement(surface, 'map-anchor-tool-poi')).toMatchObject({
      disabled: false,
      label: expect.stringContaining('exact projected terrain elevation'),
    });
    expect(kitElement(surface, 'map-anchor-tool-poi')).toMatchObject({
      kind: 'button', label: expect.stringContaining('Point of interest'),
    });
    expect(kitElement(surface, 'map-anchor-tool-label')).toMatchObject({
      kind: 'button', label: expect.stringContaining('Map label'),
    });
    for (const kind of ['spawn', 'portal', 'npc', 'resource']) {
      expect(kitElement(surface, `map-anchor-tool-${kind}`)).toMatchObject({
        disabled: true,
        label: expect.stringContaining('runtime authority not available'),
      });
    }

    pressKit(surface, 'map-anchor-tool-poi');
    surface = buildMapCanvasTool(toolContext);
    expect(state.interaction.snapshot().selectedAnchorKind).toBe('poi');
    expect(kitElement(surface, 'map-map-stats')?.label)
      .toContain('PLACE POI · CLICK MAP · ESC CANCEL');
    expect(surface.input?.keyDown?.({
      key: 'Escape', repeat: false, shiftKey: false, altKey: false,
      ctrlKey: false, metaKey: false,
    })).toBe(true);
    expect(state.interaction.snapshot().selectedAnchorKind).toBeNull();

    pressKit(surface, 'map-anchor-tool-label');
    state.model.toggleLayer('anchors');
    surface = buildMapCanvasTool(toolContext);
    expect(state.interaction.snapshot().selectedAnchorKind).toBeNull();
    expect(kitElement(surface, 'map-anchor-tool-label'))
      .toMatchObject({ disabled: true });
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
    pressKit(surface, 'map-layer-visible-terrain');
    surface = buildMapCanvasTool(toolContext);
    expect((kitElement(surface,'map-palette-list')!.props['items'] as {id:string;disabled?:boolean}[]).filter(({ id }) => id.startsWith('map-terrain-tool-'))
      .every(({ disabled }) => disabled)).toBe(true);

    pressKit(surface, 'map-layer-visible-terrain');
    pressKit(surface, 'map-layer-select-generated_base');
    surface = buildMapCanvasTool(toolContext);
    expect((kitElement(surface,'map-palette-list')!.props['items'] as {id:string;disabled?:boolean}[]).filter(({ id }) => id.startsWith('map-terrain-tool-'))
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

  it('restores map camera, workspace, tool, layers, visibility, and palette state by route/document', () => {
    const records = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, value); },
    });
    try {
      const smallControls = Object.freeze({ ...CONTROLS, height: 300 });
      const first = { ...context('/build/map'), controlsBounds: smallControls };
      let surface = buildMapCanvasTool(first);
      surface.input?.keyDown?.({ key: '7', repeat: false,
        shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      pressKit(surface, 'map-layer-visible-canopy');
      pressKit(surface, 'map-layer-lock-objects');
      pressKit(surface, 'map-layer-solo-gameplay');

      type Probe = {
        readonly model: {
          workspace(): string;
          isLayerEyeVisible(id: 'canopy'): boolean;
          isLayerUserLocked(id: 'objects'): boolean;
          soloLayer(): string | null;
        };
        readonly interaction: { snapshot(): { readonly camera: { readonly x: number; readonly y: number;
          readonly zoom: number }; readonly terrainTool: string; readonly activeLayer: string } };
        readonly search: { setValue(value: string): void; snapshot(): { readonly value: string } };
        readonly worldOutlinerSearch: { setValue(value: string): void; snapshot(): { readonly value: string } };
        readonly worldOutlinerState: { readonly expandedIds: readonly string[]; readonly selectedId: string | null };
        readonly leftView: string;
        paletteOffset: number;
      };
      const firstState = first.controller.toolState<Probe>('map-canvas:live-island', () => {
        throw new Error('map state was not retained');
      });
      firstState.search.setValue('e');
      surface = buildMapCanvasTool(first);
      const root=new UiRoot({scale:1});root.resize(95,320);root.mount(surface.kit!.controls!);root.arrange();
      const palette=root.entries().find(({element})=>element.id==='map-palette-list')!.element;
      scrollUiElement(palette,0,96);root.arrange();root.unmount(surface.kit!.controls!);root.dispose();
      surface.input?.wheel?.({ point: { x: WORKSPACE.x + 100, y: WORKSPACE.y + 100 },
        deltaX: 0, deltaY: -1, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      buildMapCanvasTool(first);
      const expectedCamera = firstState.interaction.snapshot().camera;
      expect(firstState.paletteOffset).toBeGreaterThan(0);
      chooseKit(surface,'map-left-view','World');
      surface = buildMapCanvasTool(first);
      firstState.worldOutlinerSearch.setValue('farm tree');
      buildMapCanvasTool(first);
      expect(firstState.leftView).toBe('world');
      expect(firstState.worldOutlinerState.expandedIds).toContain('space:0');

      const second = { ...context('/build/map'), controlsBounds: smallControls };
      buildMapCanvasTool(second);
      const secondState = second.controller.toolState<Probe>('map-canvas:live-island', () => {
        throw new Error('map state was not restored');
      });
      expect(secondState.model.workspace()).toBe('terrain');
      expect(secondState.interaction.snapshot()).toMatchObject({
        camera: expectedCamera, terrainTool: 'water', activeLayer: 'terrain',
      });
      expect(secondState.model.isLayerEyeVisible('canopy')).toBe(false);
      expect(secondState.model.isLayerUserLocked('objects')).toBe(true);
      expect(secondState.model.soloLayer()).toBe('gameplay');
      expect(secondState.search.snapshot().value).toBe('e');
      expect(secondState.paletteOffset).toBe(firstState.paletteOffset);
      expect(secondState.leftView).toBe('world');
      expect(secondState.worldOutlinerSearch.snapshot().value).toBe('farm tree');
      expect(secondState.worldOutlinerState.expandedIds).toContain('space:0');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses kit tileset editors and preserves datum edits and JSON drafts', () => {
    const toolContext=context('/build/tiles');let surface=buildTilesCanvasTool(toolContext);
    expect(surface.draw).toBeUndefined();
    const initial=String(kitElements(surface).find(node=>node.kind==='text'&&String(node.props['text']).startsWith('Datum '))?.props['text']);
    pressKit(surface,'tiles-datum-up');surface=buildTilesCanvasTool(toolContext);
    expect(kitElements(surface).find(node=>node.kind==='text'&&String(node.props['text']).startsWith('Datum '))?.props['text']).not.toBe(initial);
    pressKit(surface,'tiles-tabs:tab:json');surface=buildTilesCanvasTool(toolContext);
    const draft=kitElement(surface,'tiles-json')!.props['editor'] as CanvasTextEditor;
    const value=JSON.parse(draft.snapshot().value) as {baseDatum:number};
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
