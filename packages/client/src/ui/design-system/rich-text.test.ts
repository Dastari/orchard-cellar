import { describe, expect, it } from 'vitest';
import type { PixelUi } from '../../render/pixel-ui.js';
import {
  layoutUiRichText,
  parseUiRichText,
  parseUiTextLinkTarget,
  serializeUiTextLinkTarget,
  uiRichTextLinkAtPoint,
} from './rich-text.js';

const fonts = {} as PixelUi;

describe('typed canvas rich text', () => {
  it('parses item, player, and coordinate links without accepting HTML', () => {
    expect(parseUiRichText(
      'Take [[item:apple|Apple]] to [[player:farmer-7|Mira]] at [[coord:orchard,42,18|42, 18]].',
    )).toEqual([
      { text: 'Take ' },
      { text: 'Apple', link: { kind: 'item', itemKind: 'apple' } },
      { text: ' to ' },
      { text: 'Mira', link: { kind: 'player', playerId: 'farmer-7' } },
      { text: ' at ' },
      { text: '42, 18', link: { kind: 'coordinate', zone: 'orchard', x: 42, y: 18 } },
      { text: '.' },
    ]);
    expect(parseUiRichText('[[coord:orchard,nope,2|bad]] <b>safe</b>'))
      .toEqual([{ text: '[[coord:orchard,nope,2|bad]]' }, { text: ' <b>safe</b>' }]);
  });

  it('accepts typed page and HTTP links while rejecting executable destinations', () => {
    expect(parseUiTextLinkTarget('page:harvest-notes')).toEqual({
      kind: 'page', anchor: 'harvest-notes',
    });
    expect(parseUiTextLinkTarget('#CHAPTER_2')).toEqual({ kind: 'page', anchor: 'chapter_2' });
    expect(parseUiTextLinkTarget('https://example.com/help')).toEqual({
      kind: 'url', href: 'https://example.com/help',
    });
    expect(parseUiTextLinkTarget('javascript:alert(1)')).toBeNull();
    expect(parseUiRichText('Open [[page:harvest|Harvest]] or [[url:https://example.com|docs]].'))
      .toEqual([
        { text: 'Open ' },
        { text: 'Harvest', link: { kind: 'page', anchor: 'harvest' } },
        { text: ' or ' },
        { text: 'docs', link: { kind: 'url', href: 'https://example.com/' } },
        { text: '.' },
      ]);
  });

  it('round-trips stable shareable destinations through the same allowlist', () => {
    const targets = [
      { kind: 'item', itemKind: 'apple' },
      { kind: 'player', playerId: 'farmer-7' },
      { kind: 'coordinate', zone: 'orchard', x: 42, y: -18 },
      { kind: 'page', anchor: 'recipes' },
      { kind: 'url', href: 'https://example.com/help' },
    ] as const;
    for (const target of targets) {
      expect(parseUiTextLinkTarget(serializeUiTextLinkTarget(target))).toEqual(target);
    }
  });

  it('wraps, aligns, truncates, and reuses fragment bounds for link hit tests', () => {
    const runs = parseUiRichText('Visit [[item:apple|the orchard apple]] after lunch');
    const layout = layoutUiRichText(fonts, runs, { x: 10, y: 20, width: 72, height: 30 }, {
      align: 'center', maxLines: 2,
    });
    expect(layout.lineCount).toBe(2);
    expect(layout.truncated).toBe(true);
    expect(layout.fragments.at(-1)?.text).toBe('...');
    const linked = layout.fragments.find((fragment) => fragment.link !== undefined);
    expect(linked).toBeDefined();
    expect(uiRichTextLinkAtPoint(layout, {
      x: linked!.rect.x + 1,
      y: linked!.rect.y + 1,
    })).toEqual({ kind: 'item', itemKind: 'apple' });
    expect(uiRichTextLinkAtPoint(layout, { x: 0, y: 0 })).toBeNull();
  });
});
