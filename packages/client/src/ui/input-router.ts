import type { UiPoint } from './geometry.js';
import type { UiPointerEvent, UiWheelEvent, WidgetNode } from './widget.js';

function hitPath(node: WidgetNode, point: UiPoint): WidgetNode[] {
  if (!node.contains(point) || !node.enabled) return [];
  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const childPath = hitPath(node.children[index]!, point);
    if (childPath.length) return [...childPath, node];
  }
  return [node];
}

export class UiInputRouter {
  constructor(private readonly root: WidgetNode) {}

  routePointer(event: UiPointerEvent): boolean {
    for (const node of hitPath(this.root, event.point)) {
      if (node.onPointer?.(event, node)) return true;
      if (node.capturePointer) return true;
    }
    return false;
  }

  routeWheel(event: UiWheelEvent): boolean {
    for (const node of hitPath(this.root, event.point)) if (node.onWheel?.(event, node)) return true;
    return false;
  }
}
