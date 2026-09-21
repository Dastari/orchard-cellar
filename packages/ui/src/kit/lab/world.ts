import { UI_LAB_DISTRICTS as DISTRICTS, uiLabPlacements } from './placement.js';
import { UiTextBridge } from '../runtime/text-bridge.js';
import { uiTopModal } from '../runtime/layers.js';
import { uiContainerVariant } from '../../design-system/layout.js';
import { loadGeneratedAsset, type LoadedAsset } from '../../assets.js';
import type { UiLabActor } from './actors.js';
import { containsPoint, type UiPoint, type UiRect } from '../../geometry.js';
import { ui, type UiKitArt, type UiWorkbenchNavigation } from '../components/index.js';
import { uiFixed } from '../layout/box.js';
import { UiRoot } from '../runtime/root.js';
import { inspectUiElements, type UiElement } from '../runtime/element.js';
import type { UiScale } from '../tokens.js';
import { UI_LAB_SOURCE_CARDS } from './source-cards.generated.js';
import { UiLabCamera, UI_LAB_WORLD } from './camera.js';
import { UI_LAB_SPECIMENS, uiLabVariants, type UiLabSpecimen, type UiLabDistrict, type UiLabMocks } from './registry.js';
export interface UiLabWorldOptions {
  readonly frameDefinitions?: UiLabMocks['frameDefinitions'];
  readonly createFrameDesigner?: UiLabMocks['createFrameDesigner'];
  readonly actors?: readonly UiLabActor[]; readonly art: UiKitArt;
  readonly navigation?: readonly UiWorkbenchNavigation[];
  readonly specimens?: readonly UiLabSpecimen[];
}
interface SpecimenMount { readonly specimen: UiLabSpecimen; readonly root: UiRoot; readonly rect: UiRect; readonly props: Readonly<Record<string, unknown>>; readonly code?: boolean }

export class UiLabWorld {
  readonly camera = new UiLabCamera();
  readonly chrome: UiRoot;
  readonly specimens: readonly UiLabSpecimen[];
  private mounts: SpecimenMount[] = [];
  private districts = new Map<UiLabDistrict, UiRoot>();
  private assets = new Map<string, LoadedAsset>(); private loads = new Set<string>();
  private textBridge: UiTextBridge;
  private actorTimer: ReturnType<typeof setTimeout> | undefined;
  private selected = 'foundations'; private variant = 0; private scale: UiScale = 2;
  private pinned = false; private inspected: UiElement | null = null;
  private selectionLabel = ui.text('');
  private inspector: UiElement; private status: UiElement;
  private drawCount = 0;
  private frame: number | null = null; private disposed = false;
  private abort = new AbortController(); private observer: ResizeObserver;
  private width = 0; private height = 0; private dpr = 1;
  private keyRoot: UiRoot | null = null;
  private readonly inputMounts = new Map<number, SpecimenMount | null>();
  private dragPointer: number | null = null;
  private space = false; private drag: UiPoint | null = null;
  private stress = { empty: false, oversized: false, thousands: false, missingArt: false };
  private lastAction = 'Ready'; private longLabels = false;
  constructor(readonly canvas: HTMLCanvasElement, readonly options: UiLabWorldOptions) {
    this.specimens = options.specimens ?? UI_LAB_SPECIMENS;
    this.chrome = new UiRoot({ onInvalidate: () => this.invalidate(), art: options.art, scale: 2, label: 'Orchard UI Lab' });
    this.inspector = ui.text('Hover a specimen to inspect its layout. Click to pin.');
    this.status = ui.text('Ready', { wrap: false });
    this.textBridge = new UiTextBridge(canvas, () => this.keyRoot?.focus.current ?? null, event => { this.keyDown(event); return event.defaultPrevented; }, element => { const mount = this.mounts.find(mount => element.isDescendantOf(mount.root.tree)), bounds = canvas.getBoundingClientRect(); if (!mount) return element.rect; const origin = this.camera.screenPoint(mount.rect), scale = this.scale * this.camera.zoom; return { x: bounds.x + origin.x + element.rect.x * scale, y: bounds.y + origin.y + element.rect.y * scale, width: element.rect.width * scale, height: element.rect.height * scale }; }, () => this.invalidate());
    this.restore(); this.rebuildSpecimens();
    for (const district of Object.keys(DISTRICTS) as UiLabDistrict[]) {
      const root = new UiRoot({ onInvalidate: () => this.invalidate(), art: options.art, scale: 2 }); root.resize(1400, 64);
      root.mount(ui.flex({ gap: 4 }, [ui.text(district.toUpperCase(), { role: 'header' }),
        ui.text(district === 'playground' ? 'Open a specimen here, then drag its resize control.' : 'Select a specimen. Inspect, resize, or copy its source.') ]));
      this.districts.set(district, root);
    }
    const { signal } = this.abort;
    canvas.tabIndex = 0; canvas.setAttribute('role', 'application'); canvas.style.touchAction = 'none';
    canvas.addEventListener('orchard:ui-lab-inspect', event => { const read = (event as CustomEvent<unknown>).detail; if (typeof read === 'function') read(this.inspect()); }, { signal });
    canvas.addEventListener('pointerdown', this.pointerDown, { signal });
    canvas.addEventListener('pointermove', this.pointerMove, { signal });
    canvas.addEventListener('pointerup', this.pointerUp, { signal });
    canvas.addEventListener('pointercancel', this.pointerUp, { signal });
    canvas.addEventListener('pointerleave', () => { this.chrome.input.clearHover(); for (const mount of this.mounts) mount.root.input.clearHover(); this.invalidate(); }, { signal });
    canvas.addEventListener('wheel', this.wheel, { signal, passive: false });
    canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    canvas.addEventListener('keydown', this.keyDown, { signal });
    canvas.addEventListener('keyup', event => { if (event.key === ' ') this.space = false; }, { signal });
    window.addEventListener('blur', () => { this.cancelPointers(); this.space = false; }, { signal });
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => this.invalidate(), { signal });
    window.addEventListener('resize', () => this.resize(), { signal });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.invalidate(); }, { signal });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }
  private restore(): void {
    try {
      const state = JSON.parse(sessionStorage.getItem('orchard.ui-kit.lab') ?? '{}') as Record<string, unknown>;
      if ([1, 2, 3].includes(Number(state['scale']))) this.scale = Number(state['scale']) as UiScale;
      if (typeof state['selected'] === 'string') this.selected = state['selected'];
      for (const key of ['x', 'y', 'zoom'] as const) if (typeof state[key] === 'number' && Number.isFinite(state[key])) this.camera[key] = state[key];
      if (typeof state['variant'] === 'number' && state['variant'] >= 0) this.variant = Math.floor(state['variant']);
    } catch { /* A corrupt or blocked session store must not prevent anonymous use. */ }
    const params = new URLSearchParams(location.search);
    if (params.has('specimen')) this.selected = params.get('specimen')!;
    if ([1, 2, 3].includes(Number(params.get('scale')))) this.scale = Number(params.get('scale')) as UiScale;
    this.camera.zoom = Math.max(0.2, Math.min(3, this.camera.zoom));
  }
  private persist(): void {
    try { sessionStorage.setItem('orchard.ui-kit.lab', JSON.stringify({ x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, selected: this.selected, scale: this.scale, variant: this.variant })); } catch { /* Storage is optional. */ }
  }
  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight), dpr = window.devicePixelRatio || 1;
    if (this.width === width && this.height === height && this.dpr === dpr) return;
    this.width = width; this.height = height; this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.camera.viewport = { x: 80, y: 64, width: Math.max(1, width - 80 - (width >= 900 ? 300 : 0)), height: Math.max(1, height - 96) };
    this.camera.clamp(); if (new URLSearchParams(location.search).has('specimen') && this.width === width && this.chrome.viewport.width === 0) { const mount = this.mounts.find(entry => entry.specimen.id === this.selected); if (mount) this.camera.fit(mount.rect); } this.chrome.resize(width, height, dpr); this.buildChrome(); this.invalidate();
  }
  private buildChrome(): void {
    for (const child of [...this.chrome.tree.children]) child.dispose();
    const button = (label: string, onPress: () => void) => ui.button({ label, size: 'sm', onPress });
    const top = ui.frame({ style: 'thin', layout: { position: 'fixed', inset: { left: 0, top: 0, right: 0 }, height: uiFixed(32), direction: 'row', gap: 4 }, children: [
      ui.text('UI LAB', { role: 'header', wrap: false, layout: { width: uiFixed(64) } }),
      button('Home', () => this.jump('foundations')),
      ui.select({ label: 'District', size: 'sm', value: this.specimens.find(specimen => specimen.id === this.selected)?.district ?? 'foundations', options: Object.keys(DISTRICTS).map(value => ({ value, label: value })), layout: { width: uiFixed(108) }, onChange: value => this.jump(value as UiLabDistrict) }),
      button('Fit', () => { this.camera.fit(UI_LAB_WORLD); this.lastAction = 'Fit world'; this.invalidate(); }),
      button('1:1', () => { this.camera.zoomAt({ x: this.camera.viewport.x + this.camera.viewport.width / 2, y: this.camera.viewport.y + this.camera.viewport.height / 2 }, 1); this.invalidate(); }),
      button('M', () => this.jump('migration')), button('C', () => this.jump('authored')),
      button(`${this.scale}x UI`, () => { this.scale = (this.scale % 3 + 1) as UiScale; this.rebuildSpecimens(); this.buildChrome(); this.invalidate(); }),
    ] });
    const rail = ui.workbenchNavigation(this.options.navigation ?? [], { layout: { position: 'fixed', inset: { left: 0, top: 32, bottom: 0 } } });
    this.inspector = ui.text('Hover a specimen to inspect its layout. Click to pin. Arrow keys walk a pinned tree.', { layout: { width: 'grow' } });
    this.selectionLabel = ui.text(this.selected, { layout: { height: uiFixed(40) } });
    const select = (direction: number) => {
      const index = this.specimens.findIndex(specimen => specimen.id === this.selected);
      const specimen = this.specimens[(index + direction + this.specimens.length) % this.specimens.length];
      if (!specimen) return; this.selected = specimen.id;
      const mount = this.mounts.find(candidate => candidate.specimen.id === specimen.id && !candidate.code);
      if (mount) this.camera.fit(mount.rect); this.invalidate();
    };
    if (this.width >= 900) this.chrome.mount(ui.frame({ style: 'parchment_plain', header: { title: 'Inspector' },
      layout: { position: 'fixed', inset: { right: 0, top: 32, bottom: 16 }, width: uiFixed(150), gap: 6 }, children: [
        ui.combobox({ label: 'Find specimen', placeholder: 'Find specimen…', size: 'sm', options: this.specimens.map(specimen => ({ value: specimen.id, label: specimen.title, group: specimen.district })), onChange: id => {
          this.selected = id; const mount = this.mounts.find(candidate => candidate.specimen.id === id && !candidate.code);
          if (mount) this.camera.fit(mount.rect); this.invalidate();
        } }),
        this.selectionLabel,
        ui.grid({ columns: 2, gap: 4, rowHeight: uiFixed(16) }, [button('Previous', () => select(-1)), button('Next', () => select(1)),
          button('Play', () => this.openPlayground()), button('Variant', () => { this.variant++; this.rebuildSpecimens(); this.invalidate(); })]),
        ui.text('Stress tests'),
        ui.grid({ columns: 2, gap: 4, rowHeight: uiFixed(16) }, [
          button(this.longLabels ? 'Labels: on' : 'Labels', () => { this.longLabels = !this.longLabels; this.rebuildSpecimens(); this.buildChrome(); this.invalidate(); }),
          ...(['empty', 'oversized', 'thousands', 'missingArt'] as const).map(key => button(`${this.stress[key] ? '+ ' : ''}${key === 'missingArt' ? 'No art' : key === 'oversized' ? 'Large' : key === 'thousands' ? '2k rows' : key}`, () => { this.stress[key] = !this.stress[key]; this.rebuildSpecimens(); this.buildChrome(); this.invalidate(); })),
        ]),
        ui.separator(), ui.scrollArea({ height: 'grow' }, [this.inspector]),
        ui.text('F fit | 0 home | 1 1:1\nM migration | C authored\nA actors | Space + drag'),
      ] }));
    this.status = ui.text('', { wrap: false, layout: { width: 'grow' } });
    this.chrome.mount(top); this.chrome.mount(rail);
    this.chrome.mount(ui.frame({ style: 'unframed', tone: 'neutral', layout: { position: 'fixed', inset: { left: uiFixed(40), right: 0, bottom: 0 }, height: uiFixed(16), padding: 2 }, children: [this.status] }));
  }
  private rebuildSpecimens(): void {
    this.cancelPointers();
    for (const mount of this.mounts) mount.root.dispose(); this.mounts = [];
    for (const { specimen, rect, code: codeRect } of uiLabPlacements(this.specimens)) {
      const size = rect;
      const variants = uiLabVariants(specimen), props = { ...variants[this.variant % variants.length], longLabels: this.longLabels, ...this.stress };
      const root = new UiRoot({ onInvalidate: () => this.invalidate(), art: { ...this.options.art, missingArt: this.stress.missingArt }, scale: this.scale });
      root.resize(size.width, size.height, this.dpr);
      root.mount(specimen.build(ui, props, { frameDefinitions: this.options.frameDefinitions, createFrameDesigner: this.options.createFrameDesigner, art: this.options.art, actors: this.stress.empty ? [] : this.options.actors, assets: this.assets, requestAsset: name => this.requestAsset(name), activate: id => { this.lastAction = `Activated ${id}`; this.invalidate(); } }));
      this.mounts.push({ specimen, root, rect, props });
      const code = new UiRoot({ onInvalidate: () => this.invalidate(), art: { ...this.options.art, missingArt: this.stress.missingArt }, scale: this.scale });
      code.resize(560, size.height, this.dpr);
      code.mount(ui.frame({ style: 'grey_plain', header: { title: 'Code' }, layout: { width: 'grow', height: 'grow', gap: 8 }, children: [
        ui.button({ label: 'Copy source', size: 'sm', onPress: () => { void navigator.clipboard.writeText(UI_LAB_SOURCE_CARDS[specimen.id] ?? '').then(() => { this.lastAction = 'Source copied'; this.invalidate(); }); } }),
        ui.scrollArea({ width: 'grow', height: 'grow' }, [ui.text(UI_LAB_SOURCE_CARDS[specimen.id] ?? '')]),
      ] }));
      this.mounts.push({ specimen, root: code, code: true, props, rect: codeRect });
    }
    this.pinned = false; this.inspected = null; this.keyRoot = null;
  }
  private requestAsset(name: string): void {
    if (this.loads.has(name) || this.assets.has(name)) return; this.loads.add(name);
    void loadGeneratedAsset(name, 'summer').then(asset => {
      if (this.disposed) return; this.assets.set(name, asset);
      for (const mount of this.mounts) {
        const refresh = mount.root.tree.children[0]?.props['refresh']; if (typeof refresh === 'function') refresh();
      }
      this.invalidate();
    }).catch(() => { this.loads.delete(name); this.lastAction = `Could not load ${name}`; this.invalidate(); });
  }
  private openPlayground(): void {
    const source = this.mounts.find(mount => mount.specimen.id === this.selected && !mount.code); if (!source) return;
    const existing = this.mounts.find(mount => mount.specimen.district === 'playground');
    if (existing) { existing.root.dispose(); this.mounts = this.mounts.filter(mount => mount !== existing); }
    const root = new UiRoot({ onInvalidate: () => this.invalidate(), art: { ...this.options.art, missingArt: this.stress.missingArt }, scale: this.scale });
    const size = { width: Math.min(source.rect.width, DISTRICTS.playground.width), height: Math.min(source.rect.height, DISTRICTS.playground.height - 80) };
    root.resize(size.width, size.height, this.dpr);
    const rect = { ...size, x: DISTRICTS.playground.x, y: DISTRICTS.playground.y + 80 };
    const specimen = source.specimen.build(ui, source.props, { frameDefinitions: this.options.frameDefinitions, createFrameDesigner: this.options.createFrameDesigner, art: this.options.art, actors: this.options.actors, assets: this.assets,
      requestAsset: name => this.requestAsset(name), activate: id => { this.lastAction = `Playground: ${id}`; this.invalidate(); } });
    root.mount(ui.frame({ style: 'unframed',
      layout: { width: 'grow', height: 'grow' }, resizable: { min: { width: 96, height: 120 }, max: { width: Math.floor(DISTRICTS.playground.width / this.scale), height: Math.floor((DISTRICTS.playground.height - 80) / this.scale) },
        onResize: size => { rect.width = size.width * this.scale; rect.height = size.height * this.scale; root.resize(rect.width, rect.height, this.dpr); this.lastAction = `Resizing ${rect.width} x ${rect.height}`; this.invalidate(); } }, children: [specimen] }));
    this.mounts.push({ ...source, root, specimen: { ...source.specimen, district: 'playground' }, rect });
    this.jump('playground');
  }
  private jump(district: UiLabDistrict): void {
    const specimen = this.specimens.find(entry => entry.district === district); if (specimen) this.selected = specimen.id;
    this.lastAction = `Viewing ${district}`; const rect = DISTRICTS[district]; this.camera.x = rect.x; this.camera.y = rect.y; this.camera.zoom = 1; this.camera.clamp(); this.invalidate();
  }
  private point(event: MouseEvent): UiPoint { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  private mountAt(point: UiPoint): SpecimenMount | undefined {
    const world = this.camera.worldPoint(point);
    return [...this.mounts].reverse().find(mount => containsPoint(mount.rect, world));
  }
  private localPoint(mount: SpecimenMount, point: UiPoint): UiPoint {
    const world = this.camera.worldPoint(point); return { x: (world.x - mount.rect.x) / this.scale, y: (world.y - mount.rect.y) / this.scale };
  }
  private pointerDown = (event: PointerEvent): void => {
    this.canvas.focus(); this.inputMounts.set(event.pointerId, null); this.canvas.setPointerCapture(event.pointerId); const point = this.point(event);
    if (!containsPoint(this.camera.viewport, point)) { this.keyRoot = this.chrome; this.chrome.pointer({ type: 'down', point: { x: point.x / 2, y: point.y / 2 }, pointerId: event.pointerId, button: event.button }); this.invalidate(); return; }
    const mount = this.mountAt(point);
    if (event.button === 1 || this.space || !mount) { this.drag = point; this.dragPointer = event.pointerId; event.preventDefault(); return; }
    this.keyRoot = mount.root; this.inputMounts.set(event.pointerId, mount); this.selected = mount.specimen.id;
    mount.root.pointer({ type: 'down', point: this.localPoint(mount, point), pointerId: event.pointerId, button: event.button });
    this.inspected = mount.root.input.hits(this.localPoint(mount, point))[0] ?? null; this.pinned = true; this.invalidate();
  };
  private pointerMove = (event: PointerEvent): void => {
    const point = this.point(event);
    if (this.drag && this.dragPointer === event.pointerId) { this.lastAction = 'Panning'; this.camera.pan(point.x - this.drag.x, point.y - this.drag.y); this.drag = point; this.invalidate(); return; }
    this.chrome.pointer({ type: 'move', point: { x: point.x / 2, y: point.y / 2 }, pointerId: event.pointerId, button: event.button });
    const mount = this.inputMounts.has(event.pointerId) ? this.inputMounts.get(event.pointerId) : this.mountAt(point);
    for (const other of this.mounts) if (other !== mount) other.root.input.clearHover();
    if (mount) {
      mount.root.pointer({ type: 'move', point: this.localPoint(mount, point), pointerId: event.pointerId, button: event.button });
      if (!this.pinned) this.inspected = mount.root.input.hits(this.localPoint(mount, point))[0] ?? null;
    } else if (!this.pinned) this.inspected = null;
    this.invalidate();
  };
  private pointerUp = (event: PointerEvent): void => {
    const point = this.point(event), type = event.type === 'pointercancel' ? 'cancel' : 'up';
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    const mount = this.inputMounts.get(event.pointerId); this.inputMounts.delete(event.pointerId);
    if (this.dragPointer === event.pointerId) { this.drag = null; this.dragPointer = null; this.invalidate(); return; }
    this.chrome.pointer({ type, point: { x: point.x / 2, y: point.y / 2 }, pointerId: event.pointerId, button: event.button });
    mount?.root.pointer({ type, point: this.localPoint(mount, point), pointerId: event.pointerId, button: event.button });
    this.invalidate();
  };
  private cancelPointers(): void {
    for (const [pointerId, mount] of this.inputMounts) {
      const event = { type: 'cancel' as const, point: { x: 0, y: 0 }, pointerId, button: 0 };
      this.chrome.pointer(event); mount?.root.pointer(event);
      if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    }
    this.inputMounts.clear(); this.drag = null; this.dragPointer = null; this.invalidate();
  }
  private wheel = (event: WheelEvent): void => {
    event.preventDefault(); const point = this.point(event);
    if (containsPoint(this.camera.viewport, point)) {
      const mount = this.mountAt(point);
      const scrolled = mount && !event.ctrlKey && mount.root.wheel({ point: this.localPoint(mount, point), deltaX: event.deltaX / this.scale, deltaY: event.deltaY / this.scale });
      this.lastAction = scrolled ? mount?.code ? 'Scrolling code' : 'Scrolling specimen' : 'Zooming';
      if (!scrolled) this.camera.zoomAt(point, this.camera.zoom * Math.exp(-event.deltaY * 0.0015));
    }
    else this.chrome.wheel({ point: { x: point.x / 2, y: point.y / 2 }, deltaX: event.deltaX / 2, deltaY: event.deltaY / 2 });
    this.invalidate();
  };
  private keyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase(), focused = this.keyRoot?.focus.current;
    if (this.keyRoot && (uiTopModal(this.keyRoot.entries()) || key !== 'tab' && (focused?.props['editor'] || focused?.props['selectionControl']))) {
      if (this.keyRoot.key(event)) event.preventDefault(); this.invalidate(); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === 'tab') {
      const roots = [this.chrome, ...this.mounts.filter(mount => this.camera.visible(mount.rect)).map(mount => mount.root)];
      for (const root of roots) root.arrange();
      const controls = roots.flatMap(root => root.entries().filter(({ element }) => element.focusable && !element.disabled && element.visible)
        .map(({ element }) => ({ root, element })));
      const current = controls.findIndex(({ root, element }) => root === this.keyRoot && root.focus.current === element);
      const next = controls[(current + (event.shiftKey ? controls.length - 1 : 1) + controls.length) % controls.length];
      for (const root of roots) root.focus.set(null);
      if (next) { this.keyRoot = next.root; next.root.focus.set(next.element); }
    }
    else if (key === 'f') this.camera.fit(UI_LAB_WORLD);
    else if (key === '0') this.jump('foundations');
    else if (key === '1') this.camera.zoomAt({ x: this.camera.viewport.x + this.camera.viewport.width / 2, y: this.camera.viewport.y + this.camera.viewport.height / 2 }, 1);
    else if (key === 'm') this.jump('migration');
    else if (key === 'c') this.jump('authored');
    else if (key === 'a') this.jump('actors');
    else if (key === '[' || key === ']') { const step = this.mounts.find(mount => mount.specimen.id === 'actors' && !mount.code)?.root.tree.children[0]?.props['stepActor']; if (this.camera.visible(DISTRICTS.actors) && typeof step === 'function') step(key === '[' ? -1 : 1); }
    else if (key === 'escape') {
      this.cancelPointers(); this.space = false; this.pinned = false; this.inspected = null; for (const mount of this.mounts) mount.root.key(event); }
    else if (key === ' ' && !this.chrome.focus.current && !this.mounts.some(mount => mount.root.focus.current)) this.space = true;
    else if (this.pinned && this.inspected && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      if (key === 'arrowleft') this.inspected = this.inspected.parent ?? this.inspected;
      else if (key === 'arrowright') this.inspected = this.inspected.children[0] ?? this.inspected;
      else { const root = this.mounts.find(mount => this.inspected!.isDescendantOf(mount.root.tree))?.root; const tree = root?.entries().map(entry => entry.element) ?? []; const index = tree.indexOf(this.inspected); this.inspected = tree[Math.max(0, Math.min(tree.length - 1, index + (key === 'arrowup' ? -1 : 1)))] ?? this.inspected; }
    } else {
      const mount = this.mounts.find(mount => mount.specimen.id === this.selected && this.camera.visible(mount.rect));
      if (this.keyRoot) this.keyRoot.key(event); else if (mount) mount.root.key(event); else this.chrome.key(event);
    }
    event.preventDefault(); this.invalidate();
  };
  invalidate(): void {
    if (this.disposed || this.frame !== null || document.hidden) return;
    this.frame = requestAnimationFrame(now => { this.frame = null; this.draw(now); });
  }
  private draw(now: number): void {
    const context = this.canvas.getContext('2d'); if (!context) return;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); context.imageSmoothingEnabled = false;
    context.fillStyle = '#bcc0be'; context.fillRect(0, 0, this.width, this.height);
    const viewport = this.camera.viewport;
    context.save(); context.beginPath(); context.rect(viewport.x, viewport.y, viewport.width, viewport.height); context.clip();
    const tile = 32 * this.camera.zoom;
    for (let row = -1; row <= viewport.height / tile + 1; row++) for (let col = -1; col <= viewport.width / tile + 1; col++) {
      const worldCol = Math.floor(this.camera.x / 32) + col, worldRow = Math.floor(this.camera.y / 32) + row;
      context.fillStyle = (worldCol + worldRow) % 2 ? '#b0b5b2' : '#c1c6c2';
      context.fillRect(viewport.x + col * tile - this.camera.x * this.camera.zoom % tile, viewport.y + row * tile - this.camera.y * this.camera.zoom % tile, tile + 1, tile + 1);
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [district, root] of this.districts) {
      if (!this.camera.visible({ ...DISTRICTS[district], height: 64 })) continue;
      const point = this.camera.screenPoint(DISTRICTS[district]); root.dpr = this.dpr;
      root.draw(context, now, false, { scale: this.camera.zoom * 2, x: point.x, y: point.y });
    }
    for (const mount of this.mounts) {
      if (!this.camera.visible(mount.rect)) continue;
      mount.root.reducedMotion = reducedMotion;
      const point = this.camera.screenPoint(mount.rect); mount.root.dpr = this.dpr;
      mount.root.draw(context, now, false, { scale: this.camera.zoom * this.scale, x: point.x, y: point.y, clip: { x: (viewport.x - point.x) / (this.camera.zoom * this.scale), y: (viewport.y - point.y) / (this.camera.zoom * this.scale), width: viewport.width / (this.camera.zoom * this.scale), height: viewport.height / (this.camera.zoom * this.scale) } });
      if (this.inspected?.isDescendantOf(mount.root.tree)) {
        const r = this.inspected.rect, clip = this.inspected.clip;
        const outline = (rect: UiRect, ink: string) => { context.strokeStyle = ink; context.lineWidth = 1;
          context.strokeRect(point.x + rect.x * this.scale * this.camera.zoom, point.y + rect.y * this.scale * this.camera.zoom, rect.width * this.scale * this.camera.zoom, rect.height * this.scale * this.camera.zoom); };
        outline(r, '#0e071b'); outline(clip, '#fff6e0');
      }
    }
    context.restore();
    const selectedSpecimen = this.specimens.find(specimen => specimen.id === this.selected);
    const variants = selectedSpecimen ? uiLabVariants(selectedSpecimen) : [{}];
    const selectionText = `${selectedSpecimen?.title ?? this.selected}\n${Object.entries(variants[this.variant % variants.length] ?? {}).map(([key, value]) => `${key}: ${String(value)}`).join(', ') || `UI scale ${this.scale}x`}`;
    if (this.selectionLabel.props['text'] !== selectionText) this.selectionLabel.setProps({ text: selectionText });
    const node = this.inspected;
    const inspectionText = node ? `${this.pinned ? 'PINNED' : 'HOVER'}\n${node.id}\n${node.kind}\nVariant ${uiContainerVariant(node.rect.width)}\nMeasured ${node.measured.preferred.width} x ${node.measured.preferred.height}\nRect ${node.rect.x},${node.rect.y} ${node.rect.width}x${node.rect.height}\nClip ${node.clip.x},${node.clip.y} ${node.clip.width}x${node.clip.height}\n${JSON.stringify(node.style)}` : 'Hover a specimen to inspect its layout. Click to pin. Arrow keys walk a pinned tree.';
    if (this.inspector.props['text'] !== inspectionText) this.inspector.setProps({ text: inspectionText });
    const statusText = `${Math.round(this.camera.zoom * 100)}% zoom | UI ${this.scale}x | ${this.selected} | ${this.lastAction}`;
    if (this.status.props['text'] !== statusText) this.status.setProps({ text: statusText });
    this.chrome.draw(context, now, false); this.textBridge.sync(); this.persist();

    if (this.mounts.some(mount => !mount.code && this.camera.visible(mount.rect) && mount.root.entries().some(({ element }) => element.hooks.animated && (!reducedMotion || element.hooks.updatesWhenReduced) && element.visible && element.clip.width > 0 && element.clip.height > 0)) && this.actorTimer === undefined) {
      this.actorTimer = setTimeout(() => { this.actorTimer = undefined; this.invalidate(); }, 1000 / 30);
    }
    this.canvas.dataset['canvasFrameCount'] = String(++this.drawCount); this.canvas.dataset['labPendingAssets'] = String([...this.loads].filter(name => !this.assets.has(name)).length);
    this.canvas.dataset['canvasReady'] = 'true'; this.canvas.dataset['canvasRoute'] = '/author/ui-lab';
    this.canvas.dataset['labActor'] = String(this.mounts.find(mount => mount.specimen.id === 'actors' && !mount.code)?.root.tree.children[0]?.props['selectedActor'] ?? '');
    this.canvas.dataset['labCamera'] = JSON.stringify({ x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom });
    this.canvas.setAttribute('aria-label', `Orchard UI Lab. ${this.selected}. ${this.keyRoot?.focus.current?.label ?? this.lastAction}. F fit, 0 home, 1 exact zoom, M migration.`);
  }
  inspect() {
    return { scale: this.scale, districts: Object.entries(DISTRICTS).map(([id, rect]) => ({ id, rect })), camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, viewport: this.camera.viewport },
      chrome: inspectUiElements(this.chrome.tree).map(entry => ({ ...entry, label: this.chrome.entries().find(node => node.element.id === entry.id)?.element.label })),
      specimens: this.mounts.map(mount => ({ id: mount.specimen.id, district: mount.specimen.district, props: mount.props, code: Boolean(mount.code), rect: mount.rect,
        elements: inspectUiElements(mount.root.tree).map(entry => ({ ...entry, label: mount.root.entries().find(node => node.element.id === entry.id)?.element.label })) })) };
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.cancelPointers(); this.persist(); this.abort.abort(); this.textBridge.dispose(); this.observer.disconnect(); clearTimeout(this.actorTimer);
    if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null;
    for (const mount of this.mounts) mount.root.dispose(); for (const root of this.districts.values()) root.dispose(); this.chrome.dispose(); this.canvas.style.touchAction = '';
  }
}
