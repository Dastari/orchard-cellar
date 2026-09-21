import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { ui, type UiKitArt } from '../components/index.js';
import { UiRoot } from '../runtime/root.js';
import { uiTestArt } from './testing/art.js';
import { createUiRecordingCanvas } from '../runtime/recording-canvas.js';
let art: UiKitArt; beforeAll(async () => { art = await uiTestArt(); }); afterAll(() => vi.unstubAllGlobals());
it('repaginates across sizes and keeps every page fragment on its side of the spine', () => {
  const source = '# Orchard journal\n\n' + 'Plant trees and press fruit. '.repeat(180) + '\n\n[page:ending]\n\n# Ending\n\nFinished.';
  const book = ui.book({ source }), root = new UiRoot({ art, scale: 1 }); root.mount(book); const counts = new Set<number>();
  for (const width of [320,640,960]) { root.resize(width,400); root.arrange(); counts.add(Number(book.props['pageCount']));
    for (const { element } of root.entries()) if (element.kind === 'book-page') for (const child of element.children) { expect(child.clip.x).toBeGreaterThanOrEqual(element.clip.x); expect(child.clip.x + child.clip.width).toBeLessThanOrEqual(element.clip.x + element.clip.width); }
    const recorder = createUiRecordingCanvas(width,400); root.draw(recorder.context); expect(recorder.balanced).toBe(true);
  }
  expect(counts.size).toBeGreaterThan(1); root.focus.set(book); root.key({ key: 'End' }); root.arrange(); expect(book.props['spread']).toBe(Number(book.props['spreadCount']) - 1);
  root.key({ key: 'Home' }); root.arrange(); expect(book.props['spread']).toBe(0); root.dispose();
});
it('keeps source HTML inert and exposes typed links as canvas keyboard controls', () => {
  const link = vi.fn(), markdown = ui.markdown({ source: '[Apple](item:apple) <script>bad()</script>', onLink: link }), root = new UiRoot({ art, scale: 1 }); root.resize(400,300); root.mount(markdown); root.arrange();
  const target = root.entries().find(({ element }) => element.kind === 'book-link')!.element; root.focus.set(target); root.key({ key: 'Enter' }); expect(link).toHaveBeenCalledWith({ kind: 'item', itemKind: 'apple' }); root.dispose();
});
it('paints all speech tones and tail directions inside their clips', () => {
  for (const tone of ['primary','neutral','success','danger','warning','info','muted'] as const) for (const tail of ['up','down','left','right'] as const) {
    const root = new UiRoot({ art, scale: 1 }); root.resize(240,160); root.mount(ui.speechBubble({ text: 'Fruit is ready for pressing. '.repeat(3), tone, tail }));
    const recorder = createUiRecordingCanvas(240,160); root.draw(recorder.context); expect(recorder.balanced).toBe(true); expect(recorder.records.length).toBeGreaterThan(0); root.dispose();
  }
});
it('keeps focus and scroll chrome below later overlapping siblings', () => {
  const order: string[] = [], first = ui.scrollArea({}, [ui.text('Earlier')]), second = ui.frame({ children: [ui.text('Later')] });
  Object.assign(first.hooks, { paintOverlay: () => order.push('scroll') }); Object.assign(second.hooks, { paint: () => order.push('later') });
  const root = new UiRoot({ art, scale: 1 }); root.resize(400,300); root.mount(ui.stack({ width: 'grow', height: 'grow' }, [first, second])); root.draw(createUiRecordingCanvas(400,300).context);
  expect(order.indexOf('scroll')).toBeLessThan(order.indexOf('later')); root.dispose();
});
it('follows bookmarks across explicit page breaks and renders embeds on the destination spread', () => {
  const source = '# Harvest\n\n<!-- bookmark: harvest | Harvest | gold | left -->\n\n[Apple](item:apple)\n\n<!-- page: 4 -->\n\n# Cellar\n\n<!-- bookmark: cellar | Cellar | blue | right -->\n\n<!-- embed: item | apple | Apple crate -->';
  const pageChange = vi.fn(), embed = vi.fn(() => ui.text('Embedded apple crate'));
  const book = ui.book({ source, onPageChange: pageChange, renderEmbed: embed }), root = new UiRoot({ art, scale: 1 }); root.resize(640,480); root.mount(book); root.arrange();
  const bookmark = root.entries().find(({ element }) => element.label === 'Cellar')!.element; root.focus.set(bookmark); root.key({ key: 'Enter' }); root.arrange();
  expect(Number(book.props['spread'])).toBeGreaterThan(0); expect(pageChange).toHaveBeenCalled(); expect(embed).toHaveBeenCalled();
  expect(root.entries().some(({ element }) => element.props['text'] === 'Embedded apple crate')).toBe(true); root.dispose();
});
