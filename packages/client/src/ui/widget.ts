import { containsPoint, type UiPoint, type UiRect, type UiSize } from './geometry.js';

export type WidgetKind = 'root' | 'panel' | 'label' | 'icon' | 'button' | 'bar' | 'slider' | 'scrollbar' | 'slot' | 'inventory_grid' | 'window' | 'tooltip' | 'speech_bubble' | 'cursor' | 'row' | 'column';
export type UiPointerEventKind = 'pointer_down' | 'pointer_up' | 'pointer_move' | 'click';

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
    this.capturePointer = options.capturePointer ?? false;
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
