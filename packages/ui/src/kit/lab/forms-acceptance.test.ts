/// <reference types="node" />
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ui, type UiKitArt } from '../components/index.js';
import { UiRoot } from '../runtime/root.js';
import { uiFixed } from '../layout/box.js';
import { uiTestArt } from './testing/art.js';
import { createUiRecordingCanvas } from '../runtime/recording-canvas.js';
import type { UiElement } from '../runtime/element.js';
import type { CanvasTextEditor } from '../runtime/text-editor.js';
let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); }); afterAll(() => vi.unstubAllGlobals());
function mounted(node: UiElement, width = 400, height = 300) { const root = new UiRoot({ art, scale: 1 }); root.resize(width, height); root.mount(node); root.arrange(); return root; }
function focus(root: UiRoot, node: UiElement) { root.arrange(); root.focus.set(node); }
function nodes(root: UiRoot, kind: string) { root.arrange(); return root.entries().filter(entry => entry.element.kind === kind).map(entry => entry.element); }
it('edits selection, clipboard and composition through the shared model and clears without duplicate changes', () => {
  const change = vi.fn(), input = ui.input({ label: 'Name', value: 'Apple', onChange: change }), root = mounted(input);
  focus(root, input); root.key({ key: 'a', ctrlKey: true }); root.text('Pear'); expect(input.props['value']).toBe('Pear');
  root.key({ key: 'a', ctrlKey: true }); expect(input.hooks.onClipboard?.('copy', '', input)).toBe('Pear');
  input.hooks.onClipboard?.('cut', '', input); expect(input.props['value']).toBe('');
  input.hooks.onComposition?.('start', '', input); input.hooks.onComposition?.('update', '果', input); input.hooks.onComposition?.('end', '果物', input);
  expect(input.props['value']).toBe('果物'); expect((input.props['editor'] as CanvasTextEditor).snapshot().composing).toBe(false);
  input.hooks.onClipboard?.('paste', '!', input); expect(input.props['value']).toBe('果物!'); expect(change).toHaveBeenCalled(); root.dispose();
});
it('keeps readonly input intact and supports wrapped textarea pointer selection and resizing', () => {
  const input = ui.input({ label: 'Locked', value: 'Apple', readOnly: true }), root = mounted(input);
  focus(root, input); root.key({ key: 'Backspace' }); root.text('x'); expect(input.props['value']).toBe('Apple'); root.dispose();
  const area = ui.textArea({ label: 'Notes', value: 'First line\nSecond line\nThird line', rows: 3, lineCount: true, resizable: true });
  const areaRoot = mounted(area); const resize = nodes(areaRoot, 'textarea-resize')[0]!, field = nodes(areaRoot, 'text-area')[0]!;
  const before = field.rect.height; focus(areaRoot, resize); areaRoot.key({ key: 'ArrowDown' }); areaRoot.arrange(); expect(field.rect.height).toBe(before + 10); areaRoot.dispose();
});
it('handles choice states, roving radio selection and slider keyboard bounds', () => {
  const changed = vi.fn(), checkbox = ui.checkbox({ label: 'All', value: 'indeterminate', onChange: changed }); const root = mounted(checkbox);
  focus(root, checkbox); root.key({ key: ' ' }); expect(checkbox.props['value']).toBe(true); root.key({ key: 'Enter' }); expect(checkbox.props['value']).toBe(false); root.dispose();
  const radios = ui.radioGroup({ label: 'Crop', options: [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Pear' }] }); const radioRoot = mounted(radios);
  radioRoot.key({ key: 'Tab' }); radioRoot.key({ key: 'ArrowRight' }); expect(radios.props['value']).toBe('b'); radioRoot.dispose();
  const slider = ui.slider({ label: 'Count', min: 5, max: 25, step: 5, value: 10 }); const sliderRoot = mounted(slider);
  focus(sliderRoot, slider); sliderRoot.key({ key: 'End' }); expect(slider.props['value']).toBe(25); sliderRoot.key({ key: 'ArrowRight' }); expect(slider.props['value']).toBe(25);
  sliderRoot.key({ key: 'Home' }); expect(slider.props['value']).toBe(5); sliderRoot.dispose();
});
it('virtualizes thousands of rows and reveals the final row with keyboard navigation', () => {
  const selected = vi.fn(), items = Array.from({ length: 2000 }, (_, index) => String(index));
  const list = ui.list({ label: 'Rows', items, key: value => value, render: value => ui.text(value), onSelect: selected }); const root = mounted(list, 240, 120);
  expect(nodes(root, 'list-row').length).toBeLessThan(15); focus(root, list); root.key({ key: 'End' }); root.arrange();
  expect(list.props['active']).toBe(1999); expect(list.scroll.y).toBeGreaterThan(47000); expect(nodes(root, 'list-row').length).toBeLessThan(15);
  const last = nodes(root, 'list-row').find(node => node.label === '1999')!; expect(last.clip.height).toBe(last.rect.height);
  root.key({ key: 'Enter' }); expect(selected).toHaveBeenCalledWith(['1999'], '1999'); root.dispose();
});
it('sorts table columns in both directions, supports compound sort and paginates game defaults', () => {
  const rows = [{ id: 'a', crop: 'Pear', count: 2 }, { id: 'b', crop: 'Apple', count: 3 }, { id: 'c', crop: 'Apple', count: 1 }];
  const table = ui.table({ label: 'Crops', rows, key: row => row.id, surface: 'game', pageSize: 2, columns: [{ id: 'crop', label: 'Crop', value: row => row.crop }, { id: 'count', label: 'Count', value: row => row.count }] }); const root = mounted(table);
  expect(table.props['mode']).toBe('pagination');
  const press = (label: string, shiftKey = false) => { const button = nodes(root, 'button').find(node => node.label === label)!; focus(root, button); root.key({ key: 'Enter', shiftKey }); root.arrange(); };
  press('Crop'); expect(table.props['rowOrder']).toEqual(['b','c','a']); press('Count', true); expect(table.props['rowOrder']).toEqual(['c','b','a']);
  press('Next'); expect(table.props['page']).toBe(1); expect(nodes(root, 'list-row')).toHaveLength(1); root.dispose();
});
it('retains ancestors while searching a tree and expands through keyboard arrows', () => {
  const tree = ui.tree({ label: 'World', nodes: [{ id: 'world', label: 'World', children: [{ id: 'press', label: 'Fruit Press' }, { id: 'cellar', label: 'Cellar' }] }] }); const root = mounted(tree);
  focus(root, tree); root.key({ key: 'ArrowRight' }); root.arrange(); expect(nodes(root, 'list-row')).toHaveLength(3);
  tree.setProps({ query: 'press' }); root.arrange(); expect(nodes(root, 'list-row').map(node => node.label)).toEqual(['world', 'press']); root.dispose();
});
it('selects by keyboard search and closes on selection without moving to unrelated controls', () => {
  const changed = vi.fn(), select = ui.select({ label: 'Crop', options: [{ value: 'a', label: 'Apple' }, { value: 'p', label: 'Pear' }], onChange: changed }); const root = mounted(select);
  const control = nodes(root, 'select')[0]!; focus(root, control); root.key({ key: 'p' }); root.arrange(); root.key({ key: 'Enter' }); root.arrange();
  expect(changed).toHaveBeenCalledWith('p'); expect(root.focus.current).toBe(control); expect(nodes(root, 'popover')).toHaveLength(0); root.dispose();
});
it('ignores stale async suggestions and aborts pending requests on disposal', async () => {
  const pending: { resolve: (items: readonly { value: string; label: string }[]) => void; signal: AbortSignal }[] = [];
  const combo = ui.combobox({ label: 'Search', suggestions: (_query, signal) => new Promise(resolve => { pending.push({ resolve, signal }); }) }); const root = mounted(combo);
  const input = nodes(root, 'input')[0]!; focus(root, input); root.text('a'); root.text('b');
  expect(pending[0]!.signal.aborted).toBe(true); pending[1]!.resolve([{ value: 'new', label: 'New' }]); await Promise.resolve(); await Promise.resolve();
  pending[0]!.resolve([{ value: 'old', label: 'Old' }]); await Promise.resolve(); root.arrange();
  expect(nodes(root, 'list-row').map(node => node.label)).toEqual(['new']); root.text('c'); root.dispose(); expect(pending.at(-1)!.signal.aborted).toBe(true);
});
it('traps modal keyboard focus and restores the opener on Escape and confirmation', () => {
  const confirm = vi.fn(), dialog = ui.confirm({ title: 'Delete?', message: 'This is a test.', danger: true, onConfirm: confirm });
  const opener = ui.button({ label: 'Open', onPress: () => dialog.open(opener) }); const root = mounted(ui.flex({}, [opener, dialog])); focus(root, opener);
  root.key({ key: 'Enter' }); root.arrange(); for (let i = 0; i < 8; i++) { root.key({ key: 'Tab' }); expect(root.focus.current?.isDescendantOf(dialog)).toBe(true); }
  root.key({ key: 'Escape' }); root.arrange(); expect(dialog.visible).toBe(false); expect(root.focus.current).toBe(opener);
  dialog.open(opener); root.arrange(); const action = nodes(root, 'button').find(node => node.label === 'Delete')!; focus(root, action); root.key({ key: 'Enter' }); expect(confirm).toHaveBeenCalledTimes(1); root.dispose();
});
it('dismisses toasts on their deadline even under reduced motion', () => {
  const toast = ui.toast({ message: 'Saved', duration: 100 }); const root = mounted(toast); root.reducedMotion = true; toast.open();
  const recorder = createUiRecordingCanvas(400, 300); root.draw(recorder.context, 1000); expect(toast.visible).toBe(true); root.draw(recorder.context, 1101); expect(toast.visible).toBe(false); root.dispose();
});
it('requires a captured switch press and keeps accelerated stepper changes bounded', () => {
  const toggle = ui.switch({ label: 'Enabled' }), root = mounted(toggle);
  const point = { x: toggle.rect.x + 10, y: toggle.rect.y + 10 };
  root.pointer({ type: 'up', point, pointerId: 1, button: 0 }); expect(toggle.props['value']).toBe(false);
  root.pointer({ type: 'down', point, pointerId: 1, button: 0 }); root.pointer({ type: 'up', point: { x: 900, y: 900 }, pointerId: 1, button: 0 }); expect(toggle.props['value']).toBe(false);
  root.pointer({ type: 'down', point, pointerId: 1, button: 0 }); root.pointer({ type: 'up', point, pointerId: 1, button: 0 }); expect(toggle.props['value']).toBe(true); root.dispose();
  const stepper = ui.stepper({ label: 'Amount', min: 0, max: 25, step: 1 }), stepRoot = mounted(stepper);
  focus(stepRoot, nodes(stepRoot, 'button').find(node => node.label === '+')!); stepRoot.key({ key: 'Enter', shiftKey: true }); expect(stepper.props['value']).toBe(10);
  stepRoot.key({ key: 'Enter', ctrlKey: true }); expect(stepper.props['value']).toBe(25); stepRoot.dispose();
});
it('keeps keyboard focus on resized columns and allows wide tables to scroll horizontally', () => {
  const table = ui.table({ label: 'Wide', rows: [{ id: 'a' }], key: row => row.id,
    columns: [{ id: 'a', label: 'First', width: uiFixed(200), value: row => row.id }, { id: 'b', label: 'Second', width: uiFixed(200), value: row => row.id }] });
  const root = mounted(table, 240, 120), handle = nodes(root, 'column-resize')[0]!;
  focus(root, handle); root.key({ key: 'ArrowRight' }); root.arrange(); expect(root.focus.current?.id).toBe(handle.id);
  expect(table.scroll.maxX).toBeGreaterThan(150); root.wheel({ point: { x: 50, y: 50 }, deltaX: 80, deltaY: 0 }); root.arrange(); expect(table.scroll.x).toBeGreaterThan(0); root.dispose();
});
it('positions overlays opened before mount against arranged anchors and restores context-menu focus', () => {
  const anchor = ui.button({ label: 'Menu', layout: { position: 'absolute', inset: { left: uiFixed(200), top: uiFixed(100) }, width: uiFixed(80) } });
  const menu = ui.menu({ anchor, open: true, width: uiFixed(120), items: [{ id: 'use', label: 'Use' }] });
  const root = mounted(ui.stack({ width: 'grow', height: 'grow' }, [anchor, menu]));
  expect(menu.rect.x).toBe(anchor.rect.x); expect(menu.rect.y).toBe(anchor.rect.y + anchor.rect.height + 4); root.dispose();
  const action = vi.fn(), button = ui.button({ label: 'Target' }), context = ui.contextMenu(button, [{ id: 'use', label: 'Use', onSelect: action }]), contextRoot = mounted(context);
  focus(contextRoot, button); contextRoot.key({ key: 'F10', shiftKey: true }); contextRoot.arrange(); expect(nodes(contextRoot, 'popover')).toHaveLength(1);
  const use = nodes(contextRoot, 'button').find(node => node.label === 'Use')!; focus(contextRoot, use); contextRoot.key({ key: 'Enter' }); contextRoot.arrange(); expect(action).toHaveBeenCalledOnce(); expect(contextRoot.focus.current).toBe(button); contextRoot.dispose();
});
it('pauses toast expiry while focus remains inside and resumes its remaining duration', () => {
  let now = 1000; const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const toast = ui.toast({ message: 'Saved', duration: 100 }), other = ui.button({ label: 'Other' }), root = mounted(ui.flex({}, [other, toast])); toast.open();
  const recorder = createUiRecordingCanvas(400, 300); root.draw(recorder.context, now);
  now = 1040; focus(root, nodes(root, 'button').find(node => node.label === 'Dismiss')!);
  now = 2000; root.draw(recorder.context, now); expect(toast.visible).toBe(true); focus(root, other);
  now = 2059; root.draw(recorder.context, now); expect(toast.visible).toBe(true); now = 2061; root.draw(recorder.context, now); expect(toast.visible).toBe(false);
  root.dispose(); clock.mockRestore();
});
it('paints scrolling chrome above its children but below floating content', () => {
  const order: string[] = [], scroll = ui.scrollArea({}, [ui.text('Contents')]), floating = ui.popover({ content: ui.text('Floating'), open: true });
  const root = mounted(ui.stack({ width: 'grow', height: 'grow' }, [scroll, floating]));
  const instrument = (node: UiElement, name: string, overlay = false) => { Object.assign(node.hooks, { [overlay ? 'paintOverlay' : 'paint']: () => order.push(name) }); };
  instrument(scroll, 'scroll', true); instrument(scroll.children[0]!, 'contents'); instrument(floating, 'floating');
  root.draw(createUiRecordingCanvas(400, 300).context); expect(order.indexOf('scroll')).toBeGreaterThan(order.indexOf('contents')); expect(order.indexOf('floating')).toBeGreaterThan(order.indexOf('scroll')); root.dispose();
});

it('moves vertically through wrapped text and consumes insertion at the length limit', () => {
  const field = ui.textArea({ label: 'Wrap', value: 'abcdefghijklmnopqrstuvwx', rows: 2, layout: { width: uiFixed(80) } }), root = mounted(field);
  focus(root, field); root.key({ key: 'Home', ctrlKey: true }); root.key({ key: 'ArrowDown' });
  const editor = field.props['editor'] as CanvasTextEditor; expect(editor.snapshot().focus).toBeGreaterThan(0); expect(editor.snapshot().focus).toBeLessThan(24); root.dispose();
  const limited = ui.input({ label: 'Limited', value: 'abc', maxLength: 3 }), limitedRoot = mounted(limited); focus(limitedRoot, limited);
  expect(limitedRoot.key({ key: 'd' })).toBe(true); expect(limited.props['value']).toBe('abc');
  expect(limited.hooks.onBeforeInput?.({ inputType: 'insertText', data: 'd' }, limited)).toBe(true); expect(limited.props['value']).toBe('abc'); limitedRoot.dispose();
});
it('scrolls long notifications so their dismiss action stays reachable in a small viewport', () => {
  const toast = ui.toast({ message: 'A detailed game notification. '.repeat(80) });
  const root = mounted(toast, 240, 140); toast.open(); root.arrange();
  expect(toast.rect.height).toBeLessThanOrEqual(124);
  expect(toast.scroll.maxY).toBeGreaterThan(0);
  const dismiss = nodes(root, 'button').find(node => node.label === 'Dismiss')!;
  focus(root, dismiss); root.arrange();
  expect(dismiss.clip.height).toBe(dismiss.rect.height);
  root.key({ key: 'Enter' }); expect(toast.visible).toBe(false); root.dispose();
});
