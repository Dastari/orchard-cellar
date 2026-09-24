import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiButton, type UiButtonOptions } from './button.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { uiBanner, uiBadge } from './anchors.js';
import { uiText } from './text.js';
import { uiViewport, type UiViewportOptions } from './viewport.js';
function hudButton(options: UiButtonOptions): UiElement {
  const button = uiButton(options);
  return new UiElement({ ...button.hooks, children: [...button.children], onKey(event, element) {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) return true;
    return button.hooks.onKey?.(event, element) ?? false;
  } });
}
export interface UiZoneHeaderModel {
  readonly title: string; readonly subtitle?: string;
  readonly watch?: { readonly time: string; readonly date: string; readonly moon: string };
  readonly onlineCount?: number; readonly collapsed?: boolean;
}
export interface UiZoneHeaderOptions extends UiZoneHeaderModel {
  readonly onToggle?: () => void; readonly onPlayers?: () => void; readonly layout?: UiStyle;
}
export interface UiZoneHeaderElement extends UiElement { updateZoneHeader(model: UiZoneHeaderModel): void }
/** Zone identity, optional equipped-watch information, and player-list action. */
export function uiZoneHeader(options: UiZoneHeaderOptions): UiZoneHeaderElement {
  const banner = uiBanner({ label: options.title, layout: { width: 'grow', height: uiFixed(34), justify: 'center' } });
  const title = banner.children[0]!;
  const subtitle = uiText('', { overflow: 'ellipsis', align: 'center', layout: { width: 'grow', visible: false } }); banner.append(subtitle);
  const toggle = new UiElement({ id: 'hud.zone', label: `Collapse ${options.title}`, focusable: true, pointerMode: 'capture',
    style: { display: 'stack', width: 'grow', height: uiFixed(34) }, children: [banner],
    onPointer(event) { if (event.type === 'down' && event.button === 0) { options.onToggle?.(); return true; } return false; },
    onKey(event) { if (!['Enter',' '].includes(event.key)) return false; if (!event.repeat) options.onToggle?.(); return true; },
  });
  const collapsed = hudButton({ activateOn: 'down', id: 'hud.zone.expand', ariaLabel: 'Expand zone name', label: '>', size: 'sm', onPress: options.onToggle, layout: { width: 'grow' } });
  const online = hudButton({ activateOn: 'down', id: 'hud.online-players', ariaLabel: 'Online players', label: String(options.onlineCount ?? 0), size: 'sm', onPress: options.onPlayers,
    layout: { width: uiFixed(24), height: uiFixed(24), shrink: 0, alignSelf: 'center' } });
  const row = uiFlex({ direction: 'row', width: 'grow', gap: 2 }, [toggle, online]);
  const watch = uiBadge({ label: ' ', layout: { width: 'grow', height: uiFixed(18) } });
  const root = uiFlex({ gap: 2, ...options.layout }, [collapsed, row, watch]);
  const updateZoneHeader = (model: UiZoneHeaderModel) => {
    title.setProps({ text: model.title }); toggle.label = `Collapse ${model.title}`;
    subtitle.setProps({ text: model.subtitle ?? '' }).setStyle({ visible: Boolean(model.subtitle) });
    online.setProps({ label: String(model.onlineCount ?? 0) }); online.label = `Online players · ${model.onlineCount ?? 0}`;
    watch.setProps({ label: model.watch ? `${model.watch.time} ${model.watch.date} ${model.watch.moon}` : '' });
    watch.setStyle({ visible: Boolean(model.watch) && !model.collapsed });
    collapsed.setStyle({ visible: Boolean(model.collapsed) }); row.setStyle({ visible: !model.collapsed });
  };
  updateZoneHeader(options); return Object.assign(root, { updateZoneHeader });
}
export interface UiMinimapModel { readonly collapsed?: boolean; readonly zoom: number }
export interface UiMinimapOptions extends UiMinimapModel {
  readonly minZoom?: number; readonly maxZoom?: number;
  readonly onToggle?: () => void; readonly onZoom?: (zoom: number) => void;
  readonly render?: UiViewportOptions['render']; readonly content?: UiElement; readonly layout?: UiStyle;
}
export interface UiMinimapElement extends UiElement { updateMinimap(model: UiMinimapModel): void }
export function uiMinimap(options: UiMinimapOptions): UiMinimapElement {
  let model: UiMinimapModel = options;
  const zoom = (delta: number) => options.onZoom?.(Math.max(options.minZoom ?? 1, Math.min(options.maxZoom ?? 4, model.zoom + delta)));
  const collapsed = hudButton({ activateOn: 'down', id: 'hud.minimap.expand', ariaLabel: 'Expand minimap', label: '<', size: 'sm', onPress: options.onToggle, layout: { width: 'grow', height: 'grow' } });
  const viewport = options.content ?? (options.render ? uiViewport({ label: 'Minimap terrain', render: options.render }) : uiText('Map data unavailable.'));
  const map = new UiElement({ id: 'hud.minimap', label: 'Collapse minimap', pointerMode: 'capture', focusable: true,
    style: { display: 'stack', width: 'grow', height: 'grow' }, children: [viewport],
    onPointer(event) { if (event.type === 'down' && event.button === 0) { options.onToggle?.(); return true; } return false; },
    onKey(event) { if (!['Enter',' '].includes(event.key)) return false; if (!event.repeat) options.onToggle?.(); return true; },
  });
  const out = hudButton({ activateOn: 'down', id: 'hud.minimap.zoom-out', ariaLabel: 'Zoom out', label: '-', size: 'sm', onPress: () => zoom(-1) });
  const into = hudButton({ activateOn: 'down', id: 'hud.minimap.zoom-in', ariaLabel: 'Zoom in', label: '+', size: 'sm', onPress: () => zoom(1) });
  const label = uiText('', { align: 'center', overflow: 'ellipsis', layout: { width: 'grow' } });
  const frame = uiFrame({ style: 'thin', layout: { width: 'grow', height: 'grow', padding: 0, gap: 2 }, children: [map,
    uiFlex({ direction: 'row', width: 'grow', gap: 2, height: uiFixed(16), shrink: 0, align: 'center' }, [out, label, into]),
  ] });
  const root = new UiElement({ style: { display: 'stack', ...options.layout }, children: [collapsed, frame],
    onPointer(event) { if (event.type === 'down' && event.button === 0) { options.onToggle?.(); return true; } return false; },
    onWheel(event) { if (model.collapsed || event.deltaY === 0) return false; zoom(event.deltaY < 0 ? 1 : -1); return true; },
  });
  const updateMinimap = (next: UiMinimapModel) => {
    model = next; collapsed.setStyle({ visible: Boolean(model.collapsed) }); frame.setStyle({ visible: !model.collapsed });
    out.setDisabled(model.zoom <= (options.minZoom ?? 1)); into.setDisabled(model.zoom >= (options.maxZoom ?? 4)); label.setProps({ text: `MAP ${model.zoom}X` });
  };
  updateMinimap(options); return Object.assign(root, { updateMinimap });
}
