import { UI_LAYERS, type UiLayer } from '../tokens.js';
import type { UiElement } from './element.js';
export interface UiPaintEntry { readonly element: UiElement; readonly layer: UiLayer; readonly order: number }
export function uiPaintEntries(tree: UiElement): UiPaintEntry[] {
  const buckets = UI_LAYERS.map(() => [] as UiPaintEntry[]);
  const ids = new Set<string>();
  let order = 0;
  function visit(node: UiElement, layer: UiLayer): void {
    if (ids.has(node.id)) throw new Error(`Duplicate UI id: ${node.id}`);
    ids.add(node.id);
    if (!node.visible) return;
    const own = node.style.zLayer ?? layer;
    buckets[UI_LAYERS.indexOf(own)]!.push({ element: node, layer: own, order: order++ });
    for (const child of node.children) visit(child, own);
  }
  visit(tree, 'base'); return buckets.flat();
}
export function uiTopModal(entries: readonly UiPaintEntry[]): UiElement | null {
  let modal: UiElement | null = null;
  for (const { element } of entries) if (element.style.zLayer === 'modal' && element.visible) modal = element;
  return modal;
}
