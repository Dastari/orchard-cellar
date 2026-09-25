import { drawSpeechBubbleFrame, speechBubbleInk, speechBubbleLayout, speechBubbleTone, type SpeechBubbleDirection, type SpeechBubbleKind } from '../../speech-bubble.js';
import { drawPixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, uiOffset, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
export interface UiWorldSpeechMessage {
  readonly id: string; readonly x: number; readonly y: number; readonly text: string;
  readonly kind: SpeechBubbleKind; readonly direction?: SpeechBubbleDirection;
}
export function uiWorldSpeechTone(kind: SpeechBubbleKind): UiTone {
  return ({ say: 'neutral', shout: 'danger', tell: 'info', guild: 'success', thought: 'muted', reserved: 'warning', other: 'primary' } as const)[kind];
}
/** One classic chat bubble: the authored speech frame for its channel (white for /say, red for /yell, purple
 * whispers...) with the words wrapped at 24 characters and centred, and the tail pointing at the speaker. */
function uiClassicSpeechBubble(options: { readonly id: string; readonly text: string; readonly kind: SpeechBubbleKind; readonly direction: SpeechBubbleDirection; readonly layout: UiStyle }): UiElement {
  const layout = speechBubbleLayout(options.text), sideways = options.direction === 'left' || options.direction === 'right';
  const d = options.direction, body = (r: { x: number; y: number }) => ({ x: r.x + (d === 'left' ? 5 : 0), y: r.y + (d === 'up' ? 5 : 0), width: layout.width, height: layout.height });
  const words = new UiElement({ kind: 'text', label: options.text, style: { width: 'grow', height: 'grow' },
    paint(element, { context, art }) {
      if (!art) return; const b = body(element.rect);
      layout.lines.forEach((line, index) => drawPixelText(context, art.pixel, line, b.x + b.width / 2, b.y + 7 + index * 9, { align: 'center', color: speechBubbleInk(options.kind) }));
    } });
  return new UiElement({ id: options.id, kind: 'speech-bubble', label: options.text, props: { tone: uiWorldSpeechTone(options.kind) },
    style: { display: 'stack', width: uiFixed(layout.width + (sideways ? 5 : 0)), height: uiFixed(layout.height + (sideways ? 0 : 5)),
      ...options.layout },
    children: [words],
    paint(element, { context, art }) {
      const entry = art?.skin.feedback[`speech_bubble_tail_${speechBubbleTone(options.kind)}.base.0`]; if (!entry) return;
      // The frame's tail hangs 5px outside its body rect; the element reserves that strip on the tail side.
      drawSpeechBubbleFrame(context, entry.asset, body(element.rect), d);
    } });
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
          const node = uiClassicSpeechBubble({ id: `world-speech:${message.id}`, text: message.text, kind: message.kind, direction,
            layout: { position: 'absolute', anchor: { target: 'top_left', self: { down: 'bottom', up: 'top', left: 'left', right: 'right' }[direction] as 'bottom' | 'top' | 'left' | 'right' } } });
          element.append(node); entry = { key, node }; nodes.set(message.id, entry);
        }
        entry.node.setStyle({ maxWidth: uiFixed(available.width), maxHeight: uiFixed(available.height),
          inset: { left: uiOffset(message.x + (direction === 'left' ? 4 : direction === 'right' ? -4 : 0)),
            top: uiOffset(message.y + (direction === 'up' ? 4 : direction === 'down' ? 1 : 0)) } });
      }
      for (const [id, entry] of nodes) if (!visible.has(id)) { entry.node.dispose(); nodes.delete(id); }
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
}
