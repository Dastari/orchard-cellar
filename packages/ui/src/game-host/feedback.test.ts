import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { drawPixelText } from '../pixel-ui.js';
import { GameFeedback, type GameFeedbackModel } from './feedback.js';
import { uiTestArt, uiTestAsset } from '../kit/lab/testing/art.js';
import { GameUiRuntime } from './runtime.js';
import type { UiElement } from '../kit/runtime/element.js';

const hosts: GameFeedback[] = [];
const fonts = new WeakMap<object, string>();
let glyphs: string[] = [];
function trackingCanvas(width: number, height: number) {
  const image = createCanvas(width, height), context = image.getContext('2d'), draw = context.drawImage.bind(context);
  context.drawImage = ((...args: Parameters<typeof context.drawImage>) => {
    const font = fonts.get(args[0]);
    if (font && args.length === 9) {
      if ((args[3] === 5 && args[4] === 7) || (args[3] === 8 && args[4] === 12)) glyphs.push(font);
      else if (args[3] === args[0].width && args[4] === args[0].height) fonts.set(image, font);
    }
    return draw(...args);
  }) as typeof context.drawImage;
  return image;
}
afterEach(() => { for (const host of hosts.splice(0)) host.dispose(); vi.unstubAllGlobals(); });
function model(): GameFeedbackModel {
  return { sessionKey: 'player:a/connection:1/space:orchard', world: {
    nameplates: [{ id: 'a', x: 100, y: 35, text: 'Cellar keeper', offline: true }],
    feedback: [{ id: 'damage', kind: 'damage', x: 120, y: 30, amount: 12, critical: true, progress: .3, presentation: 'combat' },
      { id: 'quest', kind: 'quest', x: 190, y: 38, artwork: uiTestAsset('icon_cf_quest_offer') }],
    speech: [{ id: 'public', x: 80, y: 90, kind: 'say', text: 'Meet at the orchard.' },
      { id: 'private', x: 200, y: 110, kind: 'tell', text: 'Only the recipient sees this.' },
      { id: 'thought', x: 150, y: 150, kind: 'thought', text: 'Remember my tools.' }],
    hint: { x: 160, y: 175, title: 'APPLE TREE', lines: ['PAUSED', 'NEEDS WATER'], progress: .5, tone: 'warning' },
    fishing: { id: 'cast:7', x: 40, y: 40, progress: .25 },
  }, hud: {
    prompt: { text: 'E — WATER TREE', anchor: { x: 160, y: 175 } },
    toast: { text: 'Not enough space', tone: 'danger', anchor: { x: 160, y: 130 } },
    tooltip: { text: 'COPPER PICK\nDURABILITY 12 / 20', anchor: { x: 160, y: 70 } },
    notice: { id: 'farming:3', track: 'farming', points: 2, y: 100 },
  } };
}
async function fixture() {
  const callbacks = { onOpenSkillNotice: vi.fn(), onDismissSkillNotice: vi.fn() };
  const art = await uiTestArt(); fonts.set(art.pixel.font.image, 'font_5x7'); fonts.set(art.pixel.headerFont.image, 'font_8x12');
  vi.stubGlobal('document', { createElement: () => trackingCanvas(1, 1) });
  const host = new GameFeedback(art, callbacks); hosts.push(host);
  host.setBounds({ worldWidth: 320, worldHeight: 180, hudWidth: 300, hudHeight: 160 }, 1.5); host.update(model());
  const node = (id: string) => host.roots.notice.entries().find(row => row.element.id === id)!.element;
  const point = (element: UiElement) => ({ x: element.rect.x + element.rect.width / 2, y: element.rect.y + element.rect.height / 2 });
  return { host, callbacks, art, node, point };
}
describe('production feedback compositions', () => {
  it('paints quest indicators behind a hover hint but damage above it, with speech last', async () => {
    const f = await fixture(), m = model();
    f.host.update({ ...m, world: { ...m.world, nameplates: [], fishing: null,
      feedback: [{ ...m.world.feedback[0]!, x: 100, y: 40 }, { ...m.world.feedback[1]!, x: 100, y: 45 }],
      hint: { x: 100, y: 100, title: 'APPLE TREE', lines: ['NEEDS WATER'], tone: 'neutral' },
      speech: [{ id: 'speech', x: 270, y: 170, kind: 'say', text: 'Hello' }],
    } });
    const root = f.host.roots.world, paints: string[] = [];
    const target = (id: string) => root.entries().find(row => row.element.id === id)!.element;
    const hint = root.entries().find(row => row.element.kind === 'world-hint')!.element.children[0]!;
    for (const [name, node] of [['quest', target('world-feedback:quest')], ['hint', hint],
      ['damage', target('world-feedback:damage')], ['speech', target('world-speech:speech')]] as const) {
      const paint = node.hooks.paint!;
      vi.spyOn(node.hooks, 'paint').mockImplementation((...args) => { paints.push(name); paint(...args); });
    }
    const damage = target('world-feedback:damage');
    expect(damage.rect.x).toBeGreaterThanOrEqual(hint.rect.x);
    expect(damage.rect.y).toBeGreaterThanOrEqual(hint.rect.y);
    expect(damage.rect.y + damage.rect.height).toBeLessThanOrEqual(hint.rect.y + hint.rect.height);
    const canvas = createCanvas(320,180), context = canvas.getContext('2d');
    root.drawInContext(context as unknown as CanvasRenderingContext2D, 500);
    expect(paints).toEqual(['quest', 'hint', 'damage', 'speech']);
    const pixels = context.getImageData(damage.rect.x, damage.rect.y, damage.rect.width, damage.rect.height).data;
    let yellow = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 255 && pixels[i + 1] === 211 && pixels[i + 2] === 78) yellow++;
    expect(yellow).toBeGreaterThan(0);
  });
  it('respects projected equipment clearance for an oversized multiline tooltip', async () => {
    const f = await fixture(), m = model();
    f.host.setBounds({ worldWidth: 160, worldHeight: 90, hudWidth: 160, hudHeight: 90 });
    f.host.update({ ...m, hud: { ...m.hud, tooltip: { text: Array.from({ length: 20 }, (_, i) => `EQUIPMENT DETAIL ${i}`).join('\n'),
      anchor: { x: 80, y: 54 }, maxHeight: 50 } } });
    const frame = f.host.roots.hud.entries().find(row => row.element.id === 'game.feedback.tooltip.frame')!.element;
    expect(frame.rect.height).toBeLessThanOrEqual(50);
    expect(frame.rect.y).toBeGreaterThanOrEqual(4);
    expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(54);
    expect(frame.rect).toEqual(frame.clip);
  });
  it.each([[106,60,48], [320,180,55], [800,600,506]])('keeps simultaneous toast and notice separated at %ix%i', async (width, height, bottom) => {
    const f = await fixture(), m = model();
    f.host.setBounds({ worldWidth: width, worldHeight: height, hudWidth: width, hudHeight: height });
    f.host.update({ ...m, hud: { ...m.hud, prompt: null, tooltip: null, toast: { text: 'NOT ENOUGH SPACE', tone: 'danger', anchor: { x: width / 2, y: bottom } },
      notice: { ...m.hud.notice!, y: bottom - 36 } } });
    const toast = f.host.roots.hud.entries().find(row => row.element.id === 'game.feedback.toast.frame')!.element;
    const notice = f.node('game.feedback.notice');
    expect(f.host.noticeVisible).toBe(true); expect(f.host.noticeActive).toBe(true);
    expect(notice.rect.y + notice.rect.height).toBeLessThanOrEqual(toast.rect.y - 4);
    expect(notice.rect).toEqual(notice.clip);
    for (const id of ['game.feedback.notice:open', 'game.feedback.notice:dismiss']) {
      const control = f.node(id); expect(control.rect).toEqual(control.clip); expect(control.rect.height).toBeGreaterThanOrEqual(16);
    }
    const directory = process.env['ORCHARD_FEEDBACK_EVIDENCE'];
    if (directory) {
      const scale = width === 106 ? 3 : 1, canvas = createCanvas(Math.ceil(width * scale * 1.25), Math.ceil(height * scale * 1.25));
      const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D; context.scale(scale * 1.25, scale * 1.25);
      f.host.roots.hud.drawInContext(context, 500); f.host.roots.notice.drawInContext(context, 500);
      mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/notice-toast-${width}x${height}.png`, canvas.toBuffer('image/png'));
    }
  });
  it('temporarily hides a notice for a large rejection toast, cancels its held tail and restores unchanged authority', async () => {
    const f = await fixture(), m = model(), root = f.host.roots.notice;
    f.host.setBounds({ worldWidth: 106, worldHeight: 60, hudWidth: 106, hudHeight: 60 });
    f.host.update({ ...m, hud: { ...m.hud, toast: null } });
    const point = f.point(f.node('game.feedback.notice:open'));
    root.pointer({ type: 'down', point, pointerId: 1, button: 0 });
    const longToast = { text: 'NOT ENOUGH SPACE IN THIS FULL INVENTORY', tone: 'danger' as const, anchor: { x: 53, y: 48 } };
    f.host.update({ ...m, hud: { ...m.hud, toast: longToast } });
    expect(f.host.noticeVisible).toBe(false); expect(f.host.noticeActive).toBe(false);
    root.pointer({ type: 'up', point, pointerId: 1, button: 0 }); root.key({ key: 'Enter' });
    expect(f.callbacks.onOpenSkillNotice).not.toHaveBeenCalled(); expect(f.callbacks.onDismissSkillNotice).not.toHaveBeenCalled();
    f.host.update({ ...m, hud: { ...m.hud, toast: null } });
    expect(f.host.noticeVisible).toBe(true); expect(f.host.noticeActive).toBe(true);
    root.focus.set(f.node('game.feedback.notice:open')); root.key({ key: 'Enter' });
    expect(f.callbacks.onOpenSkillNotice).toHaveBeenCalledExactlyOnceWith({ sessionKey: m.sessionKey, noticeId: m.hud.notice!.id, track: 'farming', points: 2 });
  });
  it('uses stable roots, separate world/safe viewports and no passive input interception', async () => {
    const f = await fixture(), roots = f.host.roots;
    expect(roots.world.viewport.width).toBe(320); expect(roots.hud.viewport.width).toBe(300);
    for (const root of [roots.world, roots.hud]) {
      expect(root.entries().some(({ element }) => element.focusable || element.pointerMode === 'capture')).toBe(false);
      expect(root.pointer({ type: 'down', point: { x: 150, y: 100 }, pointerId: 1, button: 0 })).toBe(false);
      expect(root.wheel({ point: { x: 150, y: 100 }, deltaX: 0, deltaY: 50 })).toBe(false);
      root.key({ key: 'Tab' }); expect(root.focus.current).toBeNull();
    }
    f.host.update(model()); f.host.setBounds({ worldWidth: 640, worldHeight: 360, hudWidth: 600, hudHeight: 340 });
    expect(f.host.roots).toBe(roots); expect(Object.values(roots).every(root => root.scale === 1)).toBe(true);
    expect(f.callbacks.onOpenSkillNotice).not.toHaveBeenCalled();
  });
  it('preserves already filtered public/private/thought messages and projected timers until caller removes them', async () => {
    const f = await fixture(), m = model(), hint = f.host.roots.world.entries().find(row => row.element.kind === 'world-hint')!.element;
    const speech = f.host.roots.world.entries().find(row => row.element.kind === 'world-speech')!.element;
    const canvas = createCanvas(320, 180), context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    f.host.roots.world.drawInContext(context, 1_000_000);
    expect(speech.props['messages']).toEqual(m.world.speech);
    expect(hint.props['hint']).toEqual(m.world.hint);
    expect(f.host.roots.world.entries().find(row => row.element.id === 'game.feedback.fishing')!.element.props['value']).toBe(.25);
    f.host.update({ ...m, world: { ...m.world, speech: [], hint: null, feedback: [], fishing: null } });
    expect(speech.children).toHaveLength(0); expect(hint.children[0]!.visible).toBe(false);
    expect(f.host.roots.world.entries().some(row => row.element.id === 'world-feedback:damage')).toBe(false);
  });
  it('submits one release or keyboard gesture with expected scope and keeps harmless snapshots/focus stable', async () => {
    const f = await fixture(), root = f.host.roots.notice, open = f.node('game.feedback.notice:open'), p = f.point(open);
    root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 }); expect(f.callbacks.onOpenSkillNotice).not.toHaveBeenCalled();
    f.host.update(model()); expect(f.node(open.id)).toBe(open);
    root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 });
    expect(f.callbacks.onOpenSkillNotice).toHaveBeenCalledExactlyOnceWith({ sessionKey: model().sessionKey, noticeId: 'farming:3', track: 'farming', points: 2 });
    root.key({ key: 'Enter', repeat: true }); root.key({ key: 'Enter' }); expect(f.callbacks.onOpenSkillNotice).toHaveBeenCalledOnce();
    const m = model(); f.host.update({ ...m, hud: { ...m.hud, notice: { ...m.hud.notice!, id: 'new-notice' } } });
    const dismiss = f.node('game.feedback.notice:dismiss'); root.focus.set(dismiss);
    f.host.setBounds({ worldWidth: 800, worldHeight: 600, hudWidth: 780, hudHeight: 580 });
    expect(root.focus.current).toBe(dismiss); root.key({ key: ' ', repeat: true }); expect(f.callbacks.onDismissSkillNotice).not.toHaveBeenCalled();
    root.key({ key: ' ' }); expect(f.callbacks.onDismissSkillNotice).toHaveBeenCalledOnce();
  });
  it.each(['session', 'notice', 'track', 'points', 'hidden'] as const)('cancels a held notice after %s changes and accepts a fresh gesture', async change => {
    const f = await fixture(), root = f.host.roots.notice, m = model(), p = f.point(f.node('game.feedback.notice:open'));
    root.pointer({ type: 'down', point: p, pointerId: 1, button: 0, pointerType: 'touch' });
    const next = { ...m, sessionKey: change === 'session' ? 'reconnected' : m.sessionKey, hud: { ...m.hud, notice: change === 'hidden' ? null : {
      ...m.hud.notice!, id: change === 'notice' ? 'new' : m.hud.notice!.id, track: change === 'track' ? 'mining' : m.hud.notice!.track,
      points: change === 'points' ? 3 : m.hud.notice!.points,
    } } };
    f.host.update(next); if (change === 'hidden') f.host.update(m);
    root.pointer({ type: 'up', point: p, pointerId: 1, button: 0, pointerType: 'touch' }); expect(f.callbacks.onOpenSkillNotice).not.toHaveBeenCalled();
    const fresh = f.point(f.node('game.feedback.notice:open'));
    root.pointer({ type: 'down', point: fresh, pointerId: 2, button: 0, pointerType: 'touch' });
    root.pointer({ type: 'up', point: fresh, pointerId: 2, button: 0, pointerType: 'touch' }); expect(f.callbacks.onOpenSkillNotice).toHaveBeenCalledOnce();
  });
  it('keeps notice hit testing bounded and retires captured tails when parent masks input', async () => {
    const f = await fixture(), runtime = new GameUiRuntime(); let available = true;
    runtime.register({ id: 'feedback-notice', priority: 175, root: f.host.roots.notice, active: () => available && f.host.noticeActive, blocking: () => false });
    expect(runtime.pointer({ type: 'down', point: { x: 0, y: 0 }, pointerId: 1, button: 0 })).toBe(false);
    const p = f.point(f.node('game.feedback.notice:open'));
    runtime.pointer({ type: 'down', point: p, pointerId: 2, button: 0 }); available = false; runtime.reconcile();
    runtime.pointer({ type: 'up', point: p, pointerId: 2, button: 0 }); expect(f.callbacks.onOpenSkillNotice).not.toHaveBeenCalled(); runtime.dispose();
  });
  it('isolates a second touch without stealing the first notice gesture', async () => {
    const f = await fixture(), root = f.host.roots.notice, open = f.point(f.node('game.feedback.notice:open')),
      dismiss = f.point(f.node('game.feedback.notice:dismiss'));
    root.pointer({ type: 'down', point: open, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    const focus = root.focus.current;
    root.pointer({ type: 'down', point: dismiss, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
    expect(root.focus.current).toBe(focus);
    root.pointer({ type: 'up', point: dismiss, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
    expect(f.callbacks.onDismissSkillNotice).not.toHaveBeenCalled(); expect(root.focus.current).toBe(focus);
    root.pointer({ type: 'up', point: open, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    expect(f.callbacks.onOpenSkillNotice).toHaveBeenCalledOnce();
    expect(f.host.noticeActive).toBe(false); expect(f.host.noticeVisible).toBe(true);
    const m = model(); f.host.update({ ...m, hud: { ...m.hud, notice: null } }); expect(f.host.noticeVisible).toBe(false);
  });
  it.each([1, 2, 3])('draws real art at UI scale %i and fractional DPR with constrained controls/labels', async scale => {
    const f = await fixture();
    for (const width of [320, 800]) {
      const logicalWidth = Math.floor(width / scale), height = Math.floor((width === 320 ? 180 : 600) / scale);
      f.host.setBounds({ worldWidth: logicalWidth, worldHeight: height, hudWidth: logicalWidth, hudHeight: height }, 1.25);
      const m = model(); f.host.update({ ...m, world: { ...m.world, hint: null }, hud: { ...m.hud,
        tooltip: { text: 'A VERY LONG COPPER PICKAXE NAME WITH DURABILITY 12 / 20', anchor: { x: logicalWidth / 2, y: height } } } });
      for (const [name, root] of Object.entries(f.host.roots)) {
        const canvas = trackingCanvas(Math.ceil(width * 1.25), Math.ceil(height * scale * 1.25));
        const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
        glyphs = []; drawPixelText(context, f.art.pixel, 'CALIBRATE', 0, 0, { font: 'header' });
        expect(glyphs).toContain('font_8x12'); context.clearRect(0, 0, canvas.width, canvas.height); glyphs = [];
        root.draw(context, 500, false, { scale, x: 0, y: 0 });
        expect(new Set(glyphs)).toEqual(new Set(['font_5x7']));
        const directory = process.env['ORCHARD_FEEDBACK_EVIDENCE'];
        if (directory) { mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/${name}-${width}-scale${scale}-dpr1.25.png`, canvas.toBuffer('image/png')); writeFileSync(`${directory}/${name}-${width}-scale${scale}.json`, JSON.stringify(root.entries().map(({element}) => ({id:element.id,kind:element.kind,rect:element.rect,clip:element.clip,style:element.style})), null, 2)); }
      }
      f.host.update({ ...m, world: { nameplates: [], feedback: [], speech: [], fishing: null,
        hint: { ...m.world.hint!, x: logicalWidth / 2, y: height } } });
      const hintCanvas = trackingCanvas(Math.ceil(width * 1.25), Math.ceil(height * scale * 1.25));
      glyphs = []; f.host.roots.world.draw(hintCanvas.getContext('2d') as unknown as CanvasRenderingContext2D, 500, false, { scale, x: 0, y: 0 });
      expect(new Set(glyphs)).toEqual(new Set(['font_5x7']));
      for (const { element } of f.host.roots.world.entries().filter(row => ['text','meter'].includes(row.element.kind))) expect(element.rect).toEqual(element.clip);
      const directory = process.env['ORCHARD_FEEDBACK_EVIDENCE'];
      if (directory) writeFileSync(`${directory}/hint-${width}-scale${scale}-dpr1.25.png`, hintCanvas.toBuffer('image/png'));
      for (const id of ['game.feedback.notice:open', 'game.feedback.notice:dismiss']) {
        const node = f.node(id); expect(node.rect).toEqual(node.clip); expect(node.rect.width).toBeGreaterThan(0);
      }
      for (const { element } of f.host.roots.hud.entries().filter(row => row.element.kind === 'frame')) expect(element.rect).toEqual(element.clip);
    }
  });
});
