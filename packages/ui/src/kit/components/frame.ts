import { UI_BOOK_PAGE_REPEAT_SLICE } from '../../design-system/frame.js';
import { nineSlicePatches } from '../../nine-slice.js';
import { selectAtlasFrame } from '../../sprite.js';
import type { UiPoint, UiSize } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiSpace, UiSurfaceStyle, UiTone } from '../tokens.js';
import { paintUiMissingArt, paintUiSkin } from './art.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
export interface UiFrameOptions {
  readonly id?: string; readonly style?: UiSurfaceStyle; readonly tone?: UiTone;
  readonly header?: { readonly title: string; readonly content?: UiElement; readonly ribbon?: boolean; readonly closable?: boolean; readonly draggable?: boolean; readonly onClose?: () => void };
  readonly blockInput?: boolean;
  readonly resizable?: { readonly min: UiSize; readonly max?: UiSize; readonly handles?: 'corner' | 'corners' | 'edges' | 'all'; readonly onResize?: (size: UiSize) => void };
  readonly layout?: UiStyle; readonly children?: readonly UiElement[];
  readonly slots?: { readonly leading?: UiElement; readonly body?: UiElement; readonly trailing?: UiElement };
}
export function uiFrame(options: UiFrameOptions = {}): UiElement {
  const surface = options.style ?? 'tonal', tone = options.tone ?? 'primary';
  const padding: UiSpace = surface === 'unframed' ? 0 : surface === 'wood_parchment' || surface === 'book' ? 24
    : surface === 'thin' || surface.includes('parchment') || surface.startsWith('grey') ? 8 : 16;
  if (options.slots && options.children?.length) throw new Error('Frame accepts named slots or free children');
  const children = options.slots ? [uiFlex({ direction: 'row', wrap: true, gap: 8, width: 'grow', height: 'grow' },
    Object.entries(options.slots).map(([name, child]) => uiFlex({ direction: 'column', grow: name === 'body' ? 1 : 0, basis: uiFixed(80), gap: 4 }, [child]).setProps({ slot: name })))] : options.children;
  const content = (options.layout?.overflow?.startsWith('scroll') ? uiScrollArea : uiFlex)({ ...options.layout, position: 'relative', inset: undefined, width: 'grow', height: options.layout?.height && options.layout.height !== 'fit' ? 'grow' : 'fit', minWidth: undefined, minHeight: undefined,
    maxWidth: undefined, maxHeight: undefined, padding: options.layout?.padding ?? 0, zLayer: undefined }, children);
  const frame = new UiElement({ id: options.id, kind: 'frame', label: options.header?.title,
    pointerMode: options.blockInput ? 'capture' : undefined,
    onPointer: options.blockInput ? () => true : undefined, onWheel: options.blockInput ? () => true : undefined,
    props: { tone, surface }, style: { ...options.layout, display: 'flex', direction: 'column', wrap: false, gap: 0, padding: 0, overflow: 'clip' },
    onFocus(focused, element) { if (focused && element.parent?.props['windowStack'] && element.parent.children.at(-1) !== element) element.parent.append(element); },
    measure(element) {
      const height = element.style.height && element.style.height !== 'fit' ? 'grow' : 'fit';
      for (const child of [chrome, content]) if (child.style.height !== height) child.setStyle({ height });
      return { min: { width: 0, height: 0 }, preferred: { width: 0, height: 0 } };
    },
    paint(element, { context, art }) {
      if (!art || surface === 'unframed') return;
      const r = element.rect;
      if (art.missingArt) { paintUiMissingArt(context, r, art); return; }
      if (surface === 'book') {
        const book = art.skin.book['book_open.base.0']!;
        const source = selectAtlasFrame(book.asset.metadata, book.entry.group);
        if (!source) return;
        const sourceLeft = Math.floor(source.width / 2), left = Math.floor(r.width / 2);
        for (const side of [0, 1]) {
          const s = { ...source, x: source.x + side * sourceLeft, width: side ? source.width - sourceLeft : sourceLeft };
          const d = { ...r, x: r.x + side * left, width: side ? r.width - left : left };
          for (const patch of nineSlicePatches(s, d, UI_BOOK_PAGE_REPEAT_SLICE)) {
            const a = patch.source, b = patch.destination;
            context.drawImage(book.asset.image, a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height);
          }
        }
      } else if (surface === 'wood_parchment') {
        paintUiSkin(context, art.skin.frame, 'wood', r);
        paintUiSkin(context, art.skin.frame, 'parchment', { x: r.x + 10, y: r.y + 10, width: Math.max(0, r.width - 20), height: Math.max(0, r.height - 20) });
      } else paintUiSkin(context, art.skin.frame, surface === 'tonal' ? `${tone}.idle`
        : ['wood', 'parchment', 'thin'].includes(surface) ? surface : `${surface}.idle`, r);
    },
  });
  const chrome = uiFlex({ width: 'grow', height: options.layout?.height && options.layout.height !== 'fit' ? 'grow' : 'fit', direction: 'column', gap: 8, padding }, []);
  frame.append(chrome);
  if (options.header) {
    const { title, closable, draggable, onClose } = options.header;
    const titleNode = options.header.content ?? (options.header.ribbon ? new UiElement({ kind: 'frame-ribbon', label: title, props: { tone: 'primary' },
      style: { width: uiFixed(64), height: uiFixed(20), padding: { left: 16, right: 16, top: 4 } },
      children: [uiText(title, { overflow: 'ellipsis', align: 'center', layout: { width: 'grow' } })],
      paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.feedback, 'ribbon.base.0', element.rect); },
    }) : uiText(title, { role: 'header', wrap: false, layout: { width: 'grow' } }));
    const header = uiFlex({ direction: 'row', width: 'grow', height: uiFixed(24), gap: 4, align: 'center', shrink: 0 }, [
      titleNode,
      ...(closable ? [uiButton({ label: 'X', size: 'sm', layout: { width: uiFixed(20) }, onPress: () => { onClose?.(); frame.setStyle({ visible: false }); } })] : []),
    ]);
    if (draggable) {
      let drag: { point: UiPoint; origin: UiPoint } | null = null;
      const handle = new UiElement({ kind: 'frame-header', label: `Move ${title}`, focusable: true,
        pointerMode: 'capture', style: { display: 'stack', width: 'grow', height: uiFixed(24), shrink: 0 }, children: [header],
        onPointer(event) {
          const parent = frame.parent?.contentRect ?? { x: 0, y: 0 };
          if (event.type === 'down' && event.button === 0) { drag = { point: event.point, origin: { x: frame.rect.x - parent.x, y: frame.rect.y - parent.y } }; event.capture(); return true; }
          if (event.type === 'move' && drag) { frame.setStyle({ position: 'absolute', inset: { left: uiFixed(Math.max(0, drag.origin.x + event.point.x - drag.point.x)), top: uiFixed(Math.max(0, drag.origin.y + event.point.y - drag.point.y)) } }); return true; }
          if (drag && (event.type === 'up' || event.type === 'cancel')) { drag = null; event.release(); return true; } return false;
        },
        onKey(event) {
          const delta = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
          if (!delta) return false;
          const parent = frame.parent?.contentRect ?? { x: 0, y: 0 };
          frame.setStyle({ position: 'absolute', inset: { left: uiFixed(Math.max(0, frame.rect.x - parent.x + delta[0]!)), top: uiFixed(Math.max(0, frame.rect.y - parent.y + delta[1]!)) } }); return true;
        },
      });
      chrome.append(handle);
    } else chrome.append(header);
  }
  chrome.append(content);
  if (options.resizable) {
    const resize = options.resizable;
    const edges = resize.handles === 'all' ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
      : resize.handles === 'corners' ? ['nw', 'ne', 'se', 'sw'] : resize.handles === 'edges' ? ['n', 'e', 's', 'w'] : ['se'];
    for (const edge of edges) {
      let drag: { point: UiPoint; size: UiSize; origin: UiPoint } | null = null;
      const apply = (dx: number, dy: number, origin = frame.rect, initial: UiSize = frame.rect) => {
        const width = initial.width + (edge.includes('w') ? -dx : edge.includes('e') ? dx : 0);
        const height = initial.height + (edge.includes('n') ? -dy : edge.includes('s') ? dy : 0);
        const size = { width: Math.round(Math.max(resize.min.width, Math.min(resize.max?.width ?? Infinity, width))),
          height: Math.round(Math.max(resize.min.height, Math.min(resize.max?.height ?? Infinity, height))) };
        const parent = frame.parent?.contentRect ?? { x: 0, y: 0 };
        frame.setStyle({ width: uiFixed(size.width), height: uiFixed(size.height),
          ...(edge.includes('n') || edge.includes('w') ? { position: 'absolute', inset: {
            left: uiFixed(Math.max(0, origin.x - parent.x + (edge.includes('w') ? initial.width - size.width : 0))),
            top: uiFixed(Math.max(0, origin.y - parent.y + (edge.includes('n') ? initial.height - size.height : 0))),
          } } : {}) }); resize.onResize?.(size);
      };
      frame.append(new UiElement({ kind: 'resize-handle', label: `Resize ${options.header?.title ?? 'frame'}${edges.length > 1 ? ` ${edge}` : ''}`, focusable: true, pointerMode: 'capture',
        props: { edge }, style: { position: 'absolute', inset: {
          ...(edge.includes('w') ? { left: 0 } : edge.includes('e') ? { right: 0 } : { left: 16, right: 16 }),
          ...(edge.includes('n') ? { top: 0 } : edge.includes('s') ? { bottom: 0 } : { top: 16, bottom: 16 }),
        }, ...(edge.length === 2 ? { width: uiFixed(16), height: uiFixed(16) } : edge === 'n' || edge === 's' ? { height: uiFixed(4) } : { width: uiFixed(4) }) },
        children: edge.length === 2 ? [uiText('+', { align: 'center', layout: { width: 'grow', height: 'grow' } })] : [],
        onPointer(event) {
          if (event.type === 'down' && event.button === 0) { drag = { point: event.point, size: frame.rect, origin: frame.rect }; event.capture(); return true; }
          if (event.type === 'move' && drag) { apply(event.point.x - drag.point.x, event.point.y - drag.point.y, { ...drag.origin, ...drag.size }, drag.size); return true; }
          if (drag && (event.type === 'up' || event.type === 'cancel')) { drag = null; event.release(); return true; } return false;
        },
        onKey(event) {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return false;
          apply(event.key === 'ArrowRight' ? 8 : event.key === 'ArrowLeft' ? -8 : 0, event.key === 'ArrowDown' ? 8 : event.key === 'ArrowUp' ? -8 : 0); return true;
        },
      }));
    }
  }
  return frame;
}
