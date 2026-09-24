import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, activeRogueUpgradeDefinitions } from '@orchard/sim';
import { DelveConfirmationUi, DelveRewardsUi, UpdateReadyUi, type DelveRewardsModel } from './overlays.js';
import { GameUiRuntime } from './runtime.js';
import { uiTestArt } from '../kit/lab/testing/art.js';
import type { UiKitArt } from '../kit/components/art.js';
import type { UiRoot } from '../kit/runtime/root.js';
import { drawPixelText } from '../pixel-ui.js';
const registry = bootstrapContentRegistry();
let art: UiKitArt;
const hosts: { dispose(): void }[] = [];
const fonts = new WeakMap<object, string>();
let glyphs: string[] = [];
function canvas(width: number, height: number) {
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
beforeAll(async () => {
  art = await uiTestArt(); fonts.set(art.pixel.font.image, 'font_5x7'); fonts.set(art.pixel.headerFont.image, 'font_8x12');
  vi.stubGlobal('document', { createElement: () => canvas(1, 1) });
});
afterEach(() => hosts.splice(0).forEach(host => host.dispose()));
afterAll(() => vi.unstubAllGlobals());
function node(root: UiRoot, id: string) { root.arrange(); const result = root.entries().find(entry => entry.element.id === id)?.element; if (!result) throw new Error(`missing ${id}`); return result; }
function focus(root: UiRoot, id: string) { const element = node(root, id); root.focus.set(element, 'keyboard'); root.arrange(); return element; }
function point(root: UiRoot, id: string) { const element = focus(root, id); return { x: element.rect.x + 2, y: element.rect.y + 2 }; }
function tap(root: UiRoot, id: string, pointerType = 'mouse') { const position = point(root, id); root.pointer({ type: 'down', point: position, button: 0, pointerId: 1, pointerType }); root.pointer({ type: 'up', point: position, button: 0, pointerId: 1, pointerType }); }
function reward(overrides: Partial<DelveRewardsModel> = {}, choose = vi.fn().mockResolvedValue(undefined), leaveShop = vi.fn().mockResolvedValue(undefined)) {
  const model: DelveRewardsModel = { sessionKey: 'identity:generation:run:room', visible: true, width: 640, height: 400, registry,
    run: { roomNumber: 2, roomKind: 'combat', phase: 'reward', theme: 'cellar', wave: 2, maximumWaves: 3, currency: 10 },
    offers: [0, 1, 2].map(slot => ({ slot, upgradeId: activeRogueUpgradeDefinitions(registry)![slot]!.id, rarity: 'rare', magnitudePermille: 100, cost: slot * 10 })), ...overrides };
  const ui = new DelveRewardsUi(art, { choose, leaveShop }); hosts.push(ui); ui.update(model); return { ui, model, choose, leaveShop };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('authoritative reward host', () => {
  it('requires ordinary rewards, checks current affordability, and permits only shop leave', async () => {
    const { ui, model, choose, leaveShop } = reward();
    expect(ui.active).toBe(true); ui.rewardsRoot.key({ key: 'Escape' }); expect(leaveShop).not.toHaveBeenCalled();
    ui.rewardsRoot.key({ key: '3' }); expect(choose).not.toHaveBeenCalled();
    ui.rewardsRoot.key({ key: '2', repeat: true }); expect(choose).not.toHaveBeenCalled();
    ui.rewardsRoot.key({ key: '2' }); expect(choose).toHaveBeenCalledExactlyOnceWith(1);
    await settle(); expect(ui.submissionPending).toBe(true); ui.rewardsRoot.key({ key: '1' }); expect(choose).toHaveBeenCalledOnce();
    ui.update({ ...model, run: { ...model.run, phase: 'doors' }, offers: [] }); expect(ui.active).toBe(false); expect(ui.submissionPending).toBe(false);
    ui.update({ ...model, sessionKey: 'next', run: { ...model.run, roomKind: 'shop' } }); ui.rewardsRoot.key({ key: 'Escape' }); expect(leaveShop).toHaveBeenCalledOnce();
  });
  it('preserves harmless snapshots, focus and scroll but cancels changed offer/price tails', () => {
    const { ui, model, choose } = reward(); const root = ui.rewardsRoot;
    const element = focus(root, 'delve.choose.0'), position = point(root, element.id);
    root.pointer({ type: 'down', point: position, button: 0, pointerId: 1 });
    ui.update({ ...model, run: { ...model.run, wave: 3 } }); expect(node(root, element.id)).toBe(element); expect(root.focus.current).toBe(element);
    root.pointer({ type: 'up', point: position, button: 0, pointerId: 1 }); expect(choose).toHaveBeenCalledExactlyOnceWith(0);
    ui.update({ ...model, sessionKey: 'next' }); choose.mockClear();
    const next = point(root, 'delve.choose.0'); root.pointer({ type: 'down', point: next, button: 0, pointerId: 2 });
    ui.update({ ...model, sessionKey: 'next', offers: model.offers.map(offer => ({ ...offer, cost: offer.cost + 1 })) });
    root.pointer({ type: 'up', point: next, button: 0, pointerId: 2 }); expect(choose).not.toHaveBeenCalled(); tap(root, 'delve.choose.0'); expect(choose).toHaveBeenCalledOnce();
  });
  it('cancels held offers when currency, connection, phase, or visibility changes', () => {
    for (const change of [ { run: { roomNumber: 2, roomKind: 'combat', phase: 'reward', theme: 'cellar', wave: 2, maximumWaves: 3, currency: 0 } }, { sessionKey: 'reconnected' }, { visible: false }, { offers: [] } ]) {
      const { ui, model, choose } = reward(); const position = point(ui.rewardsRoot, 'delve.choose.1');
      ui.rewardsRoot.pointer({ type: 'down', point: position, button: 0, pointerId: 1 }); ui.update({ ...model, ...change });
      ui.rewardsRoot.pointer({ type: 'up', point: position, button: 0, pointerId: 1 }); expect(choose).not.toHaveBeenCalled();
    }
  });
  it('shows rejection, allows retry, and ignores late rejection in a newer room', async () => {
    let reject!: (error: Error) => void;
    const choose = vi.fn().mockImplementationOnce(() => Promise.reject(new Error('Offer expired'))).mockImplementationOnce(() => new Promise<void>((_, no) => { reject = no; })).mockResolvedValue(undefined);
    const { ui, model } = reward({}, choose);
    ui.rewardsRoot.key({ key: '1' }); await settle(); expect(ui.submissionPending).toBe(false); expect(node(ui.rewardsRoot, 'delve.notice').label).toBe('Offer expired');
    ui.rewardsRoot.key({ key: '1' }); expect(ui.submissionPending).toBe(true);
    ui.update({ ...model, sessionKey: 'next room' }); ui.rewardsRoot.key({ key: '2' }); reject(new Error('Old failure')); await settle();
    expect(ui.submissionPending).toBe(true); expect(node(ui.rewardsRoot, 'delve.notice').label).toBe('WAITING FOR THE DELVE...'); expect(choose).toHaveBeenCalledTimes(3);
  });
  it('uses one primary touch release and rejects secondary-first release', () => {
    const { ui, choose } = reward(); const root = ui.rewardsRoot, position = point(root, 'delve.choose.0');
    root.pointer({ type: 'down', point: position, pointerId: 1, pointerType: 'touch', button: 0 });
    root.pointer({ type: 'down', point: position, pointerId: 2, pointerType: 'touch', button: 0 });
    root.pointer({ type: 'up', point: position, pointerId: 2, pointerType: 'touch', button: 0 }); expect(choose).not.toHaveBeenCalled();
    root.pointer({ type: 'up', point: position, pointerId: 1, pointerType: 'touch', button: 0 }); expect(choose).toHaveBeenCalledExactlyOnceWith(0);
  });
  it('scrolls compact touch gestures without choosing and preserves focused action through resize', () => {
    const { ui, model, choose } = reward({ width: 320, height: 180 }); const root = ui.rewardsRoot;
    const button = focus(root, 'delve.choose.1'), scroll = node(root, 'delve.scroll'); const before = scroll.scroll.y;
    const start = { x: button.rect.x + button.rect.width / 2, y: button.rect.y + button.rect.height / 2 };
    root.pointer({ type: 'down', point: start, button: 0, pointerId: 3, pointerType: 'touch' });
    root.pointer({ type: 'move', point: { x: start.x, y: start.y - 50 }, button: 0, pointerId: 3, pointerType: 'touch' });
    root.pointer({ type: 'up', point: { x: start.x, y: start.y - 50 }, button: 0, pointerId: 3, pointerType: 'touch' });
    expect(choose).not.toHaveBeenCalled(); expect(scroll.scroll.y).toBeGreaterThan(before);
    focus(root, 'delve.choose.1'); ui.update({ ...model, width: 640, height: 400 });
    expect(root.focus.current?.id).toBe('delve.choose.1'); root.key({ key: 'Enter' }); expect(choose).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('requires authoritative change after shop acknowledgment and recovers from a current rejection', async () => {
    const leaveShop = vi.fn().mockRejectedValueOnce(new Error('Still fighting')).mockResolvedValue(undefined);
    const { ui, model } = reward({}, vi.fn().mockResolvedValue(undefined), leaveShop);
    ui.update({ ...model, run: { ...model.run, roomKind: 'shop' } }); ui.rewardsRoot.key({ key: 'Escape' }); await settle();
    expect(ui.submissionPending).toBe(false); expect(node(ui.rewardsRoot, 'delve.notice').label).toBe('Still fighting');
    ui.rewardsRoot.key({ key: 'Escape' }); await settle(); ui.rewardsRoot.key({ key: 'Escape' }); expect(leaveShop).toHaveBeenCalledTimes(2); expect(ui.submissionPending).toBe(true);
  });
  it('projects live registry names and long descriptions and leaves frozen timing untouched', () => {
    const base = [...registry.upgrades.values()].find(value => 'delveBoon' in value)!;
    if (!('delveBoon' in base)) throw new Error('missing authored boon');
    const live = { ...registry, upgrades: new Map([...registry.upgrades, [base.id, { ...base, displayName: 'LIVE LONG BOON TITLE FOR THE CELLAR', description: 'Live long text '.repeat(12) }]]) };
    const { ui, model } = reward({ registry: live, offers: [{ slot: 7, upgradeId: base.delveBoon[0], rarity: 'legendary', magnitudePermille: 123, cost: 0 }] });
    expect(ui.rewardsRoot.entries().some(({ element }) => element.label === 'LIVE LONG BOON TITLE FOR THE CELLAR')).toBe(true);
    const before = JSON.stringify(model.run); ui.drawRewards(canvas(640, 400).getContext('2d') as unknown as CanvasRenderingContext2D); expect(JSON.stringify(model.run)).toBe(before);
  });
});

describe('confirmation and update lifecycle', () => {
  it('guards disabled/stale confirmation, closes once, and lets cancel retain its semantics', () => {
    const begin = vi.fn(), cancel = vi.fn(), ui = new DelveConfirmationUi(art, { begin, cancel }); hosts.push(ui);
    const model = { sessionKey: 'identity:entry', visible: true, canBegin: true, width: 320, height: 180 }; ui.update(model);
    ui.root.key({ key: 'e', repeat: true }); expect(begin).not.toHaveBeenCalled();
    const position = point(ui.root, 'delve-confirmation.begin'); ui.root.pointer({ type: 'down', point: position, pointerId: 1, button: 0 });
    ui.update({ ...model, canBegin: false }); ui.root.pointer({ type: 'up', point: position, pointerId: 1, button: 0 }); ui.root.key({ key: 'e' }); expect(begin).not.toHaveBeenCalled();
    ui.update(model); focus(ui.root, 'delve-confirmation.cancel'); ui.root.key({ key: 'Enter' }); expect(cancel).toHaveBeenCalledOnce(); expect(begin).not.toHaveBeenCalled(); expect(ui.active).toBe(false);
    ui.update({ ...model, visible: false }); ui.update(model); ui.root.key({ key: 'e' }); ui.root.key({ key: 'e' }); expect(begin).toHaveBeenCalledOnce();
  });
  it('keeps Later during available snapshots and rearms synchronously on a new availability interval', () => {
    const refresh = vi.fn(), later = vi.fn(), ui = new UpdateReadyUi(art, { refresh, later }); hosts.push(ui);
    const model = { width: 320, height: 180, status: 'available' as const }; ui.update(model); expect(ui.active).toBe(true);
    focus(ui.root, 'update-ready.later'); ui.root.key({ key: 'Enter' }); expect(later).toHaveBeenCalledOnce(); expect(refresh).not.toHaveBeenCalled();
    ui.update({ ...model, width: 640 }); expect(ui.active).toBe(false);
    ui.update({ ...model, status: 'checking' }); ui.update(model); expect(ui.active).toBe(true);
    ui.root.key({ key: 'Enter', repeat: true }); expect(refresh).not.toHaveBeenCalled(); ui.root.key({ key: 'Enter' }); ui.root.key({ key: 'Enter' }); expect(refresh).toHaveBeenCalledOnce();
  });
  it('cancels an obsolete update gesture and blocks rewards when update takes over', () => {
    const { ui: rewards, choose } = reward(); const refresh = vi.fn(), update = new UpdateReadyUi(art, { refresh }); hosts.push(update);
    const runtime = new GameUiRuntime(); hosts.push(runtime);
    runtime.register({ id: 'rewards', root: rewards.rewardsRoot, priority: 1100, active: () => rewards.active, blocking: () => true });
    runtime.register({ id: 'update', root: update.root, priority: 1200, active: () => update.active, blocking: () => true });
    const position = point(rewards.rewardsRoot, 'delve.choose.0'); runtime.pointer({ type: 'down', point: position, pointerId: 1, button: 0 });
    update.update({ status: 'available', width: 640, height: 400 }); runtime.reconcile(); runtime.pointer({ type: 'up', point: position, pointerId: 1, button: 0 }); expect(choose).not.toHaveBeenCalled();
    const refreshPoint = point(update.root, 'update-ready.refresh'); runtime.pointer({ type: 'down', point: refreshPoint, pointerId: 2, button: 0 });
    update.update({ status: 'current', width: 640, height: 400 }); runtime.pointer({ type: 'up', point: refreshPoint, pointerId: 2, button: 0 }); expect(refresh).not.toHaveBeenCalled(); expect(choose).not.toHaveBeenCalled();
  });
});

it('renders real 5x7 glyphs and fully reachable actions at compact/wide scales 1–3 and fractional DPR', () => {
  const directory = process.env['ORCHARD_OVERLAYS_EVIDENCE']; if (directory) mkdirSync(directory, { recursive: true });
  for (const [width, height] of [[320, 180], [640, 400]] as const) for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25]) {
    const confirmation = new DelveConfirmationUi(art, { begin: vi.fn(), cancel: vi.fn() }); hosts.push(confirmation); confirmation.update({ sessionKey: 'render', visible: true, canBegin: true, width, height });
    const update = new UpdateReadyUi(art, { refresh: vi.fn() }); hosts.push(update); update.update({ status: 'available', width, height });
    const { ui: rewards, model } = reward({ width, height }); rewards.update({ ...model, run: { ...model.run, roomKind: 'shop' } });
    for (const [name, root, ids] of [['confirmation', confirmation.root, ['delve-confirmation.begin', 'delve-confirmation.cancel']], ['update', update.root, ['update-ready.refresh', 'update-ready.later']], ['rewards', rewards.rewardsRoot, ['delve.choose.0', 'delve.choose.1', 'delve.leave']], ['hud', rewards.hudRoot, []]] as const) {
      const image = canvas(Math.ceil(width * scale * dpr), Math.ceil(height * scale * dpr)), context = image.getContext('2d') as unknown as CanvasRenderingContext2D;
      context.scale(scale * dpr, scale * dpr); glyphs = []; drawPixelText(context, art.pixel, 'CALIBRATE', 0, 0, { font: 'header' }); expect(glyphs).toContain('font_8x12'); context.clearRect(0, 0, width, height); glyphs = [];
      root.drawInContext(context); if (name === 'rewards') rewards.drawHud(context); expect(new Set(glyphs)).toEqual(new Set(['font_5x7']));
      for (const id of ids) { const element = focus(root, id); expect(element.clip.height).toBe(element.rect.height); expect(element.clip.width).toBe(element.rect.width); expect(element.clip.y).toBeGreaterThanOrEqual(0); expect(element.clip.y + element.clip.height).toBeLessThanOrEqual(height); }
      if (directory && dpr === 1.25) writeFileSync(`${directory}/${name}-${width}x${height}-scale${scale}-dpr${dpr}.png`, image.toBuffer('image/png'));
    }
  }
});
