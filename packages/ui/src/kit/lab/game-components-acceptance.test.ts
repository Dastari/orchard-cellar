import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { ui, UI_AUTHORED_FAMILIES, type UiKitArt } from '../components/index.js';
import { UI_LAB_MIGRATION_SURFACES } from '../../ui-lab-catalog.js';
import { UI_LAB_SPECIMENS } from './registry.js';
import { UiRoot } from '../runtime/root.js';
import { uiTestArt } from './testing/art.js';
import { uiLabGameOptions } from './game-mock.js';
let art: UiKitArt; beforeAll(async () => { art = await uiTestArt(); }); afterAll(() => vi.unstubAllGlobals());
it('registers every migration surface with the exact public composition used by hosts', () => {
  const registered = UI_LAB_SPECIMENS.filter(specimen => specimen.district === 'migration');
  expect(registered.map(specimen => specimen.id).sort()).toEqual([...UI_LAB_MIGRATION_SURFACES.map(surface => `migration-${surface.id}`), 'migration-diagnostics'].sort());
  for (const specimen of registered) {
    const root = new UiRoot({ art, scale: 1 }); root.resize(640,480);
    const diagnostics = vi.fn(ui.diagnostics), layerInspector = vi.fn(ui.layerInspector);
    const node = specimen.build({ ...ui, diagnostics, layerInspector }, {}, { art, activate: vi.fn() }); root.mount(node); root.arrange();
    if (specimen.id === 'migration-diagnostics') {
      // Debug hosts directly compose these two public factories rather than a game menu surface.
      expect(diagnostics).toHaveBeenCalledOnce(); expect(layerInspector).toHaveBeenCalledOnce();
      expect(diagnostics.mock.results[0]!.value.isDescendantOf(node)).toBe(true);
      expect(layerInspector.mock.results[0]!.value.isDescendantOf(node)).toBe(true);
    } else expect(node.props['migrationSurface']).toBe(specimen.id.slice('migration-'.length));
    root.dispose();
  }
});
it('audits nonempty authored states, variants and animations while virtualizing cell rows', () => {
  for (const family of UI_AUTHORED_FAMILIES) {
    const root = new UiRoot({ art, scale: 1 }); root.resize(640,480); root.mount(ui.authoredCatalog({ family, art })); root.arrange();
    const catalog = root.entries().find(({ element }) => element.props['authoredCount'] !== undefined)!.element;
    const count = Number(catalog.props['authoredCount']); expect(count).toBeGreaterThan(0);
    if (family === 'icons') expect(count).toBe(624);
    expect(root.entries().filter(({ element }) => element.kind === 'authored-cell').length).toBeLessThanOrEqual(96);
    expect(new Set(catalog.props['authoredNames'] as string[]).size).toBe(count); root.dispose();
  }
});
it('binds frame capacities and output restrictions to the inventory authority', () => {
  const options = uiLabGameOptions('furnace', {}, { activate: vi.fn() }), frame = options.inventory!, model = frame.controller!.model;
  expect(model.stack({ container: 'backpack', index: 19 })).toBeNull();
  frame.controller!.activate({ container: 'backpack', index: 0 }); expect(model.cursor?.itemKind).toBe('wood');
  expect(model.canAccept({ container: 'entity', index: 2 })).toBe(false);
  // The current content pack accepts wood as furnace fuel. Ore remains input-only.
  expect(model.canAccept({ container: 'entity', index: 1 })).toBe(true);
  expect(model.canAccept({ container: 'entity', index: 1 }, { itemKind: 'iron_ore', quantity: 1 })).toBe(false);
  expect(model.canAccept({ container: 'entity', index: 0 }, { itemKind: 'iron_ore', quantity: 1 })).toBe(true);
  frame.controller!.activate({ container: 'entity', index: 2 }); expect(model.cursor?.itemKind).toBe('wood'); frame.controller!.dispose();
});
it('selects a hotbar slot by number without transferring its item', () => {
  const selected = vi.fn(), root = new UiRoot({ scale: 1 }); root.resize(640,200);
  const options = uiLabGameOptions('hotbar-vitals', {}, { activate: vi.fn() }), model = options.inventory!.controller!.model;
  const bar = ui.hotbar({ container: 'hotbar', controller: options.inventory!.controller, onSelect: selected }); root.mount(bar); root.arrange(); root.focus.set(bar.children[0]!);
  root.key({ key: '3' }); expect(selected).toHaveBeenCalledWith(2); expect(bar.children[2]!.props['selected']).toBe(true); expect(model.cursor).toBeNull(); root.dispose();
});
it('validates JSON drafts before replacing the preview and never publishes anonymously', async () => {
  const specimen = UI_LAB_SPECIMENS.find(specimen => specimen.id === 'frame-designer')!, activate = vi.fn();
  const root = new UiRoot({ art, scale: 1 }); root.resize(960,800); root.mount(specimen.build(ui, {}, { art, activate })); root.arrange();
  const find = (label: string) => root.entries().find(({ element }) => element.label === label)?.element;
  const editor = root.entries().find(({ element }) => element.id === 'frame-designer-json')!.element;
  root.focus.set(editor); root.key({ key: 'a', ctrlKey: true }); root.key({ key: '{' });
  root.focus.set(find('Apply JSON')!); root.key({ key: 'Enter' }); root.arrange();
  expect(find('Publish')?.disabled).toBe(true);
  expect(root.entries().some(({ element }) => element.kind === 'frame' && element.id.startsWith('frame:'))).toBe(true);
  expect(activate).not.toHaveBeenCalledWith('Applied JSON'); root.dispose();
});
it('raises overlapping windows when a descendant receives keyboard focus', () => {
  const first = ui.frame({ children: [ui.button({ label: 'First' })], layout: { width: 'grow', height: 'grow' } }), second = ui.frame({ children: [ui.button({ label: 'Second' })], layout: { width: 'grow', height: 'grow' } });
  const stack = ui.windowStack({ width: 'grow', height: 'grow' }, [first,second]), root = new UiRoot({ scale: 1 }); root.resize(400,300); root.mount(stack); root.arrange();
  root.focus.set(root.entries().find(({ element }) => element.label === 'First')!.element); root.arrange(); expect(stack.children.at(-1)).toBe(first);
  root.focus.set(root.entries().find(({ element }) => element.label === 'Second')!.element); root.arrange(); expect(stack.children.at(-1)).toBe(second); root.dispose();
});
it('keeps a held touch direction while another pointer activates an action', () => {
  const direction = vi.fn(), action = vi.fn(), root = new UiRoot({ scale: 1 }); root.resize(400,240); root.mount(ui.touchControls({ onDirection: direction, onAction: action })); root.arrange();
  const joystick = root.entries().find(({ element }) => element.kind === 'joystick')!.element.rect, button = root.entries().find(({ element }) => element.label === 'interact')!.element.rect;
  const point = { x: joystick.x + joystick.width - 4, y: joystick.y + joystick.height / 2 }, actionPoint = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  root.pointer({ type: 'down', point, pointerId: 1, button: 0 }); const held = direction.mock.lastCall?.[0]; expect(held).toBeDefined();
  root.pointer({ type: 'down', point: actionPoint, pointerId: 2, button: 0 }); root.pointer({ type: 'up', point: actionPoint, pointerId: 2, button: 0 });
  expect(action).toHaveBeenCalledWith('interact'); expect(direction.mock.lastCall?.[0]).toEqual(held);
  root.pointer({ type: 'cancel', point, pointerId: 1, button: 0 }); expect(direction.mock.lastCall?.[0]).toBe('idle'); root.dispose();
});
it('keeps barrel contents and merchant rows visible at their compact 2x gallery sizes', () => {
  for (const id of ['barrel','merchant-shop'] as const) {
    const options = uiLabGameOptions(id, {}, { art, activate: vi.fn() });
    const surface = UI_LAB_MIGRATION_SURFACES.find(surface => surface.id === id)!, root = new UiRoot({ art, scale: 2 }); root.resize(surface.specimenSize.width,surface.specimenSize.height); root.mount(ui.gameSurface(options)); root.arrange();
    const content = root.entries().find(({ element }) => id === 'barrel' ? element.kind === 'slot' && element.label === 'entity/0' : element.kind === 'shop-row')?.element;
    expect(content, id).toBeDefined(); expect(content!.clip.height, id).toBeGreaterThan(0); expect(content!.rect.y, id).toBeLessThan(content!.clip.y + content!.clip.height); root.dispose();
  }
});

it('keeps a touch action visibly pressed until its last pointer releases', () => {
  const action = vi.fn(), root = new UiRoot({ art, scale: 1 }); root.resize(400,240);
  root.mount(ui.touchControls({ onAction: action })); root.arrange();
  const button = root.entries().find(entry => entry.element.label === 'interact')!.element;
  const point = { x: button.rect.x+4,y: button.rect.y+4 };
  const image = () => { const canvas=createCanvas(400,240); root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D,0); return canvas.toDataURL(); };
  root.pointer({ type:'down', point, pointerId:1, button:0 });
  root.pointer({ type:'down', point, pointerId:2, button:0 }); const held = image();
  root.pointer({ type:'up', point, pointerId:1, button:0 }); expect(image()).toBe(held);
  root.pointer({ type:'up', point, pointerId:2, button:0 }); expect(image()).not.toBe(held);
  expect(action).toHaveBeenCalledTimes(2); root.dispose();
});
