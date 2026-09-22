import type { UiPoint, UiRect } from '../../geometry.js';
import { uiFixed, uiSameRect, type UiFixedDimension, type UiStyle } from '../layout/box.js';
import { UiElement } from '../runtime/element.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiIconButton, type UiIconSource } from './media.js';
import { uiTooltip } from './tooltip.js';
import type { UiSurfaceStyle } from '../tokens.js';

export type UiWorkbenchRegion = 'workspace' | 'controls' | 'inspector';
export interface UiWorkbenchNavigation {
  readonly id: string; readonly label: string; readonly icon: UiIconSource;
  readonly selected?: boolean; readonly disabled?: boolean; readonly onPress: () => void;
}
export interface UiWorkbenchDrawer {
  readonly title: string; readonly content: UiElement; readonly width?: UiFixedDimension;
  readonly minWidth?: UiFixedDimension; readonly maxWidth?: UiFixedDimension;
  readonly visible?: boolean;
  readonly surface?: UiSurfaceStyle;
  /** Let an editor with its own scrolling body fill the available drawer. */
  readonly fill?: boolean;
}
export interface UiWorkbenchOptions {
  readonly id?: string; readonly layout?: UiStyle;
  readonly navigation: readonly UiWorkbenchNavigation[];
  readonly workspace: UiElement;
  readonly controls?: UiWorkbenchDrawer; readonly inspector?: UiWorkbenchDrawer;
  /** Narrow workspaces show one drawer at a time. The host owns the toggle. */
  readonly activeDrawer?: 'controls' | 'inspector' | 'none';
  readonly onDrawerResize?: (side: 'controls' | 'inspector', width: UiFixedDimension) => void;
  readonly onRegionArrange?: (region: UiWorkbenchRegion, rect: UiRect) => void;
  readonly onRegionVisibility?: (region: UiWorkbenchRegion, visible: boolean) => void;
}

/** Floating drawers share the retained layout, clipping, focus and input tree.
 * Width preferences survive a narrow viewport; resize reports logical fixed sizes. */
export function uiWorkbench(options: UiWorkbenchOptions): UiElement {
  const id = options.id ?? 'workbench';
  const preferences = { controls: options.controls?.width?.size ?? 135, inspector: options.inspector?.width?.size ?? 143 };
  const limits=(side:'controls'|'inspector')=>({min:options[side]?.minWidth?.size??90,max:options[side]?.maxWidth?.size??210});
  const clamp=(side:'controls'|'inspector',width:number)=>Math.max(limits(side).min,Math.min(limits(side).max,width));
  for (const side of ['controls', 'inspector'] as const) {
    const {min,max}=limits(side);uiFixed(min);uiFixed(max);uiFixed(preferences[side]);
    if(min>max)throw new RangeError('workbench_drawer_width_bounds');
    preferences[side]=clamp(side,preferences[side]);
  }
  const regions: Partial<Record<UiWorkbenchRegion, UiRect>> = {};
  const region = (name: UiWorkbenchRegion, content: UiElement) => new UiElement({
    id: `${id}.${name}.content`, kind: 'workbench-region', props: { region: name },
    style: { width: 'grow', height: 'grow', display: 'stack' }, children: [content],
    onArrange(element) {
      const previous = regions[name]; regions[name] = element.rect;
      if (!previous || !uiSameRect(previous, element.rect)) options.onRegionArrange?.(name, element.rect);
    },
  });
  const workspace = region('workspace', options.workspace);
  const drawers: Partial<Record<'controls' | 'inspector', UiElement>> = {};
  const plane = new UiElement({ id: `${id}.plane`, kind: 'workbench-plane',
    style: { width: 'grow', height: 'grow', display: 'stack' }, children: [workspace],
    onArrange(element) {
      const available = Math.max(0, element.contentRect.width - 8);
      const requested = (options.controls?.visible !== false && options.controls ? preferences.controls : 0)
        + (options.inspector?.visible !== false && options.inspector ? preferences.inspector : 0);
      const narrow = available < requested + 32;
      for (const side of ['controls', 'inspector'] as const) {
        const drawer = drawers[side], definition = options[side]; if (!drawer || !definition) continue;
        const visible = definition.visible !== false && (!narrow || side === (options.activeDrawer ?? (options.controls?.visible !== false && options.controls ? 'controls' : 'inspector')));
        const width = Math.min(available, clamp(side,preferences[side]));
        const height = Math.max(0, element.contentRect.height - 8);
        if (drawer.visible !== visible) options.onRegionVisibility?.(side, visible);
        if (drawer.visible !== visible || (drawer.style.width as UiFixedDimension).size !== width || (drawer.style.height as UiFixedDimension).size !== height) drawer.setStyle({ visible, width: uiFixed(width), height: uiFixed(height) });
        if (!visible) delete regions[side];
      }
      if (plane.props['narrow'] !== narrow) plane.setProps({ narrow }, false);
    },
  });
  for (const side of ['controls', 'inspector'] as const) {
    const definition = options[side]; if (!definition) continue;
    const drawer = new UiElement({ id: `${id}.${side}`, kind: 'workbench-drawer', pointerMode: 'capture',
      style: { position: 'absolute', display: 'stack', inset: { [side === 'controls' ? 'left' : 'right']: 4, top: 4, bottom: 4 },
        width: uiFixed(preferences[side]), height: uiFixed(0) },
      onWheel: () => true,
      children: [uiFrame({ style: definition.surface ?? 'wood_parchment', ...(definition.title ? { header: { title: definition.title } } : {}), layout: { width: 'grow', height: 'grow' },
        children: [region(side, definition.fill
          ? uiFlex({width:'grow',height:'grow',padding:{right:8}},[definition.content])
          : uiScrollArea({ width: 'grow', height: 'grow', gap: 4 }, [uiFlex({ width: 'grow', padding: { right: 8 } }, [definition.content])]))],
      })],
    });
    let drag: { point: UiPoint; width: number } | null = null;
    const apply = (width: number) => {
      preferences[side] = Math.round(clamp(side,width));
      plane.invalidate(); options.onDrawerResize?.(side, uiFixed(preferences[side]));
    };
    drawer.append(new UiElement({ id: `${id}.${side}.resize`, kind: 'workbench-resize',
      label: `Resize ${definition.title}`, focusable: true, pointerMode: 'capture', props: { side },
      style: { position: 'absolute', inset: { [side === 'controls' ? 'right' : 'left']: 0, top: 0, bottom: 0 }, width: uiFixed(6) },
      onPointer(event) {
        if (event.type === 'down' && event.button === 0) { drag = { point: event.point, width: drawer.rect.width }; event.capture(); return true; }
        if (drag && event.type === 'move') { apply(drag.width + (event.point.x - drag.point.x) * (side === 'controls' ? 1 : -1)); return true; }
        if (drag && (event.type === 'up' || event.type === 'cancel')) { drag = null; event.release(); return true; }
        return false;
      },
      onKey(event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return false;
        apply(event.key === 'Home' ? limits(side).min : event.key === 'End' ? limits(side).max : drawer.rect.width + (event.key === 'ArrowRight' ? 8 : -8) * (side === 'controls' ? 1 : -1));
        return true;
      },
    }));
    drawers[side] = drawer; plane.append(drawer);
  }
  const rail = uiWorkbenchNavigationRail(options.navigation, { id: `${id}.rail` });
  return uiFlex({ id, direction: 'row', width: 'grow', height: 'grow', gap: 0, ...options.layout }, [rail, plane])
    .setProps({ workbench: true, regions });
}

/** Shared Studio route rail, including scrolling and accessible tooltips. */
export function uiWorkbenchNavigationRail(navigation: readonly UiWorkbenchNavigation[], options: { readonly id?: string; readonly layout?: UiStyle } = {}): UiElement {
  const id = options.id ?? 'workbench.rail', buttonPrefix = id.replace(/\.rail$/u, ''), layout = options.layout;
  const rail = uiFrame({ id: id, style: 'thin', layout: { width: uiFixed(40), height: 'grow', shrink: 0, ...layout },
    children: [uiScrollArea({ width: 'grow', height: 'grow', gap: 4, padding:{right:4} }, navigation.map(item =>
      uiTooltip(item.label, uiIconButton(item.icon, { id: `${buttonPrefix}.nav.${item.id}`, label: item.label,
        tone: item.selected ? 'success' : 'primary', disabled: item.disabled, onPress: item.onPress,
        layout: { width: uiFixed(24), height: uiFixed(24), shrink: 0 } }),
      { width: uiFixed(24), height: uiFixed(24), shrink: 0 })))],
  });
  // Reserve the scrollbar gutter beside the icons, inside the frame chrome.
  rail.children[0]!.setStyle({ padding: { left: 8, right: 4, top: 8, bottom: 8 } });
  return rail;
}
