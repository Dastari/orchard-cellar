import { describe, expect, it } from 'vitest';
import { parseGameMarkdown, parseGameMarkdownInline } from './game-markdown.js';

describe('safe game Markdown', () => {
  it('parses common prose Markdown and typed in-game links without producing HTML', () => {
    const document = parseGameMarkdown([
      '# Harvest Notes {#harvest}',
      '',
      'Bring **twelve** [apples](item:apple) to [Mira](player:farmer-7).',
      '- Visit [orchard](coord:summer,42,18)',
      '1. Read [the cellar](page:cellar)',
      '> Raw <script>alert(1)</script> stays text.',
      '---',
      '```txt',
      '[not a link](javascript:alert)',
      '```',
    ].join('\n'));

    expect(document.blocks.map((block) => block.kind)).toEqual([
      'heading', 'paragraph', 'list_item', 'list_item', 'quote', 'rule', 'code_block',
    ]);
    expect(document.blocks[0]).toMatchObject({ kind: 'heading', level: 1, anchor: 'harvest' });
    expect(document.blocks[1]).toMatchObject({
      kind: 'paragraph',
      inlines: expect.arrayContaining([
        { text: 'twelve', style: 'strong' },
        { text: 'apples', style: 'body', link: { kind: 'item', itemKind: 'apple' } },
        { text: 'Mira', style: 'body', link: { kind: 'player', playerId: 'farmer-7' } },
      ]),
    });
    expect(document.blocks[4]).toMatchObject({
      kind: 'quote',
      inlines: [{ text: 'Raw <script>alert(1)</script> stays text.', style: 'body' }],
    });
  });

  it('supports shorthand links while leaving unsafe Markdown destinations literal', () => {
    expect(parseGameMarkdownInline('[item:324234] / [docs](https://example.com) / [bad](javascript:x)'))
      .toEqual([
        { text: '324234', style: 'body', link: { kind: 'item', itemKind: '324234' } },
        { text: ' / ', style: 'body' },
        { text: 'docs', style: 'body', link: { kind: 'url', href: 'https://example.com/' } },
        { text: ' / ', style: 'body' },
        { text: '[bad](javascript:x)', style: 'body' },
      ]);
  });

  it('captures explicit pages, bookmarks, and typed embeds as renderer data', () => {
    const document = parseGameMarkdown([
      '<!-- bookmark: recipes | Recipes | green | right | recipe-book -->',
      '# Recipe Book',
      '<!-- embed: item | orchard_tea | Orchard Tea -->',
      '<!-- page -->',
      'Automatic next page.',
      '<!-- page: 5 -->',
      'Authored page five.',
      '<!-- bookmark: map | Map | blue | left -->',
      '<!-- embed: chart | cellar-flow | Cellar Flow -->',
    ].join('\n'));

    expect(document.bookmarks).toEqual([
      {
        id: 'recipes', label: 'Recipes', color: 'green', side: 'right',
        blockIndex: 0, targetAnchor: 'recipe-book',
      },
      { id: 'map', label: 'Map', color: 'blue', side: 'left', blockIndex: 6 },
    ]);
    expect(document.blocks.map((block) => block.kind)).toEqual([
      'heading', 'embed', 'page_break', 'paragraph', 'page_break', 'paragraph', 'embed',
    ]);
    expect(document.blocks[4]).toEqual({ kind: 'page_break', sourceLine: 6, page: 5 });
    expect(document.blocks[6]).toMatchObject({
      kind: 'embed', embedKind: 'chart', reference: 'cellar-flow', label: 'Cellar Flow',
    });
  });

  it('deduplicates generated heading anchors', () => {
    const document = parseGameMarkdown('# Notes\n# Notes\n# Notes');
    expect(document.blocks.map((block) => block.kind === 'heading' ? block.anchor : null))
      .toEqual(['notes', 'notes-2', 'notes-3']);
  });

  it('bounds authored pages and discards duplicate bookmarks or unsafe embeds', () => {
    const document = parseGameMarkdown([
      '<!-- bookmark: notes | Notes | gold | left -->',
      '<!-- bookmark: notes | Duplicate | red | right -->',
      '<!-- embed: item | <script> | Unsafe -->',
      '<!-- embed: chart | cellar.flow:v2 | Safe chart -->',
      '<!-- page: 100000 -->',
      'Bounded page.',
    ].join('\n'));
    expect(document.bookmarks).toHaveLength(1);
    expect(document.blocks).toEqual([
      {
        kind: 'embed', embedKind: 'chart', reference: 'cellar.flow:v2',
        label: 'Safe chart', sourceLine: 4,
      },
      { kind: 'page_break', page: 999, sourceLine: 5 },
      { kind: 'paragraph', sourceLine: 6, inlines: [{ text: 'Bounded page.', style: 'body' }] },
    ]);
  });
});
