import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';
import { ui, uiVitalFraction } from '../components/index.js';
import { UiRoot } from '../runtime/root.js';
import { UiElement } from '../runtime/element.js';

describe('HUD hotbar', () => {
  it.each([148, 298])('keeps native slots two pixels apart at width %i', width => {
    const root = new UiRoot({ scale: 1 }); root.resize(width, 80);
    const selected = vi.fn();
    const bar = root.mount(ui.hotbar({ container: 'hotbar', count: 10, columns: 'auto', onSelect: selected,
      stack: index => index === 0 ? { itemKind: 'wood', quantity: 3 } : null }));
    root.arrange();
    const slots = bar.children;
    for (const slot of slots) expect([slot.rect.width, slot.rect.height]).toEqual([28, 31]);
    expect(slots[1]!.rect.x - slots[0]!.rect.x - 28).toBe(2);
    if (width === 148) expect(slots[5]!.rect.y - slots[0]!.rect.y - 31).toBe(2);
    const target = slots[2]!.rect, point = { x: target.x + 10, y: target.y + 10 };
    root.pointer({ type: 'down', point, button: 0, pointerId: 1 });
    root.pointer({ type: 'up', point, button: 0, pointerId: 1 });
    expect(selected).toHaveBeenCalledExactlyOnceWith(2);
    expect(slots[2]!.props['selected']).toBe(true);
    root.key({ key: '0' }); expect(selected).toHaveBeenLastCalledWith(9);
    root.key({ key: '1', altKey: true }); expect(selected).toHaveBeenCalledTimes(2);
    root.dispose();
  });
  it('uses an authoritative selection getter without creating a second optimistic selection', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(298,80); let selected = 0;
    const choose = vi.fn(); const bar = root.mount(ui.hotbar({ container: 'hotbar', count: 10, selected: () => selected, onSelect: choose })); root.arrange();
    const point = { x: bar.children[2]!.rect.x+10, y: bar.children[2]!.rect.y+10 };
    root.pointer({ type:'down',point,button:0,pointerId:1 });root.pointer({ type:'up',point,button:0,pointerId:1 });
    expect(choose).toHaveBeenCalledExactlyOnceWith(2);expect(bar.children[0]!.props['selected']).toBe(true);expect(bar.children[2]!.props['selected']).toBe(false);
    selected=2;bar.invalidate();root.arrange();expect(bar.children[2]!.props['selected']).toBe(true);
    selected=0;bar.invalidate();root.arrange();expect(bar.children[0]!.props['selected']).toBe(true);
    root.focus.set(bar.children[0]!);root.key({key:'3',repeat:true});expect(choose).toHaveBeenCalledOnce();
    root.key({key:'3'});expect(choose).toHaveBeenLastCalledWith(2);expect(bar.children[0]!.props['selected']).toBe(true);root.dispose();
  });
  it('composites a clipped tree without clearing or replacing the host transform', () => {
    const canvas = createCanvas(80,80), context = canvas.getContext('2d');
    context.fillStyle = '#ff0000'; context.fillRect(0,0,80,80);
    context.translate(12, 8); context.scale(2,2);
    const before = context.getTransform();
    const root = new UiRoot({ scale: 1 }); root.resize(10,10);
    root.mount(new UiElement({ style: { width: 'grow', height: 'grow' }, paint(_node, { context: painter }) {
      painter.fillStyle = '#00ff00'; painter.fillRect(-100,-100,300,300);
    } }));
    root.drawInContext(context as unknown as CanvasRenderingContext2D);
    expect(context.getTransform()).toEqual(before);
    const pixel = (x: number,y: number) => [...context.getImageData(x,y,1,1).data];
    expect(pixel(12,8)).toEqual([0,255,0,255]);
    expect(pixel(31,27)).toEqual([0,255,0,255]);
    expect(pixel(32,28)).toEqual([255,0,0,255]);
    expect(pixel(0,0)).toEqual([255,0,0,255]); root.dispose();
  });
});

describe('HUD vitals', () => {
  it.each([[50,100,.5],[-1,100,0],[110,100,1],[10,0,0],[NaN,100,0],[1,Infinity,0],[undefined,undefined,0]])('bounds %s / %s to %s', (current, maximum, expected) => {
    expect(uiVitalFraction(current, maximum)).toBe(expected);
  });
  it.each([1,2,3] as const)('keeps resource hit rectangles inside the portrait row at scale %i', scale => {
    let values = { health: 50, maxHealth: 100, mana: 25, maxMana: 50, vigour: 2, maxVigour: 4 };
    const root = new UiRoot({ scale }); root.resize(240,120);
    const node = root.mount(ui.vitals({ values: () => values, portrait: ui.text('A') })); root.arrange();
    const meters = root.entries().filter(entry => entry.element.kind === 'meter').map(entry => entry.element);
    expect(meters).toHaveLength(3);
    for (const meter of meters) {
      expect(meter.rect).toEqual(meter.clip);
      expect((meter.props['value'] as () => number)()).toBe(.5);
    }
    values = { ...values, health: 0, mana: 50, vigour: 3 };
    expect(meters.map(meter => (meter.props['value'] as () => number)())).toEqual([0,1,.75]);
    expect(root.tree.children[0]).toBe(node); root.dispose();
  });
});

describe('HUD chrome', () => {
  it('separates the online-player action from collapse and exposes watch data only when supplied', () => {
    const toggle = vi.fn(), players = vi.fn(), root = new UiRoot({ scale: 1 }); root.resize(220,60);
    const header = root.mount(ui.zoneHeader({ title: 'Orchard', onlineCount: 2, onToggle: toggle, onPlayers: players }));
    root.arrange();
    const online = root.entries().find(entry => entry.element.id === 'hud.online-players')!.element;
    root.focus.set(online); root.key({ key: 'Enter' });
    expect(players).toHaveBeenCalledOnce(); expect(toggle).not.toHaveBeenCalled();
    root.focus.set(root.entries().find(entry => entry.element.id === 'hud.zone')!.element); root.key({ key: 'Enter' });
    expect(toggle).toHaveBeenCalledOnce();
    expect(root.entries().some(entry => entry.element.kind === 'badge')).toBe(false);
    root.unmount(header); header.dispose();
    root.mount(ui.zoneHeader({ title: 'Orchard', watch: { time: '06:00', date: 'Spring 1', moon: 'Full moon' } })); root.arrange();
    const watch = root.entries().find(entry => entry.element.kind === 'badge')!.element;
    expect(watch.label).toBe('06:00 Spring 1 Full moon'); expect(watch.rect).toEqual(watch.clip); root.dispose();
  });
  it('clamps map zoom, disables the endpoints, and keeps its spatial viewport clipped', () => {
    const zoom = vi.fn(), toggle = vi.fn(), root = new UiRoot({ scale: 1 }); root.resize(116,92);
    root.mount(ui.minimap({ zoom: 4, onZoom: zoom, onToggle: toggle, render: () => {} })); root.arrange();
    const entries = root.entries(), viewport = entries.find(entry => entry.element.kind === 'viewport')!.element;
    expect(viewport.rect).toEqual(viewport.clip);
    expect(entries.find(entry => entry.element.id === 'hud.minimap.zoom-in')!.element.disabled).toBe(true);
    root.wheel({ point: { x: viewport.rect.x + 2, y: viewport.rect.y + 2 }, deltaX: 0, deltaY: -1 }); expect(zoom).toHaveBeenLastCalledWith(4);
    const out = entries.find(entry => entry.element.id === 'hud.minimap.zoom-out')!.element;
    const point = { x: out.rect.x + 4, y: out.rect.y + 4 };
    root.pointer({ type: 'down', point, button: 0, pointerId: 1 }); root.pointer({ type: 'up', point, button: 0, pointerId: 1 });
    expect(zoom.mock.calls).toEqual([[4],[3]]); expect(toggle).not.toHaveBeenCalled(); root.dispose();
  });
});

describe('projected nameplates', () => {
  it('clips edge-anchored bubbles without moving their world anchor', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(200,100);
    const layer = root.mount(ui.nameplates({ labels: [{ id: 'mara', x: 2, y: 40, text: 'Mara' }] }));
    root.arrange();
    const bubble = layer.children[0]!;
    expect(bubble.rect.x).toBeLessThan(0);
    expect(bubble.rect.y + bubble.rect.height).toBe(40);
    expect(Math.abs(bubble.rect.x + bubble.rect.width / 2 - 2)).toBeLessThanOrEqual(.5);
    expect(bubble.clip.x).toBe(0);
    expect(bubble.clip.width).toBeLessThan(bubble.rect.width);
    root.dispose();
  });
  it('keeps entity identity when another label leaves the visible set', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(200,100);
    const second = { id: 'second', x: 100, y: 60, text: 'Second' };
    const layer = root.mount(ui.nameplates({ labels: [{ id: 'first', x: 50, y: 40, text: 'First' }, second] }));
    root.arrange(); const retained = layer.children[1];
    layer.setProps({ labels: [second] }); root.arrange();
    expect(layer.children).toEqual([retained]); root.dispose();
  });
  it('retains moving labels, updates offline state and removes invalid or departed anchors', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(200,100);
    const layer = root.mount(ui.nameplates({ labels: [{ id: 'mara', x: 80, y: 50, text: 'Mara' }] }));
    root.arrange(); const original = layer.children[0]!;
    layer.setProps({ labels: [{ id: 'mara', x: 100, y: 60, text: 'Mara' }] }); root.arrange();
    expect(layer.children[0]).toBe(original);
    expect(original.rect.y + original.rect.height).toBe(60);
    layer.setProps({ labels: [{ id: 'mara', x: 100, y: 60, text: 'Mara', offline: true }] }); root.arrange();
    expect(layer.children).toHaveLength(1);
    // Offline players get the greyed plate with an Offline line; the plate's label keeps the full name.
    expect(layer.children[0]!.kind).toBe('nameplate'); expect(layer.children[0]!.style.height).toEqual({ mode: 'fixed', size: 22 });
    expect(layer.children[0]!.label).toBe('Mara [offline]');
    layer.setProps({ labels: [{ x: -1, y: 40, text: 'Left' }, { x: 201, y: 40, text: 'Right' },
      { x: 80, y: NaN, text: 'Invalid' }, { x: 80, y: 101, text: 'Below' }] }); root.arrange();
    expect(layer.children).toHaveLength(0); root.dispose();
  });
});
