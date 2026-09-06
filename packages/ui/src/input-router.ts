import type { UiPoint } from './geometry.js';
import type { UiPointerEvent, UiWheelEvent, WidgetNode } from './widget.js';

/** Nodes under a point in reverse paint order, deepest children first. */
function hitStack(node: WidgetNode, point: UiPoint): WidgetNode[] {
  if (!node.contains(point) || !node.enabled) return [];
  const hits: WidgetNode[] = [];
  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    hits.push(...hitStack(node.children[index]!, point));
  }
  hits.push(node);
  return hits;
}

export class UiInputRouter {
  constructor(private readonly root: WidgetNode) {}

  hitTest(point: UiPoint): readonly WidgetNode[] {
    return hitStack(this.root, point);
  }

  routePointer(event: UiPointerEvent): boolean {
    for (const node of this.hitTest(event.point)) {
      if (node.onPointer?.(event, node)) return true;
      if (node.capturePointer) return true;
    }
    return false;
  }

  routeWheel(event: UiWheelEvent): boolean {
    for (const node of this.hitTest(event.point)) {
      if (node.onWheel?.(event, node)) return true;
      if (node.capturePointer) return true;
    }
    return false;
  }
}
