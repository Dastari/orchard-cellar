import { describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { UiRoot } from '../runtime/root.js';
import { uiVitals } from './vitals.js';
import { UiElement } from '../runtime/element.js';
describe('live resource affordances', () => {
  it('preserves focused meters across authority changes and renders denied vigour only when requested', () => {
    let values = { health: 25, maxHealth: 100 }, denied = false;
    const root = new UiRoot({ scale: 1 }); root.resize(140, 90);
    const view = root.mount(uiVitals({ id: 'resources', size: 'md', values: () => values, tooltip: (kind, current) => `${kind}: ${current?.health}`, vigourDenied: () => denied })); root.arrange();
    const health = root.entries().find(row => row.element.id === 'resources:health')!.element;
    expect(health.rect.width).toBe(60); expect(health.rect).toEqual(health.clip); root.focus.set(health);
    values = { health: 90, maxHealth: 100 }; view.invalidate(); root.arrange();
    expect(root.focus.current).toBe(health); expect((health.props['value'] as () => number)()).toBe(.9);
    expect(root.entries().some(row => row.element.label === 'health: 90')).toBe(true);
    const context = createCanvas(140, 90).getContext('2d') as unknown as CanvasRenderingContext2D, fill = vi.spyOn(context, 'fillRect');
    const paint = { context, now: 0, focused: false, hovered: false, reducedMotion: false };
    view.hooks.paintOverlay!(view, paint); expect(fill).not.toHaveBeenCalled(); denied = true;
    view.hooks.paintOverlay!(view, paint); expect(fill).toHaveBeenCalledTimes(8); root.dispose();
  });
});

describe('classic HUD resource frame', () => {
  it('is the 72x29 bar frame with 45x8 bars, mirrored for a target with its portrait on the right', () => {
    for (const mirrored of [false, true]) {
      const root = new UiRoot({ scale: 1 }); root.resize(200, 100);
      const portrait = new UiElement({ id: 'portrait', kind: 'viewport' });
      root.mount(uiVitals({ id: 'frame', variant: 'classic', mirrored, portrait, values: { health: 5, maxHealth: 10 }, tooltip: kind => kind })); root.arrange();
      const find = (id: string) => root.entries().find(({ element }) => element.id === id)!.element;
      expect(find('frame').rect).toMatchObject({ x: 0, y: 0, width: 72, height: 29 });
      expect(find('portrait').rect).toMatchObject({ x: mirrored ? 49 : 5, y: 5, width: 18, height: 20 });
      expect(['health', 'mana', 'vigour'].map(kind => { const r = find(`frame:${kind}`).rect; return [r.x, r.y, r.width, r.height]; }))
        .toEqual([[mirrored ? 0 : 27, 5, 45, 8], [mirrored ? 0 : 27, 11, 45, 8], [mirrored ? 0 : 27, 17, 45, 8]]);
      root.dispose();
    }
  });
});
