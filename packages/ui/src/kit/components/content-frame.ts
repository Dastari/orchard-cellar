import { uiTiming, timingLabels } from './timing.js';
import { uiGlyphButton, uiWindow } from './window.js';
import { uiStationLayout, uiStationMachine, uiStationSlot, type UiStationMood } from './station.js';
import type { TimingProjection, FrameContentDefinition, FrameRestrictionRegistry } from '@orchard/sim';
import { HOTBAR_SLOT_COUNT } from '@orchard/sim/inventory-layout';
import { resolveFramePaneSlots, type FrameContainerAliases } from '../../content-frame.js';
import type { UiInventoryController } from '../runtime/inventory.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiMeter } from './meter.js';
import { uiInventoryGrid, uiItemImage, uiPaperDoll, type UiSlotOptions } from './inventory.js';
import { uiInventoryPanel, type UiInventoryControls } from './inventory-panel.js';
import type { UiTone } from '../tokens.js';
export interface UiContentFrameOptions {
  readonly definition: FrameContentDefinition; readonly aliases: FrameContainerAliases;
  readonly registry: Pick<FrameRestrictionRegistry, 'items' | 'processes'>; readonly controller?: UiInventoryController;
  readonly artwork?: UiSlotOptions['artwork']; readonly state?: Readonly<Record<string, boolean | number | string>>; readonly progress?: number | (() => number);
  readonly timing?: TimingProjection;
  readonly iconAnimation?: UiSlotOptions['iconAnimation'];
  readonly inventoryControls?: Readonly<Record<string, UiInventoryControls>>;
  readonly status?: { readonly label: string; readonly progress?: number | (() => number); readonly tone?: UiTone };
  readonly renderPane?: (pane: FrameContentDefinition['panes'][number]) => UiElement | undefined;
  readonly onInvoke?: (interaction: string) => void; readonly onClose?: () => void; readonly onPaneSelect?: (id: string) => void;
  readonly layout?: UiStyle;
  /** Wearer preview for paper-doll panes. */
  readonly portrait?: UiElement;
}
export interface UiContentFrameElement extends UiElement {
  /** Refresh authored state without replacing inventory controls or their editors. */
  updateTiming(timing: TimingProjection): void;
  updateState(state: NonNullable<UiContentFrameOptions['state']>): void;
}
/** Frame definitions remain presentation data; the host retains write authority. The game renders the
 * approved designed layouts (station, storage, pack); the frame designer keeps the per-pane preview. */
export function uiContentFrame(options: UiContentFrameOptions): UiContentFrameElement {
  return options.onPaneSelect ? uiPaneContentFrame(options) : uiDesignedContentFrame(options);
}
/** Per-pane preview used by the frame designer: every pane is a selectable, labelled block. */
function uiPaneContentFrame(options: UiContentFrameOptions): UiContentFrameElement {
  let state = options.state ?? {};
  const refresh: (() => void)[] = [];
  const timers: ReturnType<typeof uiTiming>[] = [];
  const definition = options.definition, shown = (value?: { readonly state: string; readonly equals: boolean | number | string }) => !value || state[value.state] === value.equals;
  const panes = definition.panes.map(pane => {
    const bindings = resolveFramePaneSlots(pane, options.aliases, options.registry);
    const custom = options.renderPane?.(pane);
    const controls = bindings.length ? options.inventoryControls?.[bindings[0]!.containerId] : undefined;
    const timer = 'timing' in pane.bind ? uiTiming({ timing: options.timing ?? { status: 'idle', reason: null, stage: null, progress: 0, remainingActiveTicks: null, nextTransitionTick: null, confidence: 'estimated' } }) : null;
    if (timer !== null && custom === undefined) timers.push(timer);
    const content = custom ?? timer ?? (bindings.length ? (pane.kind === 'paper_doll' ? uiPaperDoll : controls ? uiInventoryPanel : uiInventoryGrid)({ id: `preview.${definition.id}.pane.${pane.id}`, container: bindings[0]!.containerId, cells: bindings.map(binding => ({ id: String(binding.index), index: binding.index })), columns: pane.columns ?? 'auto', slotSize: 'sm', controller: options.controller, artwork: options.artwork, iconAnimation: options.iconAnimation, ...controls })
      : pane.kind === 'bar' ? uiMeter({ label: pane.label ?? 'Progress', value: 'state' in pane.bind ? Number(options.state?.[pane.bind.state] ?? 0) : options.progress ?? 0, tone: 'success' })
        : uiText('state' in pane.bind ? String(options.state?.[pane.bind.state] ?? '') : pane.label ?? ''));
    const body = uiFlex({ id: `pane:${pane.id}`, width: 'grow', basis: uiFixed(pane.minWidth ?? Math.max(80, (pane.columns ?? 1) * 36)), gap: 4 }, [
      ...(options.onPaneSelect ? [uiButton({ label: pane.label ?? pane.id, size: 'sm', onPress: () => options.onPaneSelect?.(pane.id) })] : pane.label ? [uiText(pane.label, { role: 'label' })] : []), content,
    ]); body.setProps({ pane: pane.id, bindings });
    refresh.push(() => {
      const display = shown(pane.visibleWhen) ? 'flex' : 'none';
      if (body.style.display !== display) body.setStyle({ display });
      if (!custom && !bindings.length && 'state' in pane.bind) {
        const key = pane.kind === 'bar' ? 'value' : 'text';
        const value = pane.kind === 'bar' ? Number(state[pane.bind.state] ?? 0) : String(state[pane.bind.state] ?? '');
        if (content.props[key] !== value) content.setProps({ [key]: value });
      }
    });
    return body;
  });
  const actions = uiFlex({ direction: 'row', gap: 4, wrap: true }, (definition.buttons ?? []).map(button => {
    const action = uiButton({ label: button.label, tone: button.tone === 'default' ? 'neutral' : button.tone, onPress: () => options.onInvoke?.(button.interaction) });
    refresh.push(() => {
      const display = shown(button.visibleWhen) ? 'flex' : 'none';
      if (action.style.display !== display) action.setStyle({ display });
    });
    return action;
  }));
  refresh.push(() => {
    const display = actions.children.some(child => child.visible) ? 'flex' : 'none';
    if (actions.style.display !== display) actions.setStyle({ display });
  });
  const frame = uiFrame({ id: definition.id, style: definition.style, header: { title: definition.title, closable: Boolean(options.onClose), onClose: options.onClose },
    resizable: definition.resizable ? { handles: 'all', min: { width: 96, height: 96 } } : undefined,
    layout: { width: 'grow', height: 'grow', gap: 8, overflow: 'scroll-y', ...options.layout }, children: [
      uiScrollArea({ width: 'grow', height: 'grow', minHeight: uiFixed(64), gap: 8 }, [uiFlex({ direction: 'row', wrap: true, width: 'grow', gap: 8 }, panes), ...(actions.children.length ? [actions] : []),
        ...(options.status ? [uiText(options.status.label, { id: `${definition.id}.status`, wrap: true }), ...(options.status.progress !== undefined ? [uiMeter({ label: options.status.label, value: options.status.progress, tone: options.status.tone ?? 'info' })] : [])] : []),
      ]),
      ...(definition.hotbar && options.aliases.hotbar ? [uiInventoryGrid({ container: options.aliases.hotbar, count: HOTBAR_SLOT_COUNT, columns: HOTBAR_SLOT_COUNT, controller: options.controller, artwork: options.artwork, iconAnimation: options.iconAnimation, hotkeys: true, layout: { shrink: 0 } })] : []),
    ] });
  const updateState = (next: NonNullable<UiContentFrameOptions['state']>): void => {
    state = next; for (const update of refresh) update();
  };
  updateState(state);
  return Object.assign(frame, { updateState, updateTiming: (timing: TimingProjection) => { for (const timer of timers) timer.updateTiming(timing); } });
}

/** Machines shown in station wells, keyed by authored frame id: art, idle/running poses and mood. */
export const UI_STATION_MACHINES: Readonly<Record<string, { readonly itemKind: string; readonly idle: string; readonly running?: string; readonly mood: UiStationMood }>> = {
  'frame:furnace': { itemKind: 'furnace', idle: 'off', running: 'burn', mood: 'forge' },
  'frame:cooking': { itemKind: 'cooking_fire', idle: 'off', running: 'burn', mood: 'hearth' },
  'frame:press': { itemKind: 'fruit_press', idle: 'base', mood: 'orchard' },
  'frame:fermentation': { itemKind: 'fermentation_cask', idle: 'base', mood: 'cellar' },
  'frame:barrel': { itemKind: 'barrel', idle: 'closed', mood: 'pantry' },
};
type Pane = FrameContentDefinition['panes'][number];
/** Game copy is sentence case: "Cancel batch", "Collect to confirm". */
const sentenceCase = (text: string) => text ? text.charAt(0) + text.slice(1).toLowerCase() : text;

/** The approved game layouts: a fitted wood (or crate) window with the entity's side on the left,
 * the scrolling backpack on the right and the hotbar centred under a carved divider. */
function uiDesignedContentFrame(options: UiContentFrameOptions): UiContentFrameElement {
  const definition = options.definition, refresh: (() => void)[] = [];
  let state = options.state ?? {}, timing: TimingProjection = options.timing ?? { status: 'idle', reason: null, stage: null, progress: 0, remainingActiveTicks: null, nextTransitionTick: null, confidence: 'estimated' };
  const shown = (value?: { readonly state: string; readonly equals: boolean | number | string }) => !value || state[value.state] === value.equals;
  const bindingsOf = (pane: Pane) => resolveFramePaneSlots(pane, options.aliases, options.registry);
  const common = { controller: options.controller, artwork: options.artwork, iconAnimation: options.iconAnimation };
  const custom = (pane: Pane) => options.renderPane?.(pane);
  const cells = (pane: Pane) => bindingsOf(pane).map(binding => ({ id: String(binding.index), index: binding.index }));
  const grid = (pane: Pane) => { const bindings = bindingsOf(pane); if (!bindings.length) return null;
    return uiInventoryGrid({ ...common, id: `${definition.id}.pane.${pane.id}`, container: bindings[0]!.containerId, cells: cells(pane), columns: pane.columns ?? 'auto', fixedColumns: true, layout: { width: 'fit' } }); };
  const panel = (pane: Pane, label: string) => { const bindings = bindingsOf(pane); if (!bindings.length) return null;
    const controls = options.inventoryControls?.[bindings[0]!.containerId];
    return uiFlex({ id: `pane:${pane.id}`, direction: 'column', gap: 4, shrink: 0 }, [uiText(label, { role: 'label' }),
      uiInventoryPanel({ ...common, ...controls, id: `${definition.id}.pane.${pane.id}`, container: bindings[0]!.containerId, cells: cells(pane), columns: pane.columns ?? 5, visibleRows: Math.min(4, pane.rows ?? 4), layout: { width: uiFixed((pane.columns ?? 5) * 30 - 2 + 24) } })]); };
  const isBackpack = (pane: Pane) => 'self' in pane.bind && pane.bind.self === 'backpack';
  const isEntity = (pane: Pane) => 'entitySlots' in pane.bind;
  const backpackPane = definition.panes.find(isBackpack);
  const machine = UI_STATION_MACHINES[definition.id];
  const timingPane = definition.panes.find(pane => 'timing' in pane.bind);
  const children: UiElement[] = [];
  // Panes honour visibleWhen: hidden panes leave the tree's reachable set (and prediction) entirely.
  const visible = <T extends UiElement>(pane: Pane, node: T): T => { if (pane.visibleWhen) refresh.push(() => { const display = shown(pane.visibleWhen) ? 'flex' : 'none'; if (node.style.display !== display) node.setStyle({ display }); }); return node; };
  // Buttons honour visibleWhen through the shared refresh list.
  const actions = (definition.buttons ?? []).map(button => {
    const node = uiButton({ label: sentenceCase(button.label), tone: button.tone === 'default' ? 'primary' : button.tone, onPress: () => options.onInvoke?.(button.interaction) });
    refresh.push(() => { const display = shown(button.visibleWhen) ? 'flex' : 'none'; if (node.style.display !== display) node.setStyle({ display }); });
    return node;
  });
  // Pending private jobs (cooking batches) read their label and progress from frame state.
  const stateLine = (pane: Pane) => {
    // Authored bars bound to process progress read the live value; state bars and labels track frame state.
    if (pane.kind === 'bar' && !('state' in pane.bind)) return visible(pane, uiMeter({ label: pane.label ?? 'Progress', value: () => typeof options.progress === 'function' ? options.progress() : options.progress ?? timing.progress, tone: 'warning', layout: { width: uiFixed(120) } }));
    if (!('state' in pane.bind)) return null; const key = pane.bind.state;
    const node = pane.kind === 'bar' ? uiMeter({ label: pane.label ?? 'Progress', value: Number(state[key] ?? 0), tone: 'warning', layout: { width: uiFixed(120) } }) : uiText('', { wrap: true, align: 'center', layout: { width: uiFixed(140) } });
    refresh.push(() => { const display = shown(pane.visibleWhen) && (pane.kind === 'bar' || state[key]) ? 'flex' : 'none'; if (node.style.display !== display) node.setStyle({ display });
      if (pane.kind === 'bar') { const value = Number(state[key] ?? 0); if (node.props['value'] !== value) node.setProps({ value }); }
      else if (node.props['text'] !== String(state[key] ?? '')) node.setProps({ text: String(state[key] ?? '') }); });
    return node;
  };
  if (machine || timingPane) {
    const entity = definition.panes.filter(pane => isEntity(pane) && !custom(pane));
    // An entity side with a sort control (the preserving barrel) keeps a touch-reachable sort glyph beside its slots.
    const slotFor = (pane: Pane) => { const g = grid(pane); if (!g) return null;
      const controls = options.inventoryControls?.[bindingsOf(pane)[0]!.containerId];
      const sort = controls?.onSort ? uiGlyphButton({ glyph: 'glyph.sort', id: `${definition.id}.pane.${pane.id}.sort`, label: 'Sort & stack', onPress: () => { if (controls.sortEnabled?.() !== false) controls.onSort!(); } }) : null;
      if (sort && controls?.sortEnabled) refresh.push(() => { const disabled = !controls.sortEnabled!(); if (sort.disabled !== disabled) sort.setDisabled(disabled); });
      return visible(pane, uiStationSlot((pane.label ?? pane.id).toUpperCase(), sort ? uiFlex({ direction: 'row', gap: 4, align: 'start' }, [g, sort]) : g)); };
    const inputs = entity.filter(pane => !pane.restriction?.readOnly).flatMap(pane => { const node = slotFor(pane); return node ? [node] : []; });
    const outputs = entity.filter(pane => pane.restriction?.readOnly).flatMap(pane => { const node = slotFor(pane); return node ? [node] : []; });
    const status = () => sentenceCase(timingLabels(timing).status), time = () => timingLabels(timing).time.toLowerCase();
    const well = machine ? uiStationMachine({ label: definition.title, asset: () => options.artwork?.[machine.itemKind], idle: machine.idle, running: machine.running, active: () => timing.status === 'running', mood: machine.mood }) : uiFlex({ width: uiFixed(72), height: uiFixed(80) }, []);
    const layout = uiStationLayout({ emblem: machine ? uiItemImage({ itemKind: machine.itemKind, artwork: options.artwork, size: 24 }) : undefined,
      inputs, outputs, machine: well, progress: timing.progress, status: status(),
      actions: [...definition.panes.flatMap(pane => { const node = stateLine(pane); return node ? [node] : []; }), ...actions] });
    // Status and remaining time are separate lines beside the emblem, as the timing pane always showed them.
    const header = layout.children[0]!, statusText = header.children.at(-1)!, meter = layout.children[1]!.children[1]!.children[1]!;
    const timeText = uiText(time(), { role: 'caption' }); header.append(timeText);
    refresh.push(() => { const text = status(), remaining = time(); if (statusText.props['text'] !== text) statusText.setProps({ text }); if (timeText.props['text'] !== remaining) timeText.setProps({ text: remaining });
      if (meter.props['value'] !== timing.progress) meter.setProps({ value: timing.progress }); });
    children.push(layout);
  } else {
    for (const pane of definition.panes) {
      if (pane === backpackPane) continue;
      const override = custom(pane); if (override) { children.push(override); continue; }
      if (pane.kind === 'paper_doll') { const bindings = bindingsOf(pane); children.push(uiFlex({ direction: 'column', gap: 4, shrink: 0 }, [uiText((pane.label ?? 'Equipment').toUpperCase(), { role: 'label' }),
        uiPaperDoll({ ...common, id: `${definition.id}.pane.${pane.id}`, container: bindings[0]?.containerId ?? 'equipment', cells: cells(pane), portrait: options.portrait })])); continue; }
      if (isEntity(pane)) { const node = panel(pane, (pane.label ?? pane.id).toUpperCase()); if (node) children.push(visible(pane, node)); continue; }
      const line = stateLine(pane); if (line) children.push(line);
    }
    if (actions.length) children.push(uiFlex({ direction: 'column', gap: 4, justify: 'center' }, actions));
  }
  if (backpackPane) { const node = panel(backpackPane, 'BACKPACK'); if (node) children.push(node); }
  // The hotbar keeps one row of ten where it fits and breaks into rows of five on narrow screens.
  const hotbar = definition.hotbar && options.aliases.hotbar ? uiInventoryGrid({ ...common, container: options.aliases.hotbar, count: HOTBAR_SLOT_COUNT, columns: HOTBAR_SLOT_COUNT, hotkeys: true, layout: { shrink: 0, width: 'fit', maxWidth: { mode: 'percent', fraction: 1 } } }) : undefined;
  const storage = options.aliases.entity === 'chest';
  const frame = uiWindow({ id: definition.id, title: definition.title, frame: storage ? 'crate' : 'wood', onClose: options.onClose,
    // Sections sit side by side, tops aligned so their headings line up (owner item 8),
    // and stack on screens too narrow for both.
    layout: { direction: 'row', wrap: true, gap: 16, align: 'start' }, children, footer: hotbar });
  // Hosts may position the window, but it always sizes itself to its content.
  if (options.layout) frame.setStyle({ ...frame.style, ...options.layout, width: frame.style.width, height: frame.style.height });
  const updateState = (next: NonNullable<UiContentFrameOptions['state']>): void => { state = next; for (const update of refresh) update(); };
  updateState(state);
  return Object.assign(frame, { updateState, updateTiming: (next: TimingProjection) => { timing = next; for (const update of refresh) update(); frame.invalidate(); } });
}
