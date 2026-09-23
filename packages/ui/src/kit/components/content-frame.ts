import { uiTiming } from './timing.js';
import { HOTBAR_SLOT_COUNT, type TimingProjection, type FrameContentDefinition, type FrameRestrictionRegistry } from '@orchard/sim';
import { resolveFramePaneSlots, type FrameContainerAliases } from '../../content-frame.js';
import type { UiInventoryController } from '../runtime/inventory.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiMeter } from './meter.js';
import { uiInventoryGrid, uiPaperDoll, type UiSlotOptions } from './inventory.js';
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
}
export interface UiContentFrameElement extends UiElement {
  /** Refresh authored state without replacing inventory controls or their editors. */
  updateTiming(timing: TimingProjection): void;
  updateState(state: NonNullable<UiContentFrameOptions['state']>): void;
}
/** Frame definitions remain presentation data; the host retains write authority. */
export function uiContentFrame(options: UiContentFrameOptions): UiContentFrameElement {
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
