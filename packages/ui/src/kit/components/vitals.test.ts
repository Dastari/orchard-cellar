import { describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { UiRoot } from '../runtime/root.js';
import { uiVitals } from './vitals.js';
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
