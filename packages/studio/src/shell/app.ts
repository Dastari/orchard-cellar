import { studioLiveMapReadiness } from '../tools/map/verified-live-map.js';
import type { UiWorkbenchNavigation } from '@orchard/ui/studio';
import { bootstrapContentDefinitions, type FrameContentDefinition } from '@orchard/sim';
import { CUTE_FANTASY_ACTOR_CATALOG } from '@orchard/engine';
import { ui, uiFixed, UiRoot, UiElement, UiTextBridge, UiLabWorld, CanvasTextEditor, inspectUiElements, UI_ICON_CATALOG,
  loadUiKitArt, loadStudioSpatialArt, createUiFrameDesignerModel, studioToolIcon,
  type UiPoint, type UiRect, type UiKitArt, type UiWorkbenchRegion, type StudioSpatialArt } from '@orchard/ui/studio';
import { StudioShellController } from './controller.js';
import { studioLiveContentSnapshot } from './live-content-readiness.js';
import { StudioShortcutMap } from './shortcuts.js';
import { defaultStudioCanvasToolRegistry, type StudioCanvasToolRegistry } from './canvas-tool-registry.js';
import type { StudioCanvasToolSurface, StudioCanvasToolLifecycle, StudioCanvasToolPointerInput, StudioCanvasToolActionActivation } from './canvas-tool.js';
import { studioSelectionFields } from './canvas-inspector.js';
import { nextStudioSecondaryRoute } from './canvas-split.js';
import {
  closeStudioCanvasSplit,
  defaultStudioCanvasLayoutState,
  openStudioCanvasSplit,
  persistStudioCanvasLayoutState,
  resizeStudioCanvasSplit,
  restoreStudioCanvasLayoutState,
  rotateStudioCanvasSplit,
  selectStudioCanvasSecondary,
  studioCanvasNamedLayoutName,
  studioCanvasStateFromWorkspace,
  studioCanvasWorkspaceLayout,
  type StudioCanvasLayoutStorage,
} from './canvas-layout-state.js';
const DRAWER_WIDTHS_KEY = 'orchard-studio:canvas-drawer-widths';
const sameBounds = (a: UiRect,b: UiRect): boolean => a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;
const physical = (r: UiRect): UiRect => ({x:r.x*2,y:r.y*2,width:r.width*2,height:r.height*2});
export const STUDIO_CANVAS_MAX_BACKING_PIXELS = 4_194_304;

export function studioCanvasDevicePixelRatio(
  width: number,
  height: number,
  deviceRatio: number,
): number {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const pixelBudgetRatio = Math.sqrt(STUDIO_CANVAS_MAX_BACKING_PIXELS / (safeWidth * safeHeight));
  return Math.max(1, Math.min(2, deviceRatio, pixelBudgetRatio));
}

export function shouldToggleStudioGrid(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat'>,
  textEditorFocused: boolean,
): boolean {
  return !textEditorFocused && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    && !event.repeat && event.key.toLowerCase() === 'g';
}

export function shouldHoldStudioSpacePan(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>,
  textEditorFocused: boolean,
  spaceDragPan: boolean,
): boolean {
  return spaceDragPan && !textEditorFocused && event.key === ' '
    && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export function studioCanvasActionActivation(
  event: Pick<KeyboardEvent, 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): StudioCanvasToolActionActivation {
  return Object.freeze({ shiftKey: event.shiftKey, altKey: event.altKey,
    ctrlKey: event.ctrlKey, metaKey: event.metaKey });
}

export function shouldActivateStudioCanvasActionWithModifiers(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): boolean {
  return (event.key === 'Enter' || event.key === ' ')
    && (event.shiftKey || event.ctrlKey || event.metaKey);
}

/** Reconciles redraw-created surface descriptors without disposing retained
 * resources until their stable key actually leaves the composed scene. */
export function reconcileStudioToolLifecycles(
  current: ReadonlyMap<string, StudioCanvasToolLifecycle>,
  next: readonly StudioCanvasToolLifecycle[],
): Map<string, StudioCanvasToolLifecycle> {
  const mounted = new Map<string, StudioCanvasToolLifecycle>();
  for (const lifecycle of next) {
    if (mounted.has(lifecycle.key)) throw new Error(`studio_canvas_tool_lifecycle_duplicate:${lifecycle.key}`);
    mounted.set(lifecycle.key, lifecycle);
  }
  for (const [key, lifecycle] of current) {
    if (!mounted.has(key)) lifecycle.dispose();
  }
  return mounted;
}

/** Studio owns routes, models and spatial interactions; the kit owns UI paint,
 * layout, clipping, text editing and control input. */
export class StudioShellApp {
  readonly #shortcuts = new StudioShortcutMap();
  readonly #root = new UiRoot({ scale: 2, label: 'Orchard Studio', onInvalidate: () => this.schedule() });
  readonly #abort = new AbortController();
  #bridge: UiTextBridge | null = null;
  #observer: ResizeObserver | null = null;
  #art: StudioSpatialArt | null = null;
  #kitArt: UiKitArt | null = null;
  #kitLab: UiLabWorld | null = null;
  #frame: number | null = null;
  #disposed = false;
  #dirtyTools = true;
  #shellKey = '';
  #drawCount = 0;
  #regions: Partial<Record<UiWorkbenchRegion, UiRect>> = {};
  #controls = ui.flex({ width: 'grow' });
  #inspector = ui.flex({ width: 'grow' });
  #workspace = ui.stack({ width: 'grow', height: 'grow' });
  #secondary = ui.stack({ width: 'grow', height: 'grow' });
  #surface: StudioCanvasToolSurface | null = null;
  #secondarySurface: StudioCanvasToolSurface | null = null;
  #primaryBounds: UiRect | null = null;
  #secondaryBounds: UiRect | null = null;
  #mountedToolLifecycles = new Map<string, StudioCanvasToolLifecycle>();
  readonly #loadingTools = new Set<string>();
  #drawerWidths = { left: 270, right: 286 };
  #activeDrawer: 'controls' | 'inspector' | 'none' = 'controls';
  #toolInspectorPath: string | null = null;
  #toolControlsPath: string | null = null;
  #layoutState = defaultStudioCanvasLayoutState();
  #layoutRoute = '/build/map';
  #spaceHeld = false;
  #toolPointerOwner: number | null = null;
  #uiPointerOwner: number | null = null;
  #pendingFocusId: string | null = null;
  #pendingFocusSource: 'keyboard' | 'pointer' = 'keyboard';
  #palette: ReturnType<typeof ui.dialog> | null = null;
  constructor(private readonly canvas: HTMLCanvasElement, readonly controller: StudioShellController,
    private readonly canvasTools: StudioCanvasToolRegistry = defaultStudioCanvasToolRegistry) {}

  mount(): void {
    try { const saved = JSON.parse(sessionStorage.getItem(DRAWER_WIDTHS_KEY) ?? 'null') as { left?: unknown; right?: unknown } | null;
      if (saved && typeof saved.left === 'number' && typeof saved.right === 'number') this.#drawerWidths = { left: this.clampDrawer(saved.left), right: this.clampDrawer(saved.right) };
    } catch { /* Optional session storage. */ }
    this.controller.navigate(location.pathname === '/' ? '/build/map' : location.pathname);
    this.restoreLayoutSession(this.controller.activeRoute().path);
    const { signal } = this.#abort;
    this.canvas.tabIndex = 0; this.canvas.setAttribute('role','application'); this.canvas.style.touchAction = 'none';
    for (const type of ['down','move','up','cancel'] as const) this.canvas.addEventListener(`pointer${type}`, event => this.pointer(type, event as PointerEvent), { signal });
    this.canvas.addEventListener('pointerleave', () => this.#root.input.clearHover(), { signal });
    this.canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    this.canvas.addEventListener('keydown', this.keyDown, { signal });
    this.canvas.addEventListener('keyup', event => { if (event.key === ' ') this.#spaceHeld = false; }, { signal });
    this.canvas.addEventListener('wheel', this.wheel, { signal, passive: false });
    this.canvas.addEventListener('orchard:studio-inspect', event => { const read = (event as CustomEvent<unknown>).detail; if (typeof read === 'function') read({ route: this.controller.activeRoute().path, elements: inspectUiElements(this.#root.tree), regions: this.#regions, ...(this.#kitLab ? { lab: this.#kitLab.inspect() } : {}) }); }, { signal });
    window.addEventListener('popstate', () => { this.controller.navigate(location.pathname); this.restoreLayoutSession(this.controller.activeRoute().path); this.render(); }, { signal });
    window.addEventListener('resize', () => this.render(), { signal });
    window.addEventListener('blur', () => { this.#spaceHeld = false; this.#uiPointerOwner = null; this.#toolPointerOwner = null; }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.#spaceHeld = false; else this.render(); }, { signal });
    this.#observer = new ResizeObserver(() => this.render()); this.#observer.observe(this.canvas);
    void Promise.all([loadUiKitArt(), loadStudioSpatialArt()]).then(([art, spatialArt]) => {
      if (this.#disposed) return; this.#kitArt = art; this.#root.art = art; this.#art = spatialArt; this.render();
    }).catch((error: unknown) => { this.canvas.dataset['canvasError'] = String(error); });
    this.render();
  }
  dispose(): void {
    this.#disposed = true; this.#abort.abort(); this.#observer?.disconnect(); this.#bridge?.dispose(); this.#kitLab?.dispose();
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#root.dispose(); this.#mountedToolLifecycles = reconcileStudioToolLifecycles(this.#mountedToolLifecycles, []); this.canvas.style.touchAction = '';
  }
  render(): void { this.#dirtyTools = true; this.schedule(); }
  private schedule(): void {
    if (this.#disposed || document.hidden || this.#frame !== null) return;
    this.#frame = requestAnimationFrame(() => { this.#frame = null; this.draw(); });
  }
  private draw(): void {
    if (!this.#kitArt || !this.#art) return;
    const labContent = studioLiveContentSnapshot(this.controller.liveAdapter());
    if (this.controller.activeRoute().path === '/author/ui-lab'
      && (this.controller.session.snapshot().environment === 'sandbox' || this.controller.session.snapshot().phase === 'connected')
      && (labContent.mode === 'offline' || labContent.mode === 'ready')) {
      this.openLab(labContent.definitions); return;
    }
    if (this.#kitLab) { this.#kitLab.dispose(); this.#kitLab = null; this.#shellKey = ''; }
    this.#bridge ??= new UiTextBridge(this.canvas, () => this.#root.focus.current, event => { this.keyDown(event); return event.defaultPrevented; }, element => {
      const canvas = this.canvas.getBoundingClientRect(); return { x: canvas.x + element.rect.x * 2, y: canvas.y + element.rect.y * 2, width: element.rect.width * 2, height: element.rect.height * 2 };
    }, () => this.schedule());
    const start = performance.now(), width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    const dpr = studioCanvasDevicePixelRatio(width,height,devicePixelRatio);
    if (this.canvas.width !== Math.round(width*dpr)) this.canvas.width = Math.round(width*dpr);
    if (this.canvas.height !== Math.round(height*dpr)) this.canvas.height = Math.round(height*dpr);
    this.#root.resize(width,height,dpr);
    const route = this.controller.activeRoute(), key = JSON.stringify([route.path,route.access,this.controller.session.snapshot().role,this.controller.session.snapshot().phase,this.controller.session.snapshot().mapRevision,this.controller.liveAdapter()?.view().mapDocument?.contentHash,this.controller.liveAdapter()?.view().synchronizing,this.controller.session.snapshot().error,this.#layoutState.splitOpen,this.#layoutState.direction,this.#layoutState.secondaryPath,this.#activeDrawer]);
    if (key !== this.#shellKey) { this.#shellKey = key; this.buildShell(); this.#dirtyTools = true; }
    this.#root.arrange();
    if (this.#dirtyTools && this.#uiPointerOwner === null) { this.#dirtyTools = false; this.buildTools(); this.#root.arrange(); }
    if (this.#pendingFocusId) { const target = this.#root.entries().find(({ element }) => element.id === this.#pendingFocusId)?.element;
      if (target) this.#root.focus.set(target,this.#pendingFocusSource); this.#pendingFocusId = null; this.#pendingFocusSource = 'keyboard'; }
    const context = this.canvas.getContext('2d', { alpha: false }); if (!context) throw new Error('studio_shell_canvas_context_unavailable');
    this.#root.draw(context); this.#bridge.sync();
    this.canvas.dataset['canvasReady'] = 'true'; this.canvas.dataset['canvasRoute'] = route.path;
    this.canvas.dataset['canvasActionCount'] = String(this.#root.entries().filter(({element})=>element.focusable).length);
    this.canvas.dataset['canvasFrameCount'] = String(++this.#drawCount); this.canvas.dataset['canvasLastFrameMs'] = (performance.now()-start).toFixed(2);
    this.canvas.dataset['canvasLeftDrawerWidth'] = String(this.#drawerWidths.left); this.canvas.dataset['canvasRightDrawerWidth'] = String(this.#drawerWidths.right);
    this.canvas.dataset['canvasSplit'] = this.#layoutState.splitOpen ? this.#layoutState.direction : 'closed'; this.canvas.dataset['canvasSplitRatio'] = this.#layoutState.ratio.toFixed(3);
    this.canvas.dataset['canvasSecondaryRoute'] = this.#layoutState.secondaryPath ?? ''; this.canvas.dataset['canvasPalette'] = this.#palette?.visible ? 'open' : 'closed';
    this.canvas.setAttribute('aria-label', `Orchard Studio${this.#root.focus.current ? `: ${this.#root.focus.current.label}` : ''}`);
    if (this.#root.entries().some(({element})=>element.hooks.animated && element.clip.width>0 && element.clip.height>0)) this.schedule();
  }
  private buildShell(): void {
    for (const child of [...this.#root.tree.children]) child.dispose(); this.#palette = null; this.#regions = {};
    this.#controls = ui.flex({ width: 'grow', height: 'grow' }); this.#inspector = ui.flex({ width: 'grow',height:'grow' });
    this.#workspace = ui.stack({ width: 'grow', height: 'grow' }); this.#secondary = ui.stack({ width: 'grow', height: 'grow' });
    const session = this.controller.session.snapshot();
    const mapReadiness = this.controller.activeRoute().path === '/build/map' ? studioLiveMapReadiness(this.controller.liveAdapter()?.view().mapDocument) : null;
    if (session.environment !== 'sandbox' && (session.phase !== 'connected' || mapReadiness !== null)) {
      this.#surface?.input?.keyDown?.({key:'Escape',repeat:false,shiftKey:false,altKey:false,ctrlKey:false,metaKey:false});
      this.#secondarySurface?.input?.keyDown?.({key:'Escape',repeat:false,shiftKey:false,altKey:false,ctrlKey:false,metaKey:false});
      this.#toolPointerOwner = null;
      this.#mountedToolLifecycles = reconcileStudioToolLifecycles(this.#mountedToolLifecycles, []);
      this.#surface = null; this.#secondarySurface = null;
      this.#primaryBounds = null; this.#secondaryBounds = null;
      this.#root.mount(ui.flex({ width:'grow', height:'grow', align:'center', justify:'center', gap:12 }, [
        ui.text(session.phase === 'error' ? 'Unable to open live Studio' : 'Connecting to live Studio', {role:'header'}),
        ui.text(session.error ?? (session.phase === 'connected' ? mapReadiness ?? 'Loading live Studio' : 'Sign in to load the live map')),
        ...(session.phase === 'connecting' ? [] : [ui.button({ id:'studio-retry', label:'Retry sign in',
          onPress:()=>{void this.controller.connectExplicit().catch(()=>undefined);} })]),
      ]));
      return;
    }
    const route = this.controller.activeRoute();
    const observe = (node: UiElement, side: 'primary' | 'secondary') => new UiElement({ kind: 'studio-workspace', style: { width: 'grow', height: 'grow', display: 'stack' }, children: [node], onArrange: element => {
      const rect = physical(element.rect), previous = side === 'primary' ? this.#primaryBounds : this.#secondaryBounds;
      if (side === 'primary') this.#primaryBounds = rect; else this.#secondaryBounds = rect;
      if (!previous || !sameBounds(rect,previous)) this.#dirtyTools = true;
    } });
    const primary = observe(this.#workspace,'primary'), secondary = observe(this.#secondary,'secondary');
    const workspace = this.#layoutState.splitOpen ? ui.splitPane({ id: 'workspace-split', label: 'Workspace split', first: primary,
      second: ui.flex({ height:'grow', width:'grow', gap:4 }, [ui.flex({direction:'row',gap:4},[
        ui.button({label:'Next tool',size:'sm',onPress:()=>this.cycleSecondary(route.tool.id)}),
        ui.button({label:'Rotate',size:'sm',onPress:()=>{this.#layoutState=rotateStudioCanvasSplit(this.#layoutState);this.persistLayoutSession();this.render();}}),
      ]),secondary]), direction: this.#layoutState.direction, ratio: this.#layoutState.ratio,
      onResize: ratio => { this.#layoutState=resizeStudioCanvasSplit(this.#layoutState,ratio);this.persistLayoutSession();this.render(); },
    }) : primary;
    this.#root.mount(ui.flex({width:'grow',height:'grow'},[ui.workbench({ navigation: this.routeNavigation(),
      workspace, activeDrawer:this.#activeDrawer,
      controls:{title:'',surface:'thin',fill:['map','items','npc-studio','dialogue-graph','quest-editor','world-tables','pack-studio','object'].includes(route.tool.id),visible:this.#toolControlsPath===route.path,width:uiFixed(this.#drawerWidths.left/2),...(route.tool.id==='map'?{minWidth:uiFixed(216),maxWidth:uiFixed(480)}:{}),content:this.#controls},
      inspector:{title:route.tool.id==='map'?'':'Selection',surface:route.tool.id==='map'?'unframed':'thin',fill:['map','items','npc-studio','dialogue-graph','quest-editor','world-tables','pack-studio'].includes(route.tool.id),visible:this.#toolInspectorPath===route.path||this.#activeDrawer==='inspector',width:uiFixed(this.#drawerWidths.right/2),content:this.#inspector},
      onRegionArrange:(name,rect)=>{this.#regions[name]=physical(rect);this.#dirtyTools=true;},
      onRegionVisibility:(name,visible)=>{if(!visible)delete this.#regions[name];this.#dirtyTools=true;},
      onDrawerResize:(side,width)=>{this.#drawerWidths[side==='controls'?'left':'right']=width.size*2;this.persistDrawers();this.render();},
    })]));
  }
  private buildTools(): void {
    const route = this.controller.activeRoute(), controls = this.#regions.controls, inspector = this.#regions.inspector, bounds = this.#primaryBounds;
    if (!bounds) return;
    const focus = this.#root.focus.current?.id ?? null, focusSource = this.#root.focus.inputSource;
    const toolControls = this.contentBounds(this.#controls, controls ?? {x:bounds.x,y:bounds.y,width:180,height:bounds.height});
    const toolInspector = this.contentBounds(this.#inspector, inspector ?? {x:bounds.x+bounds.width-180,y:bounds.y,width:180,height:bounds.height});
    this.#surface = this.buildTool(route,toolControls,toolInspector,bounds);
    const controlsPath = this.#surface?.kit?.controls ? route.path : null;
    if (this.#toolControlsPath !== controlsPath) {
      this.#toolControlsPath = controlsPath; this.#shellKey = ''; this.schedule();
    }
    const inspectorPath = this.#surface?.kit?.inspector ? route.path : null;
    if (this.#toolInspectorPath !== inspectorPath) {
      this.#toolInspectorPath = inspectorPath; this.#shellKey = ''; this.schedule();
    }
    this.replace(this.#workspace, this.surfaceWorkspace(this.#surface,bounds,toolControls,toolInspector));
    this.replace(this.#controls, this.#surface?.kit?.controls ? [this.#surface.kit.controls] : [ui.text('Loading controls')]);
    this.replace(this.#inspector, this.#surface?.kit?.inspector ? [this.#surface.kit.inspector] : studioSelectionFields(this.controller.selection.current()).map(text=>ui.text(text)));
    this.#secondarySurface=null;
    if (this.#layoutState.splitOpen && this.#secondaryBounds) {
      const secondary = this.secondaryRoute(route.tool.id);
      if (secondary) this.#secondarySurface=this.buildTool(secondary,toolControls,toolInspector,this.#secondaryBounds);
      this.replace(this.#secondary,this.surfaceWorkspace(this.#secondarySurface,this.#secondaryBounds,toolControls,toolInspector));
    }
    this.#mountedToolLifecycles=reconcileStudioToolLifecycles(this.#mountedToolLifecycles,[this.#surface?.lifecycle,this.#secondarySurface?.lifecycle].filter((entry):entry is StudioCanvasToolLifecycle=>entry!==undefined));
    if (this.#pendingFocusId === null) { this.#pendingFocusId = focus; this.#pendingFocusSource = focusSource; }
  }
  private contentBounds(node: UiElement, fallback: UiRect): UiRect {
    return node.rect.width>0 ? {x:node.rect.x*2,y:node.rect.y*2,width:node.rect.width*2,height:Math.max(80,fallback.y+fallback.height-node.rect.y*2)} : fallback;
  }
  private replace(node:UiElement, children: readonly UiElement[]):void { for(const child of [...node.children]) child.dispose();node.replaceChildren(children); }
  private buildTool(route:ReturnType<StudioShellController['activeRoute']>,controlsBounds:UiRect,inspectorBounds:UiRect,workspaceBounds:UiRect):StudioCanvasToolSurface|null {
    const builder=this.canvasTools.builder(route.tool.id);
    if(builder) return builder({occludedBounds:[this.#regions.controls??controlsBounds,this.#regions.inspector??inspectorBounds],route,controller:this.controller,controlsBounds,inspectorBounds,workspaceBounds,bounds:workspaceBounds,invalidate:()=>this.render()});
    if(!this.#loadingTools.has(route.tool.id)) { this.#loadingTools.add(route.tool.id);void this.canvasTools.load(route.tool.id).then(()=>this.render()).catch((error:unknown)=>{this.canvas.dataset['canvasToolError']=String(error);}).finally(()=>this.#loadingTools.delete(route.tool.id)); }
    return null;
  }
  private surfaceWorkspace(surface:StudioCanvasToolSurface|null,bounds:UiRect,controls:UiRect,inspector:UiRect):UiElement[] {
    const controlsRegion = this.#regions.controls ?? controls, inspectorRegion = this.#regions.inspector ?? inspector;
    if (surface?.kit?.workspace) surface.kit.workspace.setStyle({ position: 'absolute', width: undefined, height: undefined, inset: {
      left: uiFixed(this.#regions.controls ? Math.max(0, (controlsRegion.x + controlsRegion.width - bounds.x) / 2 + 8) : 4),
      right: uiFixed(this.#regions.inspector ? Math.max(0, (bounds.x + bounds.width - inspectorRegion.x) / 2 + 8) : 4), top: 4, bottom: 4,
    } });
    surface?.kit?.overlays?.setStyle({ position: 'absolute', width: undefined, height: undefined, inset: {
      left: uiFixed(this.#regions.controls ? Math.max(0, (controlsRegion.x + controlsRegion.width - bounds.x) / 2 + 8) : 4),
      right: uiFixed(this.#regions.inspector ? Math.max(0, (bounds.x + bounds.width - inspectorRegion.x) / 2 + 8) : 4), top: 0, bottom: 0,
    } });
    return [ui.frame({style:'grey_plain',layout:{width:'grow',height:'grow'}}),...(surface?.kit?.workspace ? [surface.kit.workspace] : surface ? [
      ui.viewport({label:'Spatial workspace',coordinateScale:2,background:this.controller.gridVisible()?'checkerboard':'none',render:context=>{if(this.#art)surface.draw?.(context,this.#art);}}),
    ]:[ui.text('Loading workspace')]),...(surface?.kit?.annotations?[surface.kit.annotations]:[]),...(surface?.kit?.overlays?[surface.kit.overlays]:[])];
  }
  private routeNavigation(): readonly UiWorkbenchNavigation[] {
    return this.controller.tools.routes(this.controller.session.snapshot().role)
      .filter((candidate,index,all)=>all.findIndex(({tool})=>tool.id===candidate.tool.id)===index).map(candidate=>({ id:candidate.tool.id,label:studioToolIcon(candidate.tool.id).label,
        icon:{fantasy:UI_ICON_CATALOG.find(icon=>icon.index===studioToolIcon(candidate.tool.id).frame)!.name},selected:candidate.tool.id===this.controller.activeRoute().tool.id,onPress:()=>this.navigate(candidate.path) }));
  }
  private navigate(path:string):void { if(!this.controller.navigate(path))return;this.restoreLayoutSession(this.controller.activeRoute().path);history.pushState(null,'',path);this.render(); }
  private point(event:Pick<MouseEvent,'clientX'|'clientY'>):UiPoint {const r=this.canvas.getBoundingClientRect();return{x:(event.clientX-r.x)*this.canvas.clientWidth/Math.max(1,r.width),y:(event.clientY-r.y)*this.canvas.clientHeight/Math.max(1,r.height)};}
  private pointer(type:'down'|'move'|'up'|'cancel',event:PointerEvent):void {
    if(this.#kitLab)return;const point=this.point(event);
    if(type==='down'){this.canvas.focus();this.canvas.setPointerCapture(event.pointerId);}
    const input:StudioCanvasToolPointerInput={point,button:event.button,pointerId:event.pointerId,spaceHeld:this.#spaceHeld,...studioCanvasActionActivation(event)};
    if(this.#toolPointerOwner===event.pointerId){const method=type==='move'?'pointerMove':type==='cancel'?'pointerCancel':'pointerUp';this.#surface?.input?.[method]?.(input);this.render();}
    else {
      const handled=this.#root.pointer({type,point:{x:point.x/2,y:point.y/2},pointerId:event.pointerId,button:event.button,...studioCanvasActionActivation(event)});
      if(handled){event.preventDefault();if(type==='down')this.#uiPointerOwner=event.pointerId;}
      else {const method=type==='down'?'pointerDown':type==='move'?'pointerMove':type==='cancel'?'pointerCancel':'pointerUp';if(this.#surface?.input?.[method]?.(input)){if(type==='down')this.#toolPointerOwner=event.pointerId;event.preventDefault();this.render();}}
    }
    if(type==='up'||type==='cancel'){this.#uiPointerOwner=null;this.#toolPointerOwner=null;if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);this.schedule();}
  }
  private readonly wheel=(event:WheelEvent):void=>{
    if(this.#kitLab)return;const point=this.point(event);
    if(this.#root.wheel({point:{x:point.x/2,y:point.y/2},deltaX:event.deltaX/2,deltaY:event.deltaY/2})){event.preventDefault();return;}
    if(this.#surface?.input?.wheel?.({point,deltaX:event.deltaX,deltaY:event.deltaY,...studioCanvasActionActivation(event)})){event.preventDefault();this.render();}
  };
  private readonly keyDown=(event:KeyboardEvent):void=>{
    if(this.#kitLab)return;const editing=this.#root.focus.current?.props['editor'] instanceof CanvasTextEditor;
    const shortcut=this.#shortcuts.actionFor(event);
    if(shortcut==='palette.open'||shortcut==='search.everywhere'){event.preventDefault();this.openPalette();return;}
    if(shortcut?.startsWith('mode.')){const route=this.controller.tools.routes(this.controller.session.snapshot().role).find(({tool})=>tool.mode===shortcut.slice(5));if(route)this.navigate(route.path);event.preventDefault();return;}
    if(shouldToggleStudioGrid(event,editing)){this.controller.toggleGrid();this.render();event.preventDefault();return;}
    if(shouldHoldStudioSpacePan(event,editing,this.#surface?.input?.spaceDragPan===true)&&!this.#root.focus.current){this.#spaceHeld=true;event.preventDefault();return;}
    if(this.#root.key(event)){event.preventDefault();return;}
    if(this.#surface?.input?.keyDown?.({key:event.key,repeat:event.repeat,...studioCanvasActionActivation(event)})){event.preventDefault();this.render();}
  };
  private openPalette():void {
    this.#palette?.dispose();const results=ui.flex({gap:4,width:'grow'});
    const search=(query:string)=>this.replace(results,this.controller.palette.search(query).slice(0,12).map(result=>ui.button({label:result.label,onPress:()=>{const path=this.controller.routeForCommand(result.id);this.#palette?.close();if(path)this.navigate(path);}})));
    const query=ui.input({label:'Command search',onChange:search});search('');
    this.#palette=ui.dialog({title:'Command palette',children:[ui.flex({gap:8,width:'grow',height:'grow'},[query,ui.scrollArea({width:'grow',height:'grow'},[results])])]});
    this.#root.mount(this.#palette);this.#palette.open(this.#root.focus.current??undefined);query.requestFocus();this.schedule();
  }
  private openLab(liveDefinitions: ReturnType<typeof studioLiveContentSnapshot>['definitions']):void {
    this.#bridge?.dispose();this.#bridge=null;
    if(!this.#kitLab){
      for (const child of [...this.#root.tree.children]) child.dispose(); this.#root.focus.set(null); this.#root.input.dispose(); this.#surface = null; this.#shellKey = '';
      this.#mountedToolLifecycles=reconcileStudioToolLifecycles(this.#mountedToolLifecycles,[]);
      const definitions=liveDefinitions??bootstrapContentDefinitions();
      this.#kitLab=new UiLabWorld(this.canvas,{art:this.#kitArt!,actors:CUTE_FANTASY_ACTOR_CATALOG,
        frameDefinitions:definitions.filter((definition):definition is FrameContentDefinition=>definition.kind==='frame'),
        createFrameDesigner:definition=>{const adapter=this.controller.liveAdapter(),view=adapter?.view();const access=!view?.connected?'anonymous':this.controller.activeRoute().access==='write'?'write':'read_only';
          const content=studioLiveContentSnapshot(adapter);
          const all=content.mode==='ready'&&content.definitions!==null?content.definitions:definitions;
          const current=all.find((entry):entry is FrameContentDefinition=>entry.kind==='frame'&&entry.id===definition.id)??definition;
          return createUiFrameDesignerModel({definition:current,definitions:all,access,baseRevision:view?.contentHead?.revision??0n,...(access==='write'&&adapter?.publishContentChangeSet?{createPublishAdapter:()=>({publishContentChangeSet:request=>adapter.publishContentChangeSet!(request)})}:{})});},
        navigation:this.routeNavigation(),
      });
    }
    this.#kitLab.resize();this.#kitLab.invalidate();
  }
  private clampDrawer(value: number): number { return Math.max(236, Math.min(960, Math.round(value))); }
  private persistDrawers(): void {
    try { sessionStorage.setItem(DRAWER_WIDTHS_KEY, JSON.stringify(this.#drawerWidths)); } catch { /* non-persistent sandbox */ }
  }
  private secondaryRoute(primaryToolId: string): ReturnType<StudioShellController['activeRoute']> | null {
    const routes = this.controller.tools.routes(this.controller.session.snapshot().role);
    const retained = routes.find(({ path, tool }) => path === this.#layoutState.secondaryPath
      && tool.id !== primaryToolId);
    const route = retained ?? nextStudioSecondaryRoute(routes, primaryToolId, null);
    if (route !== null && route.path !== this.#layoutState.secondaryPath) {
      this.#layoutState = selectStudioCanvasSecondary(this.#layoutState, route.path);
      this.persistLayoutSession();
    }
    return route;
  }
  private cycleSecondary(primaryToolId: string): void {
    const route = nextStudioSecondaryRoute(this.controller.tools.routes(this.controller.session.snapshot().role),
      primaryToolId, this.#layoutState.secondaryPath);
    if (route !== null) {
      this.#layoutState = selectStudioCanvasSecondary(this.#layoutState, route.path);
      this.persistLayoutSession(); this.render();
    }
  }
  private layoutStorage(): StudioCanvasLayoutStorage | null {
    try { return sessionStorage; } catch { return null; }
  }
  private restoreLayoutSession(route: string): void {
    this.#layoutRoute = route;
    this.#layoutState = restoreStudioCanvasLayoutState(this.layoutStorage(), route);
    this.#shellKey = '';
  }
  private persistLayoutSession(): void {
    persistStudioCanvasLayoutState(this.layoutStorage(), this.#layoutRoute, this.#layoutState);
  }
  private toggleSplit(primaryToolId: string): void {
    if (this.#layoutState.splitOpen) {
      this.#layoutState = closeStudioCanvasSplit(this.#layoutState);
    } else {
      const route = this.secondaryRoute(primaryToolId);
      if (route === null) {
        this.controller.notifications.push(
          'error', 'Split workspace unavailable', 'No second accessible Studio tool is available.',
        );
        this.render();
        return;
      }
      this.#layoutState = openStudioCanvasSplit(this.#layoutState, route.path);
    }
    this.persistLayoutSession(); this.render();
  }
  private saveNamedLayout(route: ReturnType<StudioShellController['activeRoute']>): void {
    const name = studioCanvasNamedLayoutName(route.tool.label, route.path);
    const current = this.controller.layouts.load(name, route.tool.mode);
    const docks = current.docks.map((dock) => Object.freeze({
      ...dock,
      size: dock.placement === 'left' ? this.#drawerWidths.left
        : dock.placement === 'right' ? this.#drawerWidths.right : dock.size,
    }));
    this.controller.layouts.save(Object.freeze({
      ...current,
      name,
      docks: Object.freeze(docks),
      workspace: studioCanvasWorkspaceLayout(this.#layoutState, route.path),
    }));
    this.controller.notifications.push('success', 'Canvas layout saved', name);
    this.render();
  }
  private restoreNamedLayout(route: ReturnType<StudioShellController['activeRoute']>): void {
    const name = studioCanvasNamedLayoutName(route.tool.label, route.path);
    const saved = this.controller.layouts.layouts(route.tool.mode).find((layout) => layout.name === name);
    if (saved === undefined) {
      this.controller.notifications.push('error', 'Canvas layout unavailable', `No saved layout named ${name}.`);
      this.render();
      return;
    }
    const state = studioCanvasStateFromWorkspace(saved.workspace, route.path);
    if (state === null) {
      this.controller.notifications.push('error', 'Canvas layout unavailable', `${name} belongs to another route.`);
      this.render();
      return;
    }
    const left = saved.docks.find(({ placement }) => placement === 'left')?.size;
    const right = saved.docks.find(({ placement }) => placement === 'right')?.size;
    this.#drawerWidths = {
      left: left === undefined ? this.#drawerWidths.left : this.clampDrawer(left),
      right: right === undefined ? this.#drawerWidths.right : this.clampDrawer(right),
    };
    this.#layoutState = state;
    this.#shellKey = "";
    this.persistDrawers(); this.persistLayoutSession();
    this.controller.notifications.push('success', 'Canvas layout restored', name);
    this.render();
  }
  private resetDrawer(side: 'left' | 'right'): void {
    this.#drawerWidths = { ...this.#drawerWidths, [side]: side === 'left' ? 270 : 286 };
    this.#shellKey = ''; this.persistDrawers(); this.render();
  }
}
