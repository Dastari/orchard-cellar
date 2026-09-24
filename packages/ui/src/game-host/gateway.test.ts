import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { GameGateway, GameGatewayLoading, gameGatewayLayout, type GameGatewayModel } from './gateway.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiTestArt, uiTestAsset } from '../kit/lab/testing/art.js';
import type { UiRoot } from '../kit/runtime/root.js';
import { UiTextBridge } from '../kit/runtime/text-bridge.js';

let art: UiKitArt;
const hosts: { dispose(): void }[] = [];
beforeAll(async () => { art = await uiTestArt(); });
afterEach(() => { hosts.splice(0).forEach(host => host.dispose()); vi.unstubAllGlobals(); });
const model: GameGatewayModel = { scopeKey: 'anonymous:1', localPreview: false, signedIn: false, profiles: ['Mara', 'Toby'], selected: 0,
  message: 'Create an account or sign in to continue', busy: false, allowLocalPreview: true, allowPreviewToggle: true };
function fixture(overrides: Partial<GameGatewayModel> = {}) {
  const commands = { onAction: vi.fn(), onSelectProfile: vi.fn(), onNameChange: vi.fn(), onDismissName: vi.fn() };
  const host = new GameGateway(art, commands, { version: 'test', emblem: uiTestAsset('icon_resource_fruit') }); hosts.push(host);
  host.setBounds({ x: 8, y: 8, width: 464, height: 384 }, 480, 400); host.update({ ...model, ...overrides });
  return { host, ...commands };
}
function node(root: UiRoot, id: string) { root.arrange(); const found = root.entries().find(entry => entry.element.id === id)?.element; if (!found) throw new Error(`Missing ${id}`); return found; }
function focus(root: UiRoot, id: string) { const found = node(root, id); root.focus.set(found); root.arrange(); return found; }
function point(root: UiRoot, id: string) { const found = focus(root, id); return { x: found.rect.x + 4, y: found.rect.y + 4 }; }
function key(host: GameGateway, value: string, repeat = false) { return host.handleGlobalKeyDown({ key: value, repeat }) || host.root.key({ key: value, repeat }); }
function tap(root: UiRoot, id: string) { const p = point(root, id); root.pointer({ type: 'down', point: p, button: 0, pointerId: 1 }); root.pointer({ type: 'up', point: p, button: 0, pointerId: 1 }); }

it('routes each actual account action once, honors focus, and blocks auth/navigation busy', () => {
  const { host, onAction } = fixture();
  key(host, 'Enter'); expect(onAction).toHaveBeenLastCalledWith('sign-in', undefined);
  focus(host.root, 'gateway.recover'); key(host, 'Enter'); expect(onAction).toHaveBeenLastCalledWith('recover', undefined);
  tap(host.root, 'gateway.register'); expect(onAction).toHaveBeenLastCalledWith('register', undefined);
  expect(onAction).toHaveBeenCalledTimes(3);
  host.update({ ...model, signedIn: true, displayName: 'Mara' });
  key(host, 'Enter'); expect(onAction).toHaveBeenLastCalledWith('enter-world', undefined);
  key(host, 'l'); expect(onAction).toHaveBeenLastCalledWith('sign-out', undefined);
  host.update({ ...model, signedIn: true, busy: true });
  key(host, 'Enter'); key(host, 'l'); key(host, 'd'); expect(onAction).toHaveBeenCalledTimes(5);
  host.update({ ...model, signedIn: true, busy: false });
  key(host, 'Enter', true); key(host, 'l', true); expect(onAction).toHaveBeenCalledTimes(5);
});

it('preserves local draft/caret through echoes, resizing and keyboard selection; Escape clears and row selection replaces', () => {
  const { host, onSelectProfile, onDismissName, onAction } = fixture({ localPreview: true });
  key(host, 'n'); const input = node(host.root, 'gateway.name');
  host.editor.setValue('New Farmer'); host.editor.setSelection(2, 6); host.editor.handleCompositionStart({ data: '' });
  host.update({ ...model, localPreview: true, message: 'New notice' });
  host.setBounds({ x: 4, y: 4, width: 312, height: 172 }, 320, 180);
  expect(host.root.focus.current).toBe(input); expect(input.clip.height).toBe(input.rect.height); expect(host.editor.snapshot()).toMatchObject({ value: 'New Farmer', anchor: 2, focus: 6, composing: true });
  host.editor.handleCompositionEnd({ data: '' }); host.editor.setValue('New Farmer');
  host.root.focus.set(null); key(host, 'ArrowUp'); expect(onSelectProfile).toHaveBeenLastCalledWith(1);
  expect(host.editor.snapshot().value).toBe('New Farmer');
  key(host, 'Enter'); expect(onAction).toHaveBeenCalledExactlyOnceWith('continue-local', 'New Farmer');
  key(host, 'Escape'); expect(host.editor.snapshot().value).toBe(''); expect(onDismissName).toHaveBeenCalledOnce(); expect(host.root.focus.current).toBeNull();
  host.editor.setValue('Draft'); tap(host.root, 'gateway.profile.1'); expect(host.editor.snapshot().value).toBe(''); expect(onSelectProfile).toHaveBeenLastCalledWith(1);
});

it('keeps DEV gates and raw-name validation owned by the client, including empty selected-profile submit', () => {
  const { host, onAction } = fixture({ localPreview: true, allowLocalPreview: false });
  expect(host.root.entries().some(entry => entry.element.id === 'gateway.name')).toBe(false);
  key(host, 'd'); expect(onAction).not.toHaveBeenCalled();
  host.update({ ...model, localPreview: true, allowPreviewToggle: false });
  key(host, 'd'); expect(onAction).not.toHaveBeenCalled();
  key(host, 'Enter'); expect(onAction).toHaveBeenLastCalledWith('continue-local', '');
  host.editor.setValue('  invalid@  '); key(host, 'Enter'); expect(onAction).toHaveBeenLastCalledWith('continue-local', '  invalid@  ');
  host.update({ ...model, localPreview: true }); key(host, 'd'); expect(onAction).toHaveBeenLastCalledWith('toggle-preview', undefined);
});

it.each(['busy', 'profiles', 'selected', 'scope', 'hidden'] as const)('cancels a captured action across %s changes without retargeting its physical release', change => {
  const { host, onAction } = fixture(); const p = point(host.root, 'gateway.sign-in');
  host.root.pointer({ type: 'down', point: p, button: 0, pointerId: 7 });
  host.update(change === 'hidden' ? null : { ...model, ...(change === 'busy' ? { busy: true } : change === 'scope' ? { scopeKey: 'new:2', signedIn: true } : change === 'selected' ? { selected: 1 } : { profiles: ['Someone Else'] }) });
  host.update(model); host.root.pointer({ type: 'up', point: p, button: 0, pointerId: 7 }); expect(onAction).not.toHaveBeenCalled();
  tap(host.root, 'gateway.sign-in'); expect(onAction).toHaveBeenCalledExactlyOnceWith('sign-in', undefined);
});

it('resets private editor/composition on scope replacement while preserving lifetime root/editor', () => {
  const { host } = fixture({ localPreview: true }); const root = host.root, editor = host.editor;
  host.focusName(); host.editor.setValue('Private Draft'); host.editor.handleCompositionStart({ data: '' });
  host.update({ ...model, localPreview: true, scopeKey: 'replacement:2' });
  expect(host.root).toBe(root); expect(host.editor).toBe(editor); expect(editor.snapshot()).toMatchObject({ value: '', composing: false }); expect(root.focus.current).toBeNull();
  host.update(null); expect(host.active).toBe(false); expect(key(host, 'Enter')).toBe(false);
});

it('uses the actual shared native bridge for raw20 clipboard/IME and exactly one guarded submit', () => {
  const { host, onAction, onNameChange } = fixture({ localPreview: true });
  const documentStub = { activeElement: null as unknown, body: { append() {} }, createElement: () => new Input() };
  class Input extends EventTarget {
    style = {}; dataset = {}; value = ''; inputMode = ''; tabIndex = 0; spellcheck = false; readOnly = false;
    focus() { documentStub.activeElement = this; } setAttribute() {} setSelectionRange() {} remove() {}
  }
  const canvas = { focus() { documentStub.activeElement = canvas; } } as unknown as HTMLCanvasElement;
  vi.stubGlobal('document', documentStub); host.focusName();
  const bridge = new UiTextBridge(canvas, () => host.root.focus.current, event => host.root.key(event), element => element.rect, () => host.root.invalidate());
  try {
    bridge.sync(); expect(bridge.input.inputMode).toBe('text');
    bridge.input.dispatchEvent(Object.assign(new Event('paste', { cancelable: true }), { clipboardData: { getData: () => 'abcdefghijklmnopqrstEXCESS', setData() {} } }));
    expect(host.editor.snapshot().value).toBe('abcdefghijklmnopqrst'); expect(onNameChange).toHaveBeenLastCalledWith('abcdefghijklmnopqrst');
    host.editor.setValue('Mara'); host.editor.setSelection(4); bridge.sync();
    bridge.input.dispatchEvent(Object.assign(new Event('compositionstart'), { data: '' }));
    bridge.input.dispatchEvent(Object.assign(new Event('compositionupdate'), { data: 'a' }));
    bridge.input.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter', isComposing: true })); expect(onAction).not.toHaveBeenCalled();
    bridge.input.dispatchEvent(Object.assign(new Event('compositionend'), { data: 'a' }));
    bridge.input.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter', repeat: true })); expect(onAction).not.toHaveBeenCalled();
    bridge.input.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter' })); expect(onAction).toHaveBeenCalledExactlyOnceWith('continue-local', 'Maraa');
    bridge.input.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' })); bridge.sync();
    expect(host.editor.snapshot().value).toBe(''); expect(documentStub.activeElement).toBe(canvas);
  } finally { bridge.dispose(); }
});

it.each([false, true])('makes every account/local action reachable in actual-kit compact and wide layouts (local=%s)', localPreview => {
  vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
  const { host } = fixture({ localPreview, profiles: Array.from({ length: 12 }, (_, i) => `Long Farmer Name ${i}`) });
  for (const [width, height] of [[320, 180], [800, 500]]) {
    host.setBounds({ x: 4, y: 4, width: width! - 8, height: height! - 8 }, width!, height!);
    const ids = localPreview ? ['gateway.profile.0', 'gateway.profile.11', 'gateway.name', 'gateway.continue-local', 'gateway.toggle-preview']
      : ['gateway.sign-in', 'gateway.register', 'gateway.recover', 'gateway.toggle-preview'];
    for (const id of ids) {
      const control = focus(host.root, id); host.root.arrange();
      expect(control.clip.width, `${id} width`).toBeGreaterThanOrEqual(control.rect.width);
      expect(control.clip.height, `${id} height`).toBeGreaterThanOrEqual(control.rect.height);
      expect(control.rect.y, id).toBeGreaterThanOrEqual(4); expect(control.rect.y + control.rect.height, id).toBeLessThanOrEqual(height! - 4);
      for (const scale of [1, 2, 3]) {
        const canvas = createCanvas(Math.round(width! * scale * 1.25), Math.round(height! * scale * 1.25));
        const ctx = canvas.getContext('2d'); ctx.scale(scale * 1.25, scale * 1.25); host.draw(ctx as unknown as CanvasRenderingContext2D);
      }
    }
  }
});

it('updates actual loading composition with authoritative/clamped progress and no interactive account controls', () => {
  vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
  const host = new GameGatewayLoading(art, { version: 'test', emblem: uiTestAsset('icon_resource_fruit') }); hosts.push(host);
  host.setBounds({ x: 4, y: 4, width: 312, height: 172 }, 320, 180);
  for (const [progress, expected] of [[45, .45], [150, 1], [-10, 0], [NaN, 0]]) {
    host.update({ title: 'Opening the orchard', detail: 'Connecting to your world', progress: progress!, error: true });
    expect(node(host.root, 'gateway.loading.progress').props['value']).toBe(expected);
    expect(host.root.entries().filter(entry => entry.element.focusable)).toHaveLength(0);
    host.draw(createCanvas(320, 180).getContext('2d') as unknown as CanvasRenderingContext2D);
  }
  host.update(null); expect(host.root.entries().some(entry => entry.element.id === 'game.loading')).toBe(false);
});

 it('gives one touch gesture to profile scrolling and preserves primary focus from a second touch', () => {
  const { host, onSelectProfile, onAction } = fixture({ localPreview: true, profiles: Array.from({ length: 12 }, (_, i) => `Farmer ${i}`) });
  const p = point(host.root, 'gateway.profile.0'), area = node(host.root, 'gateway.profiles');
  const touch = (type: 'down' | 'move' | 'up' | 'cancel', x: number, y: number, pointerId = 1, isPrimary = true) => host.root.pointer({ type, point: { x, y }, button: 0, pointerId, pointerType: 'touch', isPrimary });
  touch('down', p.x, p.y); const focused = host.root.focus.current;
  const field = node(host.root, 'gateway.name'); expect(field.clip.height).toBe(field.rect.height); touch('down', field.rect.x + 2, field.rect.y + 2, 2, false);
  expect(host.root.focus.current).toBe(focused);
  touch('move', p.x, p.y - 30); touch('up', p.x, p.y - 30); touch('up', field.rect.x + 2, field.rect.y + 2, 2, false);
  expect(area.scroll.y).toBeGreaterThan(0); expect(onSelectProfile).not.toHaveBeenCalled(); expect(onAction).not.toHaveBeenCalled();
  const row = point(host.root, 'gateway.profile.3'); touch('down', row.x, row.y); touch('cancel', row.x, row.y); touch('up', row.x, row.y);
  expect(onSelectProfile).not.toHaveBeenCalled(); tap(host.root, 'gateway.profile.3'); expect(onSelectProfile).toHaveBeenCalledExactlyOnceWith(3);
 });

it('renders real-art account, local and loading evidence at compact/wide scales and fractional DPR', () => {
  vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
  const evidence = process.env['ORCHARD_GATEWAY_EVIDENCE'];
  if (evidence) mkdirSync(evidence, { recursive: true });
  const { host } = fixture(); const loading = new GameGatewayLoading(art, { version: 'test', emblem: uiTestAsset('icon_resource_fruit') }); hosts.push(loading);
  for (const [width, height] of [[320,180],[800,500]] as const) for (const scale of [1,2,3]) {
    const bounds = {x:4,y:4,width:width-8,height:height-8}; host.setBounds(bounds,width,height);loading.setBounds(bounds,width,height);
    for (const mode of ['account','signed-in','local','loading'] as const) {
      host.update({...model,localPreview:mode==='local',signedIn:mode==='signed-in',displayName:'Mara',profiles:['Twenty Character One','Twenty Character Two'],version:'test'});
      if(mode==='local') host.focusName();
      loading.update({title:'Opening the orchard',detail:'Connecting to your world',progress:65});
      const canvas=createCanvas(Math.round(width*scale*1.25),Math.round(height*scale*1.25)),ctx=canvas.getContext('2d');ctx.scale(scale*1.25,scale*1.25);
      (mode==='loading'?loading:host).draw(ctx as unknown as CanvasRenderingContext2D);
      expect(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some(value=>value!==0)).toBe(true);
      if(evidence)writeFileSync(`${evidence}/${mode}-${width}-scale${scale}-dpr1.25.png`,canvas.toBuffer('image/png'));
    }
  }
});

it('preserves deliberate scroll through harmless updates but resets it when switching account scope/mode',()=>{
 const {host}=fixture({localPreview:true});host.setBounds({x:4,y:4,width:312,height:172},320,180);host.focusName();
 const content=node(host.root,'gateway.content');expect(content.scroll.y).toBeGreaterThan(0);
 const prior=content.scroll.y;host.update({...model,localPreview:true,message:'Notice'});host.setBounds({x:4,y:4,width:312,height:172},320,180);expect(content.scroll.y).toBe(prior);
 host.update(model);expect(content.scroll.y).toBe(0);expect(host.root.focus.current).toBeNull();
});

it('reveals an edited draft after a long authoritative rejection message without committing composition',()=>{
 const {host}=fixture({localPreview:true});host.setBounds({x:4,y:4,width:312,height:172},320,180);host.focusName();
 host.editor.setValue('Draft');host.editor.handleCompositionStart({data:''});host.editor.handleCompositionUpdate({data:'a'});
 host.update({...model,localPreview:true,error:'A long account service rejection explains what happened and how to retry. '.repeat(8)});
 const field=node(host.root,'gateway.name');expect(field.clip.height).toBe(field.rect.height);expect(host.editor.snapshot()).toMatchObject({value:'Drafta',composing:true,compositionText:'a'});
});

it('fits integer-scale gateways within compact and wide safe viewports with only startup skin families', () => {
  const startupArt: UiKitArt = { ...art, skin:{...art.skin,button:{},book:{},icon:{},slot:{},cursor:{},toggle:{},selector:{},equipment:{}} };
  const loading = new GameGatewayLoading(startupArt,{version:'test',emblem:uiTestAsset('icon_resource_fruit')});hosts.push(loading);
  for(const [width,height] of [[320,180],[800,600],[1920,1080]]) for(const maximum of [1,2,3]) {
    const scene=gameGatewayLayout(width!,height!,maximum);expect(Number.isInteger(scene.scale)).toBe(true);expect(scene.scale).toBeLessThanOrEqual(maximum);
    expect(scene.frame.x).toBeGreaterThanOrEqual(0);expect(scene.frame.x+scene.frame.width).toBeLessThanOrEqual(scene.width);
    expect(scene.frame.y+scene.frame.height).toBeLessThanOrEqual(scene.height);
    loading.setBounds(scene.frame,scene.width,scene.height);loading.update({title:'OPENING THE ORCHARD',detail:'CONNECTING TO YOUR WORLD',progress:65});
    const ctx=createCanvas(width!,height!).getContext('2d');ctx.scale(scene.scale,scene.scale);loading.draw(ctx as unknown as CanvasRenderingContext2D);
    const bar=node(loading.root,'gateway.loading.progress');expect(bar.clip).toEqual(bar.rect);
  }
});
