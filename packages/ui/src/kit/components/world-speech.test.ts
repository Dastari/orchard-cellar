import { describe, expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiWorldSpeech, uiWorldSpeechTone } from './world-speech.js';

describe('world speech', () => {
  it('uses distinct semantic tones for public, shouted and private speech', () => {
    expect(['say', 'shout', 'tell', 'guild', 'thought', 'reserved', 'other'].map(kind => uiWorldSpeechTone(kind as Parameters<typeof uiWorldSpeechTone>[0])))
      .toEqual(['neutral', 'danger', 'info', 'success', 'muted', 'warning', 'primary']);
  });
  it.each(['up', 'down', 'left', 'right'] as const)('keeps a %s edge bubble and its words inside the viewport', direction => {
    const root = new UiRoot({ scale: 1 }); root.resize(240, 200);
    root.mount(uiWorldSpeech({ messages: [{ id: 'edge', x: direction === 'right' ? 232 : 8, y: direction === 'down' ? 192 : 8,
      direction, kind: 'shout', text: 'There are apples by the old cellar.' }] })); root.arrange();
    const bubble = root.entries().find(entry => entry.element.kind === 'speech-bubble')!.element;
    expect(bubble.rect).toEqual(bubble.clip);
    const text = bubble.children[0]!; expect(text.label).toBe('There are apples by the old cellar.'); expect(text.rect).toEqual(text.clip); root.dispose();
  });
  it('retains moving messages, removes expired messages and changes channel art with content', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(320, 240);
    const message = { id: 'private', x: 160, y: 120, kind: 'tell' as const, text: 'Meet me there.' };
    const node = root.mount(uiWorldSpeech({ messages: [message] })); root.arrange(); const bubble = node.children[0]!;
    node.setProps({ messages: [{ ...message, x: 170 }] }); root.arrange(); expect(node.children[0]).toBe(bubble);
    node.setProps({ messages: [{ ...message, kind: 'thought' }] }); root.arrange(); expect(bubble.disposed).toBe(true);
    expect(node.children[0]!.props['tone']).toBe('muted');
    node.setProps({ messages: [] }); root.arrange(); expect(node.children).toHaveLength(0); root.dispose();
  });
});
