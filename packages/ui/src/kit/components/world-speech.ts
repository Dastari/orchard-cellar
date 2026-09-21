import type { SpeechBubbleDirection, SpeechBubbleKind } from '../../speech-bubble.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, uiOffset, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { uiSpeechBubble } from './anchors.js';
export interface UiWorldSpeechMessage {
  readonly id: string; readonly x: number; readonly y: number; readonly text: string;
  readonly kind: SpeechBubbleKind; readonly direction?: SpeechBubbleDirection;
}
export function uiWorldSpeechTone(kind: SpeechBubbleKind): UiTone {
  return ({ say: 'neutral', shout: 'danger', tell: 'info', guild: 'success', thought: 'muted', reserved: 'warning', other: 'primary' } as const)[kind];
}
export function uiWorldSpeech(options: { readonly messages?: readonly UiWorldSpeechMessage[]; readonly layout?: UiStyle } = {}): UiElement {
  const nodes = new Map<string, { key: string; node: UiElement }>();
  return new UiElement({ kind: 'world-speech', props: { messages: options.messages ?? [] },
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout },
    measure(element, available) {
      const visible = new Set<string>();
      for (const message of element.props['messages'] as readonly UiWorldSpeechMessage[]) {
        if (!Number.isFinite(message.x + message.y)) continue;
        visible.add(message.id);
        const direction = message.direction ?? 'down', key = JSON.stringify([message.text, message.kind, direction]);
        let entry = nodes.get(message.id);
        if (!entry || entry.key !== key) {
          entry?.node.dispose();
          const node = uiSpeechBubble({ id: `world-speech:${message.id}`, text: message.text, tone: uiWorldSpeechTone(message.kind), tail: direction,
            layout: { position: 'absolute', anchor: { target: 'top_left', self: { down: 'bottom', up: 'top', left: 'left', right: 'right' }[direction] as 'bottom' | 'top' | 'left' | 'right' } } });
          element.append(node); entry = { key, node }; nodes.set(message.id, entry);
        }
        entry.node.setStyle({ maxWidth: uiFixed(Math.min(160, available.width)), maxHeight: uiFixed(available.height),
          inset: { left: uiOffset(message.x + (direction === 'left' ? 4 : direction === 'right' ? -4 : 0)),
            top: uiOffset(message.y + (direction === 'up' ? 4 : direction === 'down' ? -4 : 0)) } });
      }
      for (const [id, entry] of nodes) if (!visible.has(id)) { entry.node.dispose(); nodes.delete(id); }
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
}
