import { UiElement } from '../runtime/element.js';
import { uiOffset, type UiStyle } from '../layout/box.js';
import { uiNameplate } from './feedback-game.js';
export interface UiNameplateLabel { readonly id?: string; readonly x: number; readonly y: number; readonly text: string; readonly offline?: boolean }
export interface UiNameplatesOptions { readonly labels?: readonly UiNameplateLabel[]; readonly layout?: UiStyle }
/** Projected world anchors are data. Each label is the classic white-on-black plate (offline players greyed
 * and marked "[offline]" on the same line); off-screen anchors do not stick to viewport edges. */
export function uiNameplates(options: UiNameplatesOptions = {}): UiElement {
  const nodes = new Map<string, { readonly text: string; readonly node: UiElement }>();
  return new UiElement({ kind: 'nameplates', props: { labels: options.labels ?? [] },
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout },
    measure(element, available) {
      const visible = new Set<string>();
      (element.props['labels'] as readonly UiNameplateLabel[]).forEach((label, index) => {
        if (!Number.isFinite(label.x + label.y) || label.x < 0 || label.y < 0 || label.x > available.width || label.y > available.height) return;
        const id = label.id ?? String(index); visible.add(id);
        const text = `${label.text}${label.offline ? ' [offline]' : ''}`;
        const key = `${label.offline ?? false}:${text}`;
        let entry = nodes.get(id);
        if (entry?.text !== key) {
          entry?.node.dispose();
          const name = label.text.length > 28 ? `${label.text.slice(0, 27)}.` : label.text;
          const node = uiNameplate({ id: `nameplate:${id}`, name: label.offline ? `${name} [offline]` : name, kind: label.offline ? 'offline' : 'player' });
          node.setStyle({ position: 'absolute', anchor: { target: 'top_left', self: 'bottom', constrain: false } });
          node.label = text;
          element.append(node); entry = { text: key, node }; nodes.set(id, entry);
        }
        entry.node.setStyle({ inset: { left: uiOffset(label.x), top: uiOffset(label.y) } });
      });
      for (const [id, entry] of nodes) if (!visible.has(id)) { entry.node.dispose(); nodes.delete(id); }
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
}
