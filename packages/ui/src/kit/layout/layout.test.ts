/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UiElement } from '../runtime/element.js';
import { UiRoot } from '../runtime/root.js';
import { uiFixed, type UiStyle } from './box.js';
import { scrollUiElement, uiScrollThumb } from './scroll.js';
import { measureUiElement } from './measure.js';

it('retains padded leaf measurement and resets scroll extent when the last child is removed', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(200, 100);
  const child = new UiElement({ style: { width: uiFixed(300), height: uiFixed(300) } });
  const frame = root.mount(new UiElement({ style: { width: uiFixed(100), height: uiFixed(60), padding: 4, overflow: 'scroll', shrink: 0 }, children: [child] }));
  root.arrange(); scrollUiElement(frame, 40, 40); root.arrange();
  expect(frame.scroll.y).toBeGreaterThan(0);
  frame.remove(child); root.arrange();
  expect(frame.scroll).toMatchObject({ x: 0, y: 0, maxX: 0, maxY: 0 });
  expect(measureUiElement(frame, { width: 200, height: 100 })).toEqual({
    min: { width: 8, height: 8 }, preferred: { width: 100, height: 60 },
  });
  expect(frame.contentRect).toEqual({ x: 4, y: 4, width: 92, height: 52 });
  child.dispose(); root.dispose();
});

it('arranges children inserted by an empty node’s arrange hook', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(200, 100);
  const child = new UiElement({ style: { width: uiFixed(24), height: uiFixed(16) } });
  const frame = root.mount(new UiElement({ style: { width: uiFixed(100), height: uiFixed(60), padding: 4 },
    onArrange: node => { if (!node.children.length) node.append(child); } }));
  root.arrange();
  expect(child.rect).toEqual({ x: 4, y: 4, width: 24, height: 16 });
  expect(child.clip).toEqual(child.rect); expect(child.parent).toBe(frame);
  root.dispose();
});

const cases = JSON.parse(readFileSync(new URL('./fixtures/cases.json', import.meta.url), 'utf8')) as {
  id: string; size: [number, number]; style: UiStyle; children: { id: string; style?: UiStyle }[];
}[];
const expected = JSON.parse(readFileSync(new URL('./fixtures/browser-rects.json', import.meta.url), 'utf8')) as {
  results: { id: string; rects: { x: number; y: number; width: number; height: number }[] }[];
};
describe('browser-derived layout contracts', () => {
  for (const fixture of cases) it(fixture.id, () => {
    const root = new UiRoot({ scale: 1 }); root.resize(...fixture.size);
    const box = root.mount(new UiElement({ style: { width: 'grow', height: 'grow', ...fixture.style },
      children: fixture.children.map(child => new UiElement(child)) }));
    root.arrange();
    expect(box.children.map(child => child.rect)).toEqual(expected.results.find(row => row.id === fixture.id)!.rects);
  });
  it('reflows after a child changes and retains untouched fixed subtrees', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(400, 200);
    const leaf = new UiElement({ style: { width: uiFixed(24), height: uiFixed(24) } });
    const panel = root.mount(new UiElement({ style: { width: uiFixed(160), height: uiFixed(160) }, children: [leaf] }));
    const other = root.mount(new UiElement({ style: { width: uiFixed(160), height: uiFixed(160) } }));
    root.arrange(); const previous = other.rect;
    leaf.setStyle({ width: uiFixed(48) }); const stats = root.arrange();
    expect(leaf.rect.width).toBe(48); expect(other.rect).toBe(previous); expect(stats.arranged).toBeLessThan(4);
    expect(panel.rect.width).toBe(160);
  });
  it('scrolls fixed oversized content, clamps after shrink and exposes matching thumb geometry', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100, 100);
    const child = new UiElement({ style: { height: uiFixed(300), width: 'grow' } });
    const panel = root.mount(new UiElement({ style: { width: 'grow', height: 'grow', overflow: 'scroll-y', direction: 'column' }, children: [child] }));
    root.arrange(); expect(panel.scroll.maxY).toBe(200);
    expect(scrollUiElement(panel, 10, 50)).toBe(true); root.arrange();
    expect(child.rect.y).toBe(-50); expect(panel.scroll.x).toBe(0);
    expect(uiScrollThumb(panel, 'y')?.thumb).toEqual({ x: 96, y: 17, width: 4, height: 33 });
    child.setStyle({ height: uiFixed(40) }); root.arrange();
    expect(panel.scroll.y).toBe(0); expect(uiScrollThumb(panel, 'y')).toBeNull();
  });
  it('fixes viewport children independently of their scrolled parent and clips ordinary fixed descendants', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(200, 200);
    const fixed = new UiElement({ style: { position: 'fixed', width: uiFixed(40), height: uiFixed(40), inset: { right: 0, bottom: 0 } } });
    root.mount(new UiElement({ style: { width: uiFixed(40), height: uiFixed(40) }, children: [fixed] }));
    root.arrange(); expect(fixed.rect).toEqual({ x: 160, y: 160, width: 40, height: 40 }); expect(fixed.clip.width).toBe(0);
    fixed.setStyle({ zLayer: 'floating' }); root.arrange(); expect(fixed.clip).toEqual(fixed.rect);
  });
  it('invalidates intrinsic content through fit ancestors', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(300, 100);
    const leaf = new UiElement({ props: { width: 24 }, measure: node => ({ min: { width: 0, height: 20 }, preferred: { width: Number(node.props.width), height: 20 } }) });
    const fit = root.mount(new UiElement({ style: { width: 'fit', height: 'fit' }, children: [leaf] }));
    root.arrange(); expect(fit.rect.width).toBe(24);
    leaf.setProps({ width: 72 }); root.arrange(); expect(fit.rect.width).toBe(72);
  });
});

it('retains explicit sparse grid tracks and fixed item sizes', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(200, 100);
  const child = new UiElement({ style: { width: uiFixed(40), height: uiFixed(20) } });
  root.mount(new UiElement({ style: { display: 'grid', width: 'grow', height: 'grow', columns: 2, rowHeight: uiFixed(40) }, children: [child] }));
  root.arrange(); expect(child.rect).toEqual({ x: 0, y: 0, width: 40, height: 20 });
});
it('does not expose an invisible scrollbar on clipped overflow', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(100, 100);
  const parent = root.mount(new UiElement({ style: { width: 'grow', height: 'grow', direction: 'column' },
    children: [new UiElement({ style: { height: uiFixed(300) } })] }));
  root.arrange(); expect(parent.scroll.maxY).toBe(200); expect(uiScrollThumb(parent, 'y')).toBeNull();
});

it('measures wrapped growing columns at allocated widths without reserving phantom lines', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(600, 400);
  const columns = [220, 180].map(basis => new UiElement({
    style: { display: 'flex', direction: 'column', width: 'grow', basis: uiFixed(basis) },
    children: [new UiElement({ measure: (_node, available) => {
      const height = available.width < 200 ? 40 : 20;
      return { min: { width: 0, height: 20 }, preferred: { width: available.width, height } };
    } })],
  }));
  const row = new UiElement({ style: { display: 'flex', direction: 'row', wrap: true, width: 'grow', gap: 8 }, children: columns });
  const footer = new UiElement({ style: { height: uiFixed(20) } });
  root.mount(new UiElement({ style: { display: 'flex', direction: 'column', width: 'grow', height: 'grow', overflow: 'scroll-y', gap: 8 }, children: [row, footer] }));
  root.arrange();
  expect(columns.map(column => column.rect.height)).toEqual([20, 20]);
  expect(row.rect.height).toBe(20);
  expect(footer.rect.y).toBe(28);
  root.resize(190, 400); root.arrange();
  expect(columns[1]!.rect.y).toBe(48);
  expect(row.rect.height).toBe(88);
  expect(footer.rect.y).toBe(96);
  root.dispose();
});

describe('BUG-036: wrapping justified rows', () => {
  const leaf = (width: number) => new UiElement({ style: { width: uiFixed(width), height: uiFixed(10) } });
  for (const justify of ['start', 'center', 'end', 'space_between'] as const) it(`measure a ${justify} wrapping row at its content width`, () => {
    const row = new UiElement({ style: { display: 'flex', direction: 'row', wrap: true, justify, gap: 4 }, children: [leaf(20), leaf(30)] });
    expect(measureUiElement(row, { width: 400, height: 100 }).preferred).toEqual({ width: 54, height: 10 });
  });
  it('still wraps and keeps the widest line when the space runs out', () => {
    const row = new UiElement({ style: { display: 'flex', direction: 'row', wrap: true, justify: 'center', gap: 4 }, children: [leaf(20), leaf(30), leaf(40)] });
    expect(measureUiElement(row, { width: 60, height: 100 }).preferred).toEqual({ width: 54, height: 24 });
  });
  it('keeps a fitted window-like host at its content width', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(960, 540);
    const row = new UiElement({ style: { display: 'flex', direction: 'row', wrap: true, justify: 'center', gap: 4 }, children: [leaf(20), leaf(30)] });
    const host = new UiElement({ style: { display: 'flex', direction: 'column', padding: 8 }, children: [row] });
    root.mount(new UiElement({ style: { display: 'flex', width: 'grow', height: 'grow', align: 'center', justify: 'center' }, children: [host] })); root.arrange();
    expect(host.rect.width).toBe(70);
    // Justification still applies inside the row's own box.
    expect(row.children[0]!.rect.x).toBe(row.rect.x);
    root.dispose();
  });
});
