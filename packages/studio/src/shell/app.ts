import {
  CanvasFocusManager,
  CanvasTextEditor,
  UiInputRouter,
  drawStudioCanvasShell,
  drawStudioCanvasShellNodes,
  drawStudioCanvasTable,
  hitStudioCanvasTable,
  layoutUiAnchoredRect,
  layoutUiFlex,
  layoutUiFrameSlots,
  loadStudioCanvasShellArt,
  studioCanvasFrameContentRect,
  studioToolIcon,
  scrollStudioCanvasTable,
  widget,
  type FantasyButtonGlyph,
  type StudioCanvasShellArt,
  type StudioCanvasShellNode,
  type StudioCanvasTableScrollCommand,
  type CanvasFocusRole,
  type UiPointerEvent,
  type WidgetNode,
} from '@orchard/ui';
import { StudioShellController } from './controller.js';
import { layoutStudioShellRegions } from './canvas-shell-layout.js';
import { StudioShortcutMap } from './shortcuts.js';
import { defaultStudioCanvasToolRegistry, type StudioCanvasToolRegistry } from './canvas-tool-registry.js';
import type {
  StudioCanvasToolActionActivation,
  StudioCanvasToolInput,
  StudioCanvasToolKeyInput,
  StudioCanvasToolLifecycle,
  StudioCanvasToolPointerInput,
  StudioCanvasToolTable,
  StudioCanvasToolWheelInput,
} from './canvas-tool.js';
import { studioSelectionFields } from './canvas-inspector.js';
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
import {
  layoutStudioCanvasSplit,
  nextStudioSecondaryRoute,
  studioCanvasSplitRatioAtPoint,
} from './canvas-split.js';

interface CanvasAction {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly role: CanvasFocusRole;
  readonly node: StudioCanvasShellNode;
  readonly activate: (input?: StudioCanvasToolActionActivation) => void;
  readonly keyDown?: (input: StudioCanvasToolKeyInput) => string | null;
}

interface CanvasScene {
  readonly nodes: readonly StudioCanvasShellNode[];
  readonly actions: readonly CanvasAction[];
  readonly widgets: WidgetNode;
  readonly tables: readonly StudioCanvasToolTable[];
  readonly textEditors: readonly { readonly id: string; readonly editor: CanvasTextEditor }[];
  readonly input: StudioCanvasToolInput | null;
  readonly lifecycles: readonly StudioCanvasToolLifecycle[];
  readonly draws: readonly { readonly bounds: Bounds;
    readonly draw: (context: CanvasRenderingContext2D, art: StudioCanvasShellArt) => void }[];
}

type Bounds = StudioCanvasShellNode['bounds'];

const inside = (point: { readonly x: number; readonly y: number }, bounds: Bounds): boolean => point.x >= bounds.x
  && point.y >= bounds.y && point.x <= bounds.x + bounds.width && point.y <= bounds.y + bounds.height;
const sameBounds = (left: Bounds, right: Bounds): boolean => left.x === right.x && left.y === right.y
  && left.width === right.width && left.height === right.height;
const DRAWER_WIDTHS_KEY = 'orchard-studio:canvas-drawer-widths';
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

/** Semantically meaningful interactive-tool canvas. Input is sampled into the
 * controller/focus state, invalidation schedules one full redraw, and no idle
 * animation loop exists. The page contains no secondary UI element. */
export class StudioShellApp {
  readonly #shortcuts = new StudioShortcutMap();
  readonly #focus = new CanvasFocusManager();
  readonly #paletteEditor = new CanvasTextEditor({ maxLength: 80, onChange: () => this.render() });
  #art: StudioCanvasShellArt | null = null;
  #scene: CanvasScene | null = null;
  #hoveredId: string | null = null;
  #pressedId: string | null = null;
  #paletteOpen = false;
  #pendingFocusId: string | null = null;
  #layoutState = defaultStudioCanvasLayoutState();
  #layoutRoute = '/build/map';
  #drawFrame: number | null = null;
  #drawCount = 0;
  #resizeFrame: number | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #disposed = false;
  readonly #loadingTools = new Set<string>();
  #toolRailScroll = 0;
  #toolRailMaximumScroll = 0;
  #toolRailViewport: Bounds | null = null;
  #focusedTableId: string | null = null;
  #drawerWidths = { left: 270, right: 286 };
  #drawerDrag: { readonly side: 'left' | 'right'; readonly startX: number; readonly startWidth: number } | null = null;
  #splitDrag: { readonly bounds: Bounds } | null = null;
  #splitBounds: Bounds | null = null;
  #toolPointerOwner: number | null = null;
  #actionActivation: StudioCanvasToolActionActivation | undefined;
  #spaceHeld = false;
  #mountedToolLifecycles = new Map<string, StudioCanvasToolLifecycle>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly controller: StudioShellController,
    private readonly canvasTools: StudioCanvasToolRegistry = defaultStudioCanvasToolRegistry,
  ) {}

  mount(): void {
    try {
      const stored = JSON.parse(sessionStorage.getItem(DRAWER_WIDTHS_KEY) ?? 'null') as { left?: unknown; right?: unknown } | null;
      if (stored !== null && typeof stored.left === 'number' && typeof stored.right === 'number') {
        this.#drawerWidths = { left: this.clampDrawer(stored.left), right: this.clampDrawer(stored.right) };
      }
    } catch { sessionStorage.removeItem(DRAWER_WIDTHS_KEY); }
    this.controller.navigate(location.pathname === '/' ? '/build/map' : location.pathname);
    this.restoreLayoutSession(this.controller.activeRoute().path);
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', 'Orchard Studio canvas workbench');
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.canvas.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('beforeinput', this.onBeforeInput);
    this.canvas.addEventListener('compositionstart', this.onCompositionStart);
    this.canvas.addEventListener('compositionupdate', this.onCompositionUpdate);
    this.canvas.addEventListener('compositionend', this.onCompositionEnd);
    this.canvas.addEventListener('paste', this.onPaste);
    this.canvas.addEventListener('copy', this.onCopy);
    this.canvas.addEventListener('cut', this.onCut);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('popstate', this.onPopState);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.#resizeObserver = new ResizeObserver(this.onResize);
    this.#resizeObserver.observe(this.canvas);
    void loadStudioCanvasShellArt().then((art) => { if (!this.#disposed) { this.#art = art; this.render(); } })
      .catch((error: unknown) => { this.canvas.dataset['canvasError'] = error instanceof Error ? error.message : String(error); });
    this.render();
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#drawFrame !== null) cancelAnimationFrame(this.#drawFrame);
    if (this.#resizeFrame !== null) cancelAnimationFrame(this.#resizeFrame);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('beforeinput', this.onBeforeInput);
    this.canvas.removeEventListener('compositionstart', this.onCompositionStart);
    this.canvas.removeEventListener('compositionupdate', this.onCompositionUpdate);
    this.canvas.removeEventListener('compositionend', this.onCompositionEnd);
    this.canvas.removeEventListener('paste', this.onPaste);
    this.canvas.removeEventListener('copy', this.onCopy);
    this.canvas.removeEventListener('cut', this.onCut);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('popstate', this.onPopState);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#toolPointerOwner = null;
    this.#splitDrag = null;
    this.#splitBounds = null;
    this.#spaceHeld = false;
    this.#mountedToolLifecycles = reconcileStudioToolLifecycles(this.#mountedToolLifecycles, []);
    this.canvas.style.cursor = '';
  }

  render(): void {
    if (this.#disposed || document.hidden || this.#drawFrame !== null) return;
    this.#drawFrame = requestAnimationFrame(() => { this.#drawFrame = null; this.draw(); });
  }

  private draw(): void {
    if (this.#art === null) return;
    const drawStartedAt = performance.now();
    const width = Math.max(1, Math.floor(this.canvas.clientWidth));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight));
    const dpr = studioCanvasDevicePixelRatio(width, height, devicePixelRatio);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    }
    const context = this.canvas.getContext('2d', { alpha: false });
    if (context === null) throw new Error('studio_shell_canvas_context_unavailable');
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.imageSmoothingEnabled = false;
    const scene = this.buildScene(width, height);
    this.#mountedToolLifecycles = reconcileStudioToolLifecycles(
      this.#mountedToolLifecycles,
      scene.lifecycles,
    );
    this.#scene = scene;
    const overlayNodes = this.#scene.nodes.filter(({ id }) => id.startsWith('palette-') || id === 'active-tooltip');
    const backgroundNodes = this.#scene.nodes.filter(({ kind }) => kind === 'alpha_grid');
    const foregroundNodes = this.#scene.nodes.filter((node) => !overlayNodes.includes(node) && !backgroundNodes.includes(node));
    drawStudioCanvasShell(context, this.#art, { width, height,
      production: this.controller.session.snapshot().environment === 'production', nodes: backgroundNodes });
    for (const layer of this.#scene.draws) {
      context.save();
      context.beginPath();
      context.rect(layer.bounds.x, layer.bounds.y, layer.bounds.width, layer.bounds.height);
      context.clip();
      layer.draw(context, this.#art);
      context.restore();
    }
    drawStudioCanvasShellNodes(context, this.#art, foregroundNodes);
    for (const table of this.#scene.tables) drawStudioCanvasTable(context, this.#art, table.layout);
    drawStudioCanvasShellNodes(context, this.#art, overlayNodes);
    const splitResize = this.#splitDrag !== null || this.#hoveredId === 'workspace-split-edge';
    this.canvas.style.cursor = splitResize
      ? this.#layoutState.direction === 'row' ? 'col-resize' : 'row-resize'
      : this.#drawerDrag !== null || this.#hoveredId?.startsWith('drawer-edge-') === true
        ? 'col-resize' : '';
    this.canvas.dataset['canvasReady'] = 'true';
    this.canvas.dataset['canvasRoute'] = this.controller.activeRoute().path;
    this.canvas.dataset['canvasActionCount'] = String(this.#scene.actions.length);
    this.canvas.dataset['canvasLeftDrawerWidth'] = String(this.#drawerWidths.left);
    this.canvas.dataset['canvasRightDrawerWidth'] = String(this.#drawerWidths.right);
    this.canvas.dataset['canvasRailScroll'] = String(this.#toolRailScroll);
    this.canvas.dataset['canvasPalette'] = this.#paletteOpen ? 'open' : 'closed';
    this.canvas.dataset['canvasSplit'] = this.#layoutState.splitOpen ? this.#layoutState.direction : 'closed';
    this.canvas.dataset['canvasSplitRatio'] = this.#layoutState.ratio.toFixed(3);
    this.canvas.dataset['canvasSecondaryRoute'] = this.#layoutState.splitOpen
      ? this.#layoutState.secondaryPath ?? '' : '';
    this.#drawCount += 1;
    this.canvas.dataset['canvasFrameCount'] = String(this.#drawCount);
    this.canvas.dataset['canvasLastFrameMs'] = (performance.now() - drawStartedAt).toFixed(2);
    const focus = this.#focus.snapshot();
    this.canvas.setAttribute('aria-label', focus.focusedLabel === null ? 'Orchard Studio canvas workbench'
      : `Orchard Studio. ${focus.focusedRole ?? 'control'}: ${focus.focusedLabel}. Press Enter to activate.`);
  }

  private buildScene(width: number, height: number): CanvasScene {
    const session = this.controller.session.snapshot();
    const route = this.controller.activeRoute();
    const layout = layoutStudioShellRegions(width, height, this.#drawerWidths);
    const nodes: StudioCanvasShellNode[] = [];
    const actions: CanvasAction[] = [];
    const tables: StudioCanvasToolTable[] = [];
    const textEditors: { readonly id: string; readonly editor: CanvasTextEditor }[] = [];
    const lifecycles: StudioCanvasToolLifecycle[] = [];
    let input: StudioCanvasToolInput | null = null;
    const draws: { readonly bounds: Bounds;
      readonly draw: (context: CanvasRenderingContext2D, art: StudioCanvasShellArt) => void }[] = [];
    const root = widget('root', 'studio-root').setBounds(layout.viewport);
    const label = (id: string, text: string, bounds: Bounds, heading = false): void => {
      nodes.push({ id, kind: heading ? 'heading' : 'label', bounds, label: text });
    };
    const action = (id: string, text: string, bounds: Bounds, activate: () => void,
      options: { readonly active?: boolean; readonly disabled?: boolean; readonly tone?: StudioCanvasShellNode['tone'];
        readonly tab?: boolean; readonly glyph?: FantasyButtonGlyph;
        readonly icon?: { readonly frame: number; readonly outline?: number }; readonly clip?: Bounds } = {}): void => {
      const disabled = options.disabled === true;
      const iconOnly = options.glyph !== undefined || options.icon !== undefined;
      const node: StudioCanvasShellNode = { id, kind: options.tab ? 'tab' : 'button', bounds,
        label: iconOnly ? undefined : text, glyph: options.glyph,
        icon: options.icon, clip: options.clip,
        state: disabled ? 'disabled' : this.#pressedId === id ? 'pressed' : options.active ? 'active'
          : this.#hoveredId === id ? 'hover' : 'idle', tone: options.tone };
      const value: CanvasAction = { id, label: text, disabled, role: options.tab ? 'tab' : 'button', node, activate };
      nodes.push(node); actions.push(value);
      root.add(widget('button', id, { enabled: !disabled, pointerMode: 'capture', props: { label: text },
        onPointer: (event) => this.activatePointer(value, event) }).setBounds(bounds));
    };
    const panel = (id: string, kind: 'wood_panel' | 'parchment_panel', bounds: Bounds): void => { nodes.push({ id, kind, bounds }); };
    const resizeEdge = (id: 'drawer-edge-left' | 'drawer-edge-right' | 'workspace-split-edge',
      text: string, bounds: Bounds,
      activate: () => void): void => {
      // This semantic node is intentionally invisible: its bounds overlap an
      // authored drawer border or shared pane edge, consuming no layout space.
      const node: StudioCanvasShellNode = { id, kind: 'label', bounds };
      const value: CanvasAction = { id, label: text, disabled: false, role: 'button', node, activate };
      nodes.push(node); actions.push(value);
      root.add(widget('button', id, { pointerMode: 'capture', props: { label: text, role: 'button' },
        onPointer: (event) => this.activatePointer(value, event) }).setBounds(bounds));
    };

    panel('global-nav', 'wood_panel', layout.globalNav);
    const railViewport = studioCanvasFrameContentRect(layout.globalNav, 'wood_panel');
    this.#toolRailViewport = railViewport;
    const toolRoutes = this.controller.tools.routes(session.role).filter((candidate, index, all) =>
      all.findIndex(({ tool }) => tool.id === candidate.tool.id) === index);
    const visibleRailCount = Math.max(1, Math.floor((railViewport.height + 8) / 52));
    this.#toolRailMaximumScroll = Math.max(0, toolRoutes.length - visibleRailCount);
    this.#toolRailScroll = Math.min(this.#toolRailScroll, this.#toolRailMaximumScroll);
    const visibleRoutes = toolRoutes.slice(this.#toolRailScroll, this.#toolRailScroll + visibleRailCount);
    const railRects = layoutUiFlex(railViewport, visibleRoutes.map((_candidate, index) => ({
      id: `rail-${index}`, minSize: { width: 40, height: 44 }, main: { mode: 'fixed' as const, size: 44 },
    })), { direction: 'column', gap: 8, align: 'stretch' });
    visibleRoutes.forEach((candidate, index) => {
      const icon = studioToolIcon(candidate.tool.id);
      action(`rail-${candidate.tool.id}`, icon.label,
      railRects[index]!, () => this.navigate(candidate.path), {
        active: candidate.tool.id === route.tool.id, tab: true, icon, clip: railViewport,
      });
    });

    resizeEdge('drawer-edge-left', 'Resize tool controls drawer. Arrow keys adjust; Enter resets.', layout.leftResizeHandle,
      () => this.resetDrawer('left'));
    resizeEdge('drawer-edge-right', 'Resize selection inspector. Arrow keys adjust; Enter resets.', layout.rightResizeHandle,
      () => this.resetDrawer('right'));

    panel('tool-drawer', 'parchment_panel', layout.toolDrawer);
    const drawerSlots = layoutUiFrameSlots(layout.toolDrawer, 'wood_parchment', [
      { id: 'title', minSize: { width: 1, height: 42 }, main: { mode: 'fixed', size: 42 } },
      { id: 'controls', minSize: { width: 1, height: 44 }, grow: 1 },
    ], { direction: 'column', gap: 6 });
    const [toolTitle, layoutSave, layoutRestore, splitToggle] = layoutUiFlex(drawerSlots.slots.title!, [
      { minSize: { width: 40, height: 40 }, grow: 1 },
      ...Array.from({ length: 3 }, () => ({
        minSize: { width: 40, height: 40 }, main: { mode: 'fixed' as const, size: 40 },
      })),
    ], { direction: 'row', gap: 1, align: 'stretch' });
    nodes.push({ id: 'tool-title', kind: 'ribbon', bounds: toolTitle!,
      label: route.tool.label.toUpperCase() });
    const namedLayout = studioCanvasNamedLayoutName(route.tool.label, route.path);
    action('layout-save', `Save named layout ${namedLayout}`, layoutSave!,
      () => this.saveNamedLayout(route), { glyph: 'down' });
    const layoutAvailable = this.controller.layouts.layouts(route.tool.mode)
      .some(({ name }) => name === namedLayout);
    action('layout-restore', layoutAvailable
      ? `Restore named layout ${namedLayout}` : `No saved layout named ${namedLayout}`,
    layoutRestore!, () => this.restoreNamedLayout(route), { glyph: 'up', disabled: !layoutAvailable });
    action('layout-split-toggle', this.#layoutState.splitOpen
      ? 'Close the secondary Canvas pane; reopening restores its route and size'
      : 'Open a secondary Canvas pane for another Studio tool', splitToggle!,
    () => this.toggleSplit(route.tool.id), { glyph: 'square', active: this.#layoutState.splitOpen });

    panel('inspector', 'parchment_panel', layout.inspectorDrawer);
    const inspectorContent = studioCanvasFrameContentRect(layout.inspectorDrawer, 'parchment_panel');

    const toolBounds = layout.workingCanvas;
    const split = this.#layoutState.splitOpen
      ? layoutStudioCanvasSplit(toolBounds, this.#layoutState.direction, this.#layoutState.ratio)
      : null;
    this.#splitBounds = split === null ? null : toolBounds;
    const primaryBounds = split?.primary ?? toolBounds;
    if (this.controller.gridVisible()) {
      nodes.push({ id: 'workspace-background', kind: 'alpha_grid', bounds: primaryBounds, clip: primaryBounds });
    }
    if (!this.appendToolSurface(route.tool.id, route, drawerSlots.slots.controls!, inspectorContent, primaryBounds,
      nodes, actions, tables, textEditors, lifecycles, draws, root, (surfaceInput) => { input = surfaceInput ?? null; })) {
      label('tool-surface-label', 'LOADING WORKSPACE', primaryBounds, true);
    }
    if (split !== null) {
      const secondaryRoute = this.secondaryRoute(route.tool.id);
      const [secondaryToolbar, secondaryBounds] = layoutUiFlex(split.secondary, [
        { minSize: { width: 44, height: 44 }, main: { mode: 'fixed', size: 44 } },
        { minSize: { width: 44, height: 44 }, grow: 1 },
      ], { direction: 'column', gap: 4, align: 'stretch' });
      if (this.controller.gridVisible()) {
        nodes.push({ id: 'workspace-secondary-background', kind: 'alpha_grid', bounds: secondaryBounds!, clip: secondaryBounds! });
      }
      const [routeButton, directionButton] = layoutUiFlex(secondaryToolbar!, [
        { minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
        { minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
      ], { direction: 'row', gap: 4, align: 'stretch' });
      if (secondaryRoute !== null) {
        const icon = studioToolIcon(secondaryRoute.tool.id);
        action('split-secondary-route', `Secondary workspace: ${icon.label}. Activate to cycle.`, routeButton!,
          () => this.cycleSecondary(route.tool.id), { icon });
      }
      action('split-direction', `Split ${this.#layoutState.direction === 'row' ? 'horizontally' : 'vertically'}. Activate to rotate.`, directionButton!, () => {
        this.#layoutState = rotateStudioCanvasSplit(this.#layoutState);
        this.persistLayoutSession(); this.render();
      }, { glyph: 'key_r', active: this.#layoutState.direction === 'column' });
      if (secondaryRoute !== null && !this.appendToolSurface(secondaryRoute.tool.id, secondaryRoute,
        drawerSlots.slots.controls!, inspectorContent, secondaryBounds!, nodes, actions, tables, textEditors,
        lifecycles, draws, root,
        undefined, true)) {
        label('secondary-loading', 'LOADING SECONDARY WORKSPACE', secondaryBounds!, true);
      }
      resizeEdge('workspace-split-edge',
        'Resize split panes. Arrow keys adjust; Enter restores an even split.',
      split.handle, () => {
        this.#layoutState = resizeStudioCanvasSplit(this.#layoutState, 0.5);
        this.persistLayoutSession(); this.render();
      });
    }

    if (route.tool.id !== 'map') {
      const inspectorSlots = layoutUiFrameSlots(layout.inspectorDrawer, 'wood_parchment', [
        { id: 'title', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
        { id: 'kind', minSize: { width: 1, height: 46 }, main: { mode: 'fixed', size: 46 } },
        { id: 'selection', minSize: { width: 1, height: 40 }, grow: 1 },
      ], { direction: 'column', gap: 7 });
      nodes.push({ id: 'inspector-title', kind: 'ribbon', bounds: inspectorSlots.slots.title!, label: 'SELECTION' });
      const selected = this.controller.selection.current();
      nodes.push({ id: 'detail-kind', kind: 'field', bounds: inspectorSlots.slots.kind!,
        label: `KIND  ${selected.kind}`, textScale: layout.compact ? 1 : 2 });
      const selectionFields = studioSelectionFields(selected);
      const selectionRects = layoutUiFlex(inspectorSlots.slots.selection!, selectionFields.map(() => ({
        minSize: { width: 1, height: 42 }, main: { mode: 'fixed' as const, size: 42 },
      })), { direction: 'column', gap: 6, align: 'stretch' });
      selectionFields.forEach((field, index) => nodes.push({ id: `detail-selection-${index}`, kind: 'field',
        bounds: selectionRects[index]!, clip: inspectorSlots.slots.selection!, label: field,
        textScale: layout.compact ? 1 : 2 }));
    }

    if (this.#paletteOpen) this.palette(nodes, actions, textEditors, root, layout.viewport, action, panel, label);
    this.#focus.setTargets(actions.map(({ id, label: actionLabel, role, disabled, activate }) => ({
      id, label: actionLabel, role, disabled, activate,
    })));
    if (this.#pendingFocusId !== null) {
      this.#focus.focus(this.#pendingFocusId);
      this.#pendingFocusId = null;
    }
    const focusedId = this.#focus.snapshot().focusedId;
    const focusedNodeIndex = nodes.findIndex(({ id }) => id === focusedId);
    if (focusedNodeIndex >= 0) nodes[focusedNodeIndex] = { ...nodes[focusedNodeIndex]!, state: 'active' };
    const tooltipAction = actions.find(({ id }) => id === this.#hoveredId && !id.startsWith('drawer-edge-'))
      ?? actions.find(({ id, node }) => id === focusedId && (node.icon !== undefined || node.glyph !== undefined));
    if (tooltipAction !== undefined) this.addTooltip(nodes, tooltipAction, layout.viewport);
    return { nodes, actions, widgets: root, tables, textEditors, input, lifecycles, draws };
  }

  private palette(nodes: StudioCanvasShellNode[], actions: CanvasAction[],
    textEditors: { readonly id: string; readonly editor: CanvasTextEditor }[], root: WidgetNode,
    viewport: Bounds, action: (id: string, text: string, bounds: Bounds, activate: () => void,
      options?: { readonly active?: boolean; readonly disabled?: boolean; readonly tone?: StudioCanvasShellNode['tone'];
        readonly tab?: boolean; readonly glyph?: FantasyButtonGlyph;
        readonly icon?: { readonly frame: number; readonly outline?: number }; readonly clip?: Bounds }) => void,
    panel: (id: string, kind: 'wood_panel' | 'parchment_panel', bounds: Bounds) => void,
    label: (id: string, text: string, bounds: Bounds, heading?: boolean) => void): void {
    const frame = layoutUiAnchoredRect(viewport, { width: Math.min(640, viewport.width - 24), height: Math.min(520, viewport.height - 24) }, {
      targetAnchor: 'center', selfAnchor: 'center', constrainTo: viewport,
    });
    panel('palette-frame', 'parchment_panel', frame);
    const results = this.controller.palette.search(this.#paletteEditor.snapshot().value).slice(0, 8);
    const slots = layoutUiFrameSlots(frame, 'wood_parchment', [
      { id: 'title', minSize: { width: 1, height: 34 }, main: { mode: 'fixed', size: 34 } },
      { id: 'query', minSize: { width: 1, height: 44 }, main: { mode: 'fixed', size: 44 } },
      { id: 'results', minSize: { width: 1, height: 44 }, grow: 1 },
    ], { direction: 'column', gap: 8 });
    label('palette-title', 'COMMAND PALETTE', slots.slots.title!, true);
    const paletteSnapshot = this.#paletteEditor.snapshot();
    const paletteDisplay = paletteSnapshot.focused
      ? `${paletteSnapshot.value.slice(0, paletteSnapshot.focus)}|${paletteSnapshot.value.slice(paletteSnapshot.focus)}`
      : paletteSnapshot.value;
    const queryNode: StudioCanvasShellNode = { id: 'palette-query', kind: 'field', bounds: slots.slots.query!,
      label: `> ${paletteDisplay || 'TYPE TO SEARCH'}` };
    const queryAction: CanvasAction = { id: 'palette-query', label: 'Command search', role: 'textbox',
      disabled: false, node: queryNode, activate: () => this.#paletteEditor.focus() };
    nodes.push(queryNode); actions.push(queryAction);
    textEditors.push({ id: queryAction.id, editor: this.#paletteEditor });
    root.add(widget('panel', queryAction.id, { pointerMode: 'capture', props: { label: queryAction.label, role: 'textbox' },
      onPointer: (event) => this.activatePointer(queryAction, event) }).setBounds(slots.slots.query!));
    const resultRects = layoutUiFlex(slots.slots.results!, results.map((result) => ({
      id: result.id, minSize: { width: 1, height: 44 }, main: { mode: 'fixed' as const, size: 44 },
    })), { direction: 'column', gap: 6, align: 'stretch' });
    results.forEach((result, index) => action(`palette-${index}`, result.label.toUpperCase(), resultRects[index]!, () => {
      const nextRoute = this.controller.routeForCommand(result.id); if (nextRoute !== null) this.navigate(nextRoute);
      this.closePalette(); this.render();
    }, { clip: slots.slots.results! }));
  }

  private addTooltip(nodes: StudioCanvasShellNode[], action: CanvasAction, viewport: Bounds): void {
    const railTooltip = action.node.icon !== undefined;
    const railControl = railTooltip;
    const tooltipWidth = 280;
    const frame = layoutUiAnchoredRect(action.node.bounds, { width: tooltipWidth, height: 64 }, {
      targetAnchor: railControl ? 'right' : 'bottom', selfAnchor: railControl ? 'left' : 'top',
      offset: railControl ? { x: 8, y: 0 } : { x: 0, y: 6 }, constrainTo: viewport,
    });
    nodes.push({ id: 'active-tooltip', kind: 'tooltip', bounds: frame, label: action.label.toUpperCase() });
  }

  private appendToolSurface(
    toolId: string,
    route: ReturnType<StudioShellController['activeRoute']>,
    controlsBounds: Bounds,
    inspectorBounds: Bounds,
    bounds: Bounds,
    nodes: StudioCanvasShellNode[],
    actions: CanvasAction[],
    tables: StudioCanvasToolTable[],
    textEditors: { readonly id: string; readonly editor: CanvasTextEditor }[],
    lifecycles: StudioCanvasToolLifecycle[],
    draws: { readonly bounds: Bounds;
      readonly draw: (context: CanvasRenderingContext2D, art: StudioCanvasShellArt) => void }[],
    root: WidgetNode,
    captureInput?: (input: StudioCanvasToolInput | undefined) => void,
    workspaceOnly = false,
  ): boolean {
    const builder = this.canvasTools.builder(toolId);
    if (builder === null) {
      if (!this.#loadingTools.has(toolId)) {
        this.#loadingTools.add(toolId);
        void this.canvasTools.load(toolId).then(() => {
          this.#loadingTools.delete(toolId);
          this.render();
        }).catch((error: unknown) => {
          this.#loadingTools.delete(toolId);
          this.canvas.dataset['canvasToolError'] = error instanceof Error ? error.message : String(error);
          this.render();
        });
      }
      return false;
    }
    const surface = builder({ bounds, controlsBounds, inspectorBounds, workspaceBounds: bounds,
      route, controller: this.controller, invalidate: () => this.render() });
    captureInput?.(surface.input);
    if (surface.lifecycle !== undefined) lifecycles.push(surface.lifecycle);
    const prefix = `${toolId}-`;
    for (const node of surface.nodes.slice(0, 200)) {
      if (!node.id.startsWith(prefix)) throw new Error(`studio_canvas_tool_node_id_invalid:${node.id}`);
      if ((node.kind === 'wood_panel' || node.kind === 'parchment_panel')
        && (sameBounds(node.bounds, controlsBounds) || sameBounds(node.bounds, bounds))) continue;
      const nodeCenter = { x: node.bounds.x + node.bounds.width / 2, y: node.bounds.y + node.bounds.height / 2 };
      if (workspaceOnly && (inside(nodeCenter, controlsBounds) || inside(nodeCenter, inspectorBounds))) continue;
      const nestedKind = node.kind === 'wood_panel' || node.kind === 'parchment_panel' ? 'thin_panel' : node.kind;
      const clip = inside(nodeCenter, controlsBounds) ? controlsBounds
        : inside(nodeCenter, inspectorBounds) ? inspectorBounds : bounds;
      nodes.push({ ...node, kind: nestedKind, clip: node.clip ?? clip });
    }
    for (const toolAction of surface.actions.slice(0, 200)) {
      if (!toolAction.id.startsWith(prefix)) throw new Error(`studio_canvas_tool_action_id_invalid:${toolAction.id}`);
      const actionCenter = { x: toolAction.bounds.x + toolAction.bounds.width / 2,
        y: toolAction.bounds.y + toolAction.bounds.height / 2 };
      if (workspaceOnly && (inside(actionCenter, controlsBounds) || inside(actionCenter, inspectorBounds))) continue;
      const clip = inside(actionCenter, controlsBounds) ? controlsBounds
        : inside(actionCenter, inspectorBounds) ? inspectorBounds : bounds;
      const node = nodes.find(({ id }) => id === toolAction.id) ?? {
        id: toolAction.id, kind: toolAction.role === 'tab' ? 'tab' : toolAction.role === 'textbox' ? 'field' : 'button',
        bounds: toolAction.bounds, clip, label: toolAction.label,
        state: toolAction.disabled === true ? 'disabled' : 'idle',
      } satisfies StudioCanvasShellNode;
      if (!nodes.some(({ id }) => id === node.id)) nodes.push(node);
      const action: CanvasAction = { id: toolAction.id, label: toolAction.label, role: toolAction.role,
        disabled: toolAction.disabled === true, node, activate: toolAction.activate,
        ...(toolAction.keyDown === undefined ? {} : { keyDown: toolAction.keyDown }) };
      actions.push(action);
      root.add(widget(toolAction.role === 'textbox' ? 'panel' : 'button', toolAction.id, {
        enabled: !action.disabled, pointerMode: 'capture', props: { label: action.label, role: action.role },
        onPointer: (event) => this.activatePointer(action, event),
      }).setBounds(toolAction.bounds));
    }
    for (const table of surface.tables?.slice(0, 8) ?? []) {
      if (!table.id.startsWith(prefix)) throw new Error(`studio_canvas_tool_table_id_invalid:${table.id}`);
      const tableCenter = { x: table.layout.bounds.x + table.layout.bounds.width / 2,
        y: table.layout.bounds.y + table.layout.bounds.height / 2 };
      if (workspaceOnly && !inside(tableCenter, bounds)) continue;
      tables.push(table);
    }
    for (const textEditor of surface.textEditors?.slice(0, 24) ?? []) {
      if (!textEditor.id.startsWith(prefix)) throw new Error(`studio_canvas_tool_text_id_invalid:${textEditor.id}`);
      if (workspaceOnly && !actions.some(({ id }) => id === textEditor.id)) continue;
      textEditors.push(textEditor);
    }
    if (surface.draw !== undefined) draws.push({ bounds, draw: surface.draw });
    return true;
  }

  private openPalette(): void {
    this.#paletteOpen = true;
    this.#paletteEditor.setValue('');
    this.#paletteEditor.focus();
    this.#pendingFocusId = 'palette-query';
  }

  private closePalette(): void {
    this.#paletteOpen = false;
    this.#paletteEditor.blur();
    this.#paletteEditor.setValue('');
    this.#pendingFocusId = null;
  }

  private syncTextFocus(): void {
    const focusedId = this.#focus.snapshot().focusedId;
    for (const textEditor of this.#scene?.textEditors ?? []) {
      if (textEditor.id === focusedId) textEditor.editor.focus();
      else textEditor.editor.blur();
    }
  }

  private activeTextEditor(): CanvasTextEditor | null {
    const focusedId = this.#focus.snapshot().focusedId;
    return this.#scene?.textEditors.find(({ id }) => id === focusedId)?.editor ?? null;
  }

  private navigate(path: string): void {
    if (!this.controller.navigate(path)) return;
    this.restoreLayoutSession(this.controller.activeRoute().path);
    history.pushState(null, '', path); this.#focus.focusFirst(); this.render();
  }

  private activatePointer(action: CanvasAction, event: UiPointerEvent): boolean {
    if (event.kind === 'pointer_down') { this.#pressedId = action.id; this.#focus.focus(action.id); this.syncTextFocus(); this.render(); return true; }
    if (event.kind === 'pointer_up') {
      this.#pressedId = null;
      if (!action.disabled) action.activate(this.#actionActivation);
      this.render();
      return true;
    }
    return false;
  }

  private pointer(event: Pick<MouseEvent, 'clientX' | 'clientY'>): { readonly x: number; readonly y: number } {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * this.canvas.clientWidth / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) * this.canvas.clientHeight / Math.max(1, bounds.height) };
  }

  private toolPointer(event: PointerEvent, point: StudioCanvasToolPointerInput['point']): StudioCanvasToolPointerInput {
    return { point, button: event.button, pointerId: event.pointerId, spaceHeld: this.#spaceHeld, shiftKey: event.shiftKey,
      altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
  }

  private toolWheel(event: WheelEvent, point: { readonly x: number; readonly y: number }): StudioCanvasToolWheelInput {
    return { point, deltaX: event.deltaX, deltaY: event.deltaY, shiftKey: event.shiftKey,
      altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
  }

  private toolKey(event: KeyboardEvent): StudioCanvasToolKeyInput {
    return { key: event.key, repeat: event.repeat, shiftKey: event.shiftKey,
      altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.#actionActivation = studioCanvasActionActivation(event);
    this.canvas.focus(); this.canvas.setPointerCapture(event.pointerId);
    const point = this.pointer(event);
    const resizeEdge = this.#scene?.actions.find(({ id, node }) => id.startsWith('drawer-edge-') && inside(point, node.bounds));
    if (resizeEdge !== undefined) {
      const side = resizeEdge.id === 'drawer-edge-left' ? 'left' : 'right';
      this.#drawerDrag = { side, startX: point.x, startWidth: this.#drawerWidths[side] };
      this.#focus.focus(resizeEdge.id); this.render(); return;
    }
    const splitEdge = this.#scene?.actions.find(({ id, node }) => id === 'workspace-split-edge'
      && inside(point, node.bounds));
    if (splitEdge !== undefined && this.#splitBounds !== null) {
      this.#splitDrag = { bounds: this.#splitBounds };
      this.#focus.focus(splitEdge.id); this.render(); return;
    }
    const table = this.#scene?.tables.find(({ layout }) => inside(point, layout.viewport));
    this.#focusedTableId = table?.id ?? null;
    if (this.#scene === null || table !== undefined) return;
    if (new UiInputRouter(this.#scene.widgets).routePointer({ kind: 'pointer_down', point, button: event.button })) return;
    if (this.#scene.input?.pointerDown?.(this.toolPointer(event, point)) === true) {
      this.#toolPointerOwner = event.pointerId;
      event.preventDefault(); this.render();
    }
  };
  private readonly onPointerMove = (event: PointerEvent): void => {
    const point = this.pointer(event);
    if (this.#drawerDrag !== null) {
      const delta = point.x - this.#drawerDrag.startX;
      const width = this.#drawerDrag.startWidth + (this.#drawerDrag.side === 'left' ? delta : -delta);
      this.#drawerWidths = { ...this.#drawerWidths, [this.#drawerDrag.side]: this.clampDrawer(width) };
      this.render(); return;
    }
    if (this.#splitDrag !== null) {
      this.#layoutState = resizeStudioCanvasSplit(this.#layoutState,
        studioCanvasSplitRatioAtPoint(
          this.#splitDrag.bounds,
          this.#layoutState.direction,
          point,
        ));
      this.render(); return;
    }
    if (this.#toolPointerOwner === event.pointerId) {
      if (this.#scene?.input?.pointerMove?.(this.toolPointer(event, point)) === true) event.preventDefault();
      this.render(); return;
    }
    const resizeTarget = this.#scene?.actions.find(({ id, node }) => (
      id.startsWith('drawer-edge-') || id === 'workspace-split-edge'
    ) && inside(point, node.bounds));
    const next = resizeTarget?.id
      ?? this.#scene?.actions.find(({ node }) => inside(point, node.bounds))?.id ?? null;
    if (next !== this.#hoveredId) { this.#hoveredId = next; this.render(); }
    if (this.#scene === null || this.#scene.tables.some(({ layout }) => inside(point, layout.viewport))) return;
    if (new UiInputRouter(this.#scene.widgets).routePointer({ kind: 'pointer_move', point, button: event.button })) return;
    if (this.#scene.input?.pointerMove?.(this.toolPointer(event, point)) === true) {
      event.preventDefault(); this.render();
    }
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    this.#actionActivation = studioCanvasActionActivation(event);
    if (this.#splitDrag !== null) {
      this.#splitDrag = null; this.persistLayoutSession(); this.render();
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (this.#drawerDrag !== null) {
      this.#drawerDrag = null; this.persistDrawers(); this.render();
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (this.#toolPointerOwner === event.pointerId) {
      this.#toolPointerOwner = null;
      if (this.#scene?.input?.pointerUp?.(this.toolPointer(event, this.pointer(event))) === true) event.preventDefault();
      this.render();
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (this.#scene !== null) {
      const point = this.pointer(event);
      const table = this.#scene.tables.find(({ layout }) => inside(point, layout.viewport));
      const hit = table === undefined ? null : hitStudioCanvasTable(table.layout, point);
      if (hit !== null) { table?.onHit?.(hit); this.render(); }
      if (table === undefined
        && !new UiInputRouter(this.#scene.widgets).routePointer({ kind: 'pointer_up', point, button: event.button })
        && this.#scene.input?.pointerUp?.(this.toolPointer(event, point)) === true) {
        event.preventDefault(); this.render();
      }
    }
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };
  private readonly onPointerCancel = (event: PointerEvent): void => {
    const wasResizing = this.#drawerDrag !== null;
    const wasSplitResizing = this.#splitDrag !== null;
    const wasToolOwned = this.#toolPointerOwner === event.pointerId;
    if (wasToolOwned) this.#toolPointerOwner = null;
    this.#pressedId = null; this.#drawerDrag = null; this.#splitDrag = null; this.#actionActivation = undefined;
    if (!wasResizing && !wasSplitResizing && (wasToolOwned || this.#toolPointerOwner === null)
      && this.#scene?.input?.pointerCancel?.(this.toolPointer(event, this.pointer(event))) === true) {
      event.preventDefault(); this.render();
    }
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); this.render();
  };
  private readonly onDoubleClick = (event: MouseEvent): void => {
    const point = this.pointer(event);
    const resizeEdge = this.#scene?.actions.find(({ id, node }) => id.startsWith('drawer-edge-') && inside(point, node.bounds));
    if (resizeEdge !== undefined) this.resetDrawer(resizeEdge.id === 'drawer-edge-left' ? 'left' : 'right');
    const splitEdge = this.#scene?.actions.find(({ id, node }) => id === 'workspace-split-edge'
      && inside(point, node.bounds));
    if (splitEdge !== undefined) {
      this.#layoutState = resizeStudioCanvasSplit(this.#layoutState, 0.5);
      this.persistLayoutSession(); this.render();
    }
  };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const editor = this.activeTextEditor();
    const focusedComposite = this.#scene?.actions.find(({ id }) => (
      id === this.#focus.snapshot().focusedId
    ))?.keyDown !== undefined;
    if (!focusedComposite
      && shouldHoldStudioSpacePan(event, editor !== null, this.#scene?.input?.spaceDragPan === true)) {
      this.#spaceHeld = true;
      event.preventDefault();
      return;
    }
    if (shouldToggleStudioGrid(event, editor !== null)) {
      event.preventDefault(); this.controller.toggleGrid(); this.render(); return;
    }
    const shortcut = this.#shortcuts.actionFor(event);
    if (shortcut === 'palette.open' || shortcut === 'search.everywhere') {
      event.preventDefault(); this.openPalette(); this.render(); return;
    }
    if (shortcut?.startsWith('mode.') === true) {
      event.preventDefault(); const mode = shortcut.slice(5);
      const route = this.controller.tools.routes(this.controller.session.snapshot().role).find(({ tool }) => tool.mode === mode);
      if (route !== undefined) this.navigate(route.path); return;
    }
    if (this.#paletteOpen && event.key === 'Escape') {
      event.preventDefault(); this.closePalette(); this.render(); return;
    }
    const drawerSide = this.#focus.snapshot().focusedId === 'drawer-edge-left' ? 'left'
      : this.#focus.snapshot().focusedId === 'drawer-edge-right' ? 'right' : null;
    if (drawerSide !== null && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const screenDelta = event.key === 'ArrowLeft' ? -16 : 16;
      const widthDelta = drawerSide === 'left' ? screenDelta : -screenDelta;
      this.#drawerWidths = { ...this.#drawerWidths,
        [drawerSide]: this.clampDrawer(this.#drawerWidths[drawerSide] + widthDelta) };
      this.persistDrawers(); this.render(); return;
    }
    if (this.#focus.snapshot().focusedId === 'workspace-split-edge'
      && (event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        || event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter')) {
      const relevant = this.#layoutState.direction === 'row'
        ? event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Enter'
        : event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter';
      if (relevant) {
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -0.05
          : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 0.05 : 0;
        this.#layoutState = resizeStudioCanvasSplit(this.#layoutState,
          delta === 0 ? 0.5 : this.#layoutState.ratio + delta);
        this.persistLayoutSession(); this.render(); return;
      }
    }
    if (editor !== null && editor.handleKeyDown(event)) {
      event.preventDefault(); this.render(); return;
    }
    const tableCommand: StudioCanvasTableScrollCommand | null = event.key === 'ArrowUp' ? 'line_up'
      : event.key === 'ArrowDown' ? 'line_down' : event.key === 'PageUp' ? 'page_up'
        : event.key === 'PageDown' ? 'page_down' : event.key === 'Home' ? 'home' : event.key === 'End' ? 'end' : null;
    const table = tableCommand === null ? undefined : this.#scene?.tables.find(({ id }) => id === this.#focusedTableId);
    if (table !== undefined && tableCommand !== null && table.onScroll !== undefined) {
      event.preventDefault(); table.onScroll(tableCommand, scrollStudioCanvasTable(table.layout, tableCommand)); this.render(); return;
    }
    const focusedAction = this.#scene?.actions.find(({ id }) => id === this.#focus.snapshot().focusedId);
    const requestedFocus = focusedAction?.keyDown?.(this.toolKey(event)) ?? null;
    if (requestedFocus !== null) {
      event.preventDefault();
      this.#pendingFocusId = requestedFocus;
      this.render();
      return;
    }
    if (shouldActivateStudioCanvasActionWithModifiers(event)) {
      const focused = this.#focus.snapshot().focusedId;
      const action = this.#scene?.actions.find(({ id }) => id === focused);
      if (action !== undefined && !action.disabled) {
        event.preventDefault();
        action.activate(studioCanvasActionActivation(event));
        this.syncTextFocus();
        this.render();
        return;
      }
    }
    if (this.#focus.handleKeyDown(event)) { event.preventDefault(); this.syncTextFocus(); this.render(); return; }
    if (this.#scene?.input?.keyDown?.(this.toolKey(event)) === true) {
      event.preventDefault(); this.render();
    }
  };
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== ' ') return;
    const wasHeld = this.#spaceHeld;
    this.#spaceHeld = false;
    if (wasHeld) event.preventDefault();
  };
  private readonly onBeforeInput = (event: InputEvent): void => {
    if (this.activeTextEditor()?.handleBeforeInput(event) === true) {
      event.preventDefault(); this.render();
    }
  };
  private readonly onCompositionStart = (event: CompositionEvent): void => {
    if (this.activeTextEditor()?.handleCompositionStart(event) === true) { event.preventDefault(); this.render(); }
  };
  private readonly onCompositionUpdate = (event: CompositionEvent): void => {
    if (this.activeTextEditor()?.handleCompositionUpdate(event) === true) { event.preventDefault(); this.render(); }
  };
  private readonly onCompositionEnd = (event: CompositionEvent): void => {
    if (this.activeTextEditor()?.handleCompositionEnd(event) === true) { event.preventDefault(); this.render(); }
  };
  private readonly onPaste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData('text/plain');
    if (text !== undefined && this.activeTextEditor()?.handlePaste(text) === true) { event.preventDefault(); this.render(); }
  };
  private readonly onCopy = (event: ClipboardEvent): void => {
    const editor = this.activeTextEditor();
    if (editor === null || event.clipboardData === null) return;
    const snapshot = editor.snapshot();
    event.clipboardData.setData('text/plain', snapshot.value.slice(snapshot.caretStart, snapshot.caretEnd));
    event.preventDefault();
  };
  private readonly onCut = (event: ClipboardEvent): void => {
    const editor = this.activeTextEditor();
    if (editor === null || event.clipboardData === null) return;
    const snapshot = editor.snapshot();
    event.clipboardData.setData('text/plain', snapshot.value.slice(snapshot.caretStart, snapshot.caretEnd));
    if (editor.handleBeforeInput({ inputType: 'deleteByCut' })) this.render();
    event.preventDefault();
  };
  private readonly onWheel = (event: WheelEvent): void => {
    const point = this.pointer(event);
    const table = this.#scene?.tables.find(({ layout }) => inside(point, layout.viewport));
    if (table?.onScroll !== undefined && table.layout.maximumScrollRow > 0) {
      event.preventDefault();
      const command: StudioCanvasTableScrollCommand = event.deltaY < 0 ? 'line_up' : 'line_down';
      table.onScroll(command, scrollStudioCanvasTable(table.layout, command));
      this.#focusedTableId = table.id;
      this.render();
      return;
    }
    const viewport = this.#toolRailViewport;
    if (viewport !== null && inside(point, viewport)) {
      event.preventDefault();
      const next = Math.max(0, Math.min(this.#toolRailMaximumScroll,
        this.#toolRailScroll + (event.deltaY < 0 ? -1 : 1)));
      if (next !== this.#toolRailScroll) { this.#toolRailScroll = next; this.render(); }
      return;
    }
    if (this.#scene === null || new UiInputRouter(this.#scene.widgets).routeWheel({ point,
      deltaX: event.deltaX, deltaY: event.deltaY })) return;
    if (this.#scene.input?.wheel?.(this.toolWheel(event, point)) === true) {
      event.preventDefault(); this.render();
    }
  };
  private readonly onPopState = (): void => {
    if (this.controller.navigate(location.pathname)) this.restoreLayoutSession(this.controller.activeRoute().path);
    this.render();
  };
  private readonly onResize = (): void => {
    if (this.#resizeFrame !== null) return;
    this.#resizeFrame = requestAnimationFrame(() => { this.#resizeFrame = null; this.render(); });
  };
  private readonly onBlur = (): void => {
    this.#spaceHeld = false;
    if (this.#splitDrag !== null) { this.#splitDrag = null; this.persistLayoutSession(); }
  };
  private readonly onVisibility = (): void => {
    if (document.hidden) this.#spaceHeld = false;
    else this.render();
  };

  private clampDrawer(value: number): number { return Math.max(180, Math.min(420, Math.round(value))); }
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
    this.#splitDrag = null;
    this.#splitBounds = null;
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
    this.persistDrawers(); this.persistLayoutSession();
    this.controller.notifications.push('success', 'Canvas layout restored', name);
    this.render();
  }
  private resetDrawer(side: 'left' | 'right'): void {
    this.#drawerWidths = { ...this.#drawerWidths, [side]: side === 'left' ? 270 : 286 };
    this.persistDrawers(); this.render();
  }
}
