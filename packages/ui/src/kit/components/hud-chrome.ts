import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiButton } from './button.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { uiBanner, uiBadge } from './anchors.js';
import { uiText } from './text.js';
import { uiViewport, type UiViewportOptions } from './viewport.js';
export interface UiZoneHeaderOptions {
  readonly title: string; readonly watch?: { readonly time: string; readonly date: string; readonly moon: string };
  readonly onlineCount?: number; readonly collapsed?: boolean; readonly onToggle?: () => void; readonly onPlayers?: () => void;
  readonly layout?: UiStyle;
}
/** Zone identity, optional equipped-watch information, and player-list action. */
export function uiZoneHeader(options: UiZoneHeaderOptions): UiElement {
  if (options.collapsed) return uiButton({ activateOn: 'down', id: 'hud.zone', ariaLabel: 'Expand zone name', label: '>', size: 'sm', onPress: options.onToggle, layout: options.layout });
  const banner = uiBanner({ label: options.title, layout: { width: 'grow', height: uiFixed(34), justify: 'center' } });
  const toggle = new UiElement({ id: 'hud.zone', label: `Collapse ${options.title}`, focusable: true, pointerMode: 'capture',
    style: { display: 'stack', width: 'grow', height: uiFixed(34) }, children: [banner],
    onPointer(event) { if (event.type === 'down' && event.button === 0) { options.onToggle?.(); return true; } return false; },
    onKey(event) { if (!['Enter',' '].includes(event.key)) return false; options.onToggle?.(); return true; },
  });
  return uiFlex({ gap: 2, ...options.layout }, [uiFlex({ direction: 'row', width: 'grow', gap: 2 }, [toggle,
    uiButton({ activateOn: 'down', id: 'hud.online-players', ariaLabel: 'Online players', label: String(options.onlineCount ?? 0), size: 'sm', onPress: options.onPlayers,
      layout: { width: uiFixed(24), height: uiFixed(24), shrink: 0, alignSelf: 'center' } }),
  ]), ...(options.watch ? [uiBadge({ label: `${options.watch.time} ${options.watch.date} ${options.watch.moon}`, layout: { width: 'grow', height: uiFixed(18) } })] : [])]);
}
export interface UiMinimapOptions {
  readonly collapsed?: boolean; readonly zoom: number; readonly minZoom?: number; readonly maxZoom?: number;
  readonly onToggle?: () => void; readonly onZoom?: (zoom: number) => void;
  readonly render?: UiViewportOptions['render']; readonly content?: UiElement; readonly layout?: UiStyle;
}
export function uiMinimap(options: UiMinimapOptions): UiElement {
  if (options.collapsed) return uiButton({ activateOn: 'down', id: 'hud.minimap', ariaLabel: 'Expand minimap', label: '<', size: 'sm', onPress: options.onToggle, layout: options.layout });
  const zoom = (delta: number) => options.onZoom?.(Math.max(options.minZoom ?? 1, Math.min(options.maxZoom ?? 4, options.zoom + delta)));
  const viewport = options.content ?? (options.render ? uiViewport({ label: 'Minimap terrain', render: options.render }) : uiText('Map data unavailable.'));
  const map = new UiElement({ id: 'hud.minimap', label: 'Collapse minimap', pointerMode: 'capture', focusable: true,
    style: { display: 'stack', width: 'grow', height: 'grow' }, children: [viewport],
    onPointer(event) { if (event.type === 'down' && event.button === 0) { options.onToggle?.(); return true; } return false; },
    onKey(event) { if (!['Enter',' '].includes(event.key)) return false; options.onToggle?.(); return true; },
  });
  const frame = uiFrame({ style: 'thin', layout: { width: 'grow', height: 'grow', padding: 0, gap: 2 }, children: [map,
    uiFlex({ direction: 'row', width: 'grow', gap: 2, height: uiFixed(16), shrink: 0, align: 'center' }, [
      uiButton({ activateOn: 'down', id: 'hud.minimap.zoom-out', ariaLabel: 'Zoom out', label: '-', size: 'sm', disabled: options.zoom <= (options.minZoom ?? 1), onPress: () => zoom(-1) }),
      uiText(`MAP ${options.zoom}X`, { align: 'center', overflow: 'ellipsis', layout: { width: 'grow' } }),
      uiButton({ activateOn: 'down', id: 'hud.minimap.zoom-in', ariaLabel: 'Zoom in', label: '+', size: 'sm', disabled: options.zoom >= (options.maxZoom ?? 4), onPress: () => zoom(1) }),
    ]),
  ] });
  return new UiElement({ style: { display: 'stack', ...options.layout }, children: [frame],
    onPointer(event) { if (event.type === 'down' && event.button === 0) { options.onToggle?.(); return true; } return false; },
    onWheel(event) { if (event.deltaY === 0) return false; zoom(event.deltaY < 0 ? 1 : -1); return true; },
  });
}
