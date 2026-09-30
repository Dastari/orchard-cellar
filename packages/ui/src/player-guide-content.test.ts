import { createCanvas } from '@napi-rs/canvas';
import { expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions, itemDefinition } from '@orchard/sim';
import { HELP_TOPICS } from './help-topics.js';
import { uiHelpBook, UI_HELP_CHAPTERS } from './kit/components/help-book.js';
import { UiRoot } from './kit/runtime/root.js';
import { uiSlotArt } from './kit/components/slot-art.js';
import { uiTestArt, uiTestAsset } from './kit/lab/testing/art.js';

it('documents each currently authored processor and resolves every illustration to an existing item', () => {
  const definitions = bootstrapContentDefinitions();
  const items = new Set<string>(definitions.filter(definition => definition.kind === 'item').map(definition => definition.id));
  const icons = new Set(HELP_TOPICS.flatMap(topic => topic.illustrations ?? []).map(illustration => `item:${illustration.itemKind}`));
  for (const id of icons) expect(items.has(id)).toBe(true);
  for (const definition of definitions) {
    if (definition.kind === 'object' && definition.retired !== true && definition.components.processor) {
      expect(icons.has(definition.components.placement!.item)).toBe(true);
    }
  }
  expect(icons.has('item:workbench')).toBe(true); expect(icons.has('item:anvil')).toBe(true);
  const source = HELP_TOPICS.flatMap(topic => topic.entries).join(' ');
  expect(source).not.toMatch(/server authoritative|server validates|owners can|\/tp\b|\/last\b|F3:|G: collision|H: hide|debug|schema|reducer|recipe:/iu);
  expect(source).not.toMatch(/\d+\s+(?:planks?|sticks?|wood|fiber|iron bars?)\b/iu);
  expect(source).toContain('carrying a book is not permission to craft');
  expect(UI_HELP_CHAPTERS.flatMap(chapter => chapter.topics)).toHaveLength(HELP_TOPICS.length);
});

it.each([124, 200])('renders a machine illustration and caption through the item boundary at leaf width %s', async width => {
  const art = await uiTestArt(); const asset = uiTestAsset(itemDefinition('fruit_press')!.iconKey!, 'props');
  const slotArt = uiSlotArt({ artwork: { fruit_press: asset } });
  const root = new UiRoot({ scale: 1, art }); root.resize(width * 2 + 72, 400);
  const book = uiHelpBook({ art, slotArt, page: { width, height: 248 } }); root.mount(book);
  expect(book.openTopic('fruit-press')).toBe(true); root.arrange(); root.arrange();
  const image = createCanvas(width * 2 + 72, 400), context = image.getContext('2d'); const draw = vi.spyOn(context, 'drawImage');
  root.drawInContext(context as unknown as CanvasRenderingContext2D);
  expect(draw.mock.calls.some(call => Object.is(call[0], asset.image))).toBe(true);
  const illustration = root.entries().find(entry => entry.element.props['helpIllustration'])!.element;
  expect(illustration.kind).toBe('slot'); expect(illustration.focusable).toBe(false);
  expect(illustration.label).toContain('must and pomace');
  expect(illustration.rect.width).toBe(32); expect(illustration.rect.height).toBe(32);
  root.dispose(); vi.unstubAllGlobals();
});
