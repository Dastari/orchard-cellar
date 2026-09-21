import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';
import { uiActionNotice } from './action-notice.js';
import { UiRoot } from '../runtime/root.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';

describe('action notices', () => {
  it.each([240,320,640])('keeps both actions clipped and keyboard operable at width %i', width => {
    const root = new UiRoot({ scale: 1 }); root.resize(width,100);
    const open = vi.fn(), dismiss = vi.fn();
    const notice = root.mount(uiActionNotice({ id: 'notice', message: 'NEW FARMING SKILL POINT · OPEN',
      tone: 'success', onOpen: open, onDismiss: dismiss, layout: { zLayer: 'toast' } }));
    root.arrange();
    const controls = root.entries().filter(entry => entry.element.focusable).map(entry => entry.element);
    expect(controls).toHaveLength(2);
    for (const control of controls) expect(control.rect).toEqual(control.clip);
    root.key({ key: 'Tab' }); root.key({ key: 'Enter' });
    expect(open).toHaveBeenCalledOnce(); expect(dismiss).not.toHaveBeenCalled();
    root.key({ key: 'Tab' }); root.key({ key: ' ' });
    expect(dismiss).toHaveBeenCalledOnce();
    expect(root.pointer({ type: 'down', point: { x: notice.rect.x + 1, y: notice.rect.y + 1 }, pointerId: 1, button: 0 })).toBe(true);
    expect(open).toHaveBeenCalledOnce(); root.dispose();
  });
  it('paints selected layers once while retaining shared focus and hit geometry', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(40,40);
    const paints: string[] = [];
    for (const layer of ['base','toast'] as const) root.mount(new UiElement({ id: layer, focusable: true,
      style: { width: uiFixed(20), height: uiFixed(20), zLayer: layer },
      paint(_node, { context }) { paints.push(layer); context.fillStyle = layer === 'base' ? '#ff0000' : '#00ff00'; context.fillRect(-10,-10,50,50); },
    }));
    const context = createCanvas(40,40).getContext('2d');
    root.drawInContext(context as unknown as CanvasRenderingContext2D, 0, undefined, ['base']);
    expect(paints).toEqual(['base']);
    expect([...context.getImageData(2,2,1,1).data]).toEqual([255,0,0,255]);
    root.drawInContext(context as unknown as CanvasRenderingContext2D, 0, undefined, ['toast']);
    expect(paints).toEqual(['base','toast']);
    expect([...context.getImageData(2,2,1,1).data]).toEqual([0,255,0,255]);
    expect([...context.getImageData(21,21,1,1).data]).toEqual([0,0,0,0]);
    expect(root.input.hits({ x: 2, y: 2 })[0]!.id).toBe('toast');
    root.key({ key: 'Tab' }); root.key({ key: 'Tab' }); expect(root.focus.current?.id).toBe('toast'); root.dispose();
  });
});
