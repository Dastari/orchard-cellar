import { containsPoint, type UiPoint, type UiRect, type UiSize } from './geometry.js';

export type WidgetKind = 'root' | 'panel' | 'label' | 'icon' | 'button' | 'bar' | 'slider' | 'toggle' | 'scrollbar' | 'slot' | 'inventory_grid' | 'window' | 'tooltip' | 'speech_bubble' | 'cursor' | 'row' | 'column';
export type UiPointerEventKind = 'pointer_down' | 'pointer_up' | 'pointer_move' | 'click';
export type UiPointerMode = 'capture' | 'passthrough';

export interface UiPointerEvent {
  readonly kind: UiPointerEventKind;
  readonly point: UiPoint;
  readonly button: number;
}

export interface UiWheelEvent {
  readonly point: UiPoint;
  readonly deltaX: number;
  readonly deltaY: number;
}

export interface WidgetOptions {
  readonly id: string;
  readonly kind: WidgetKind;
  readonly minSize?: UiSize;
  readonly props?: Readonly<Record<string, unknown>>;
  /** Explicit hit-layer policy. `capturePointer` remains as a compatibility alias. */
  readonly pointerMode?: UiPointerMode;
  readonly capturePointer?: boolean;
  readonly enabled?: boolean;
  readonly onPointer?: (event: UiPointerEvent, widget: WidgetNode) => boolean;
  readonly onWheel?: (event: UiWheelEvent, widget: WidgetNode) => boolean;
  readonly paint?: (context: CanvasRenderingContext2D, widget: WidgetNode) => void;
}

/** Stable retained node: bounds/state update without rebuilding event identity. */
export class WidgetNode {
  readonly id: string;
  readonly kind: WidgetKind;
  readonly minSize: UiSize;
  readonly props: Readonly<Record<string, unknown>>;
  readonly pointerMode: UiPointerMode;
  readonly capturePointer: boolean;
  readonly onPointer?: WidgetOptions['onPointer'];
  readonly onWheel?: WidgetOptions['onWheel'];
  readonly paint?: WidgetOptions['paint'];
  readonly children: WidgetNode[] = [];
  bounds: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  visible = true;
  enabled: boolean;

  constructor(options: WidgetOptions) {
    this.id = options.id;
    this.kind = options.kind;
    this.minSize = options.minSize ?? { width: 0, height: 0 };
    this.props = options.props ?? {};
    this.pointerMode = options.pointerMode ?? (options.capturePointer === true ? 'capture' : 'passthrough');
    this.capturePointer = this.pointerMode === 'capture';
    this.enabled = options.enabled ?? true;
    this.onPointer = options.onPointer;
    this.onWheel = options.onWheel;
    this.paint = options.paint;
  }

  add(...children: readonly WidgetNode[]): this { this.children.push(...children); return this; }
  setBounds(bounds: UiRect): this { this.bounds = bounds; return this; }
  contains(point: UiPoint): boolean { return this.visible && containsPoint(this.bounds, point); }

  draw(context: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    this.paint?.(context, this);
    for (const child of this.children) child.draw(context);
  }
}

export function widget(kind: WidgetKind, id: string, options: Omit<WidgetOptions, 'kind' | 'id'> = {}): WidgetNode {
  return new WidgetNode({ id, kind, ...options });
}

export interface WidgetLayoutEntry {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: WidgetKind;
  readonly bounds: UiRect;
  readonly depth: number;
  readonly paintOrder: number;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly pointerMode: UiPointerMode;
}

/** Stable, renderer-independent geometry for the UI lab inspector and diagnostics. */
export function inspectWidgetLayout(root: WidgetNode): readonly WidgetLayoutEntry[] {
  const entries: WidgetLayoutEntry[] = [];
  const ids = new Set<string>();
  const visit = (node: WidgetNode, parentId: string | null, depth: number): void => {
    if (ids.has(node.id)) throw new Error(`Duplicate widget id: ${node.id}`);
    ids.add(node.id);
    entries.push({
      id: node.id,
      parentId,
      kind: node.kind,
      bounds: { ...node.bounds },
      depth,
      paintOrder: entries.length,
      visible: node.visible,
      enabled: node.enabled,
      pointerMode: node.pointerMode,
    });
    for (const child of node.children) visit(child, node.id, depth + 1);
  };
  visit(root, null, 0);
  return entries;
}
