import { describe, expect, it, vi } from 'vitest';
import { GameUiRuntime, UiRoot, UiTextBridge } from '@orchard/ui/game';
import { UiElement } from '../../ui/src/kit/runtime/element.js';
import { CanvasTextEditor } from '../../ui/src/kit/runtime/text-editor.js';
import { ChatOverlay } from '../../ui/src/chat-overlay.js';
import { uiButton } from '../../ui/src/kit/components/button.js';
import { uiInput } from '../../ui/src/kit/components/input.js';
import { uiFixed } from '../../ui/src/kit/layout/box.js';
import { RetainedUiPointers, retainedUiClientRect } from './retained-ui-input.js';

function pointer(type: string, id = 1, x = 10): PointerEvent {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId: id, clientX: x, clientY: 10, pointerType: 'touch', isPrimary: true,
    button: 0, shiftKey: false, altKey: true, ctrlKey: false, metaKey: false,
  }) as PointerEvent;
}

function fixture() {
  const target = new EventTarget(), captures = new Set<number>(), calls: string[] = [];
  const delayedLoss: number[] = [];
  let active = true, delayLoss = false;
  const canvas = Object.assign(new EventTarget(), {
    focus: () => calls.push('focus'),
    setPointerCapture: (id: number) => captures.add(id),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture(id: number) {
      captures.delete(id); calls.push(`release:${id}`);
      if (delayLoss) delayedLoss.push(id);
      else canvas.dispatchEvent(pointer('lostpointercapture', id));
    },
  });
  const runtime = new GameUiRuntime(), root = new UiRoot({ scale: 1 });
  root.resize(100, 100);
  root.mount(new UiElement({ style: { width: uiFixed(50), height: uiFixed(50) }, onPointer: event => {
    calls.push(`${event.type}:${event.pointerId}`);
    if (event.type === 'down') event.capture();
    if (event.type === 'up') expect(captures.has(event.pointerId)).toBe(false);
    expect(event.pointerType).toBe('touch'); expect(event.altKey).toBe(true);
    return true;
  } }));
  runtime.register({ id: 'panel', priority: 1, root, active: () => active, blocking: () => false });
  const adapter = new RetainedUiPointers(canvas as unknown as HTMLCanvasElement, target as unknown as Window,
    runtime, event => ({ x: event.clientX, y: event.clientY }), () => calls.push('sync'), () => calls.push('observe'));
  return { adapter, canvas, runtime, target, calls, captures, hide: () => { active = false; },
    delayLoss: () => { delayLoss = true; }, flushLoss: () => {
      for (const id of delayedLoss.splice(0)) canvas.dispatchEvent(pointer('lostpointercapture', id));
    }, dispose() { adapter.dispose(); runtime.dispose(); root.dispose(); } };
}

describe('retained UI DOM boundary', () => {
  it('defers actual native editor focus during capture, including frame synchronization', () => {
    const target = new EventTarget(), trace: string[] = [];
    let captured = false;
    const documentStub = { activeElement: null as unknown, body: { append() {} }, createElement: () => new NativeInput() };
    class NativeInput extends EventTarget {
      style = {}; dataset = {}; value = '';
      setAttribute() {} setSelectionRange() {} remove() {}
      focus() { trace.push(`native-focus:${captured}`); documentStub.activeElement = this; }
    }
    const canvas = Object.assign(new EventTarget(), {
      focus() { documentStub.activeElement = canvas; },
      setPointerCapture() { captured = true; trace.push('capture'); },
      hasPointerCapture: () => captured,
      releasePointerCapture() { captured = false; trace.push('release'); canvas.dispatchEvent(pointer('lostpointercapture')); },
    });
    vi.stubGlobal('document', documentStub);
    const runtime = new GameUiRuntime(), root = new UiRoot({ scale: 1 }); root.resize(200, 100);
    root.mount(uiInput({ label: 'Name', editor: new CanvasTextEditor(), layout: { width: uiFixed(100) } }));
    runtime.register({ id: 'name', priority: 1, root, active: () => true, blocking: () => false });
    const bridge = new UiTextBridge(canvas as unknown as HTMLCanvasElement, () => runtime.focusedElement,
      event => runtime.key(event), element => element.rect, () => {});
    const sync = () => { if (!adapter.hasCapture) bridge.sync(); };
    const adapter = new RetainedUiPointers(canvas as unknown as HTMLCanvasElement, target as unknown as Window,
      runtime, event => ({ x: event.clientX, y: event.clientY }), sync, () => {});
    try {
      adapter.dispatch('down', pointer('pointerdown'), 'name'); sync(); sync();
      expect(trace).toEqual(['capture']);
      target.dispatchEvent(pointer('pointerup'));
      expect(trace).toEqual(['capture', 'release', 'native-focus:false']);
      expect(documentStub.activeElement).toBe(bridge.input);
    } finally { adapter.dispose(); bridge.dispose(); runtime.dispose(); root.dispose(); vi.unstubAllGlobals(); }
  });

  it('declares capture before synchronous native-editor blur during canvas focus', () => {
    const f = fixture(), observed: boolean[] = [];
    f.canvas.focus = () => observed.push(f.adapter.hasCapture);
    try {
      f.adapter.dispatch('down', pointer('pointerdown'), 'panel');
      expect(observed).toEqual([true]);
      f.target.dispatchEvent(pointer('pointerup'));
      expect(f.adapter.hasCapture).toBe(false);
    } finally { f.dispose(); }
  });

  it.each([false,true])('preserves a chat draft during another passive gesture, then applies desktop/touch dismissal policy (%s)', touch => {
    const target = new EventTarget(), captures = new Set<number>();
    const doc = { activeElement:null as unknown, body:{append(){}}, createElement:()=>new NativeInput() };
    class NativeInput extends EventTarget { style={};dataset={};value='';setAttribute(){}setSelectionRange(){}remove(){}focus(){doc.activeElement=this;} }
    const canvas = Object.assign(new EventTarget(), {
      focus() { const old=doc.activeElement; doc.activeElement=canvas; if(old instanceof EventTarget && old!==canvas) old.dispatchEvent(new Event('blur')); },
      setPointerCapture:(id:number)=>captures.add(id), hasPointerCapture:(id:number)=>captures.has(id), releasePointerCapture:(id:number)=>captures.delete(id),
    });
    vi.stubGlobal('document',doc);
    const chat = new ChatOverlay(undefined,async()=>{},()=>{},{read:()=>null,write(){}});
    chat.update({sessionKey:'same',width:800,height:600,connected:true,canAdministerWorld:false,onlinePlayerNames:[],replyPlayerName:null,messages:[],touchControls:touch});
    const runtime=new GameUiRuntime(), other=new UiRoot({scale:1}); other.resize(800,600);
    other.mount(uiButton({label:'Tracked quest',layout:{position:'absolute',inset:{left:uiFixed(500),top:0},width:uiFixed(100),height:uiFixed(40)},onPress(){}}));
    runtime.register({id:'chat',priority:150,root:chat.root,active:()=>chat.active,blocking:()=>false});
    runtime.register({id:'quest',priority:100,root:other,active:()=>true,blocking:()=>false});
    let owned=false;
    const bridge=new UiTextBridge(canvas as unknown as HTMLCanvasElement,()=>runtime.focusedElement,e=>runtime.key(e),e=>e.rect,()=>{});
    const sync=()=>{if(adapter.hasCapture)return;bridge.sync();owned=runtime.focusedElement?.props['editor']===chat.editor;};
    const adapter=new RetainedUiPointers(canvas as unknown as HTMLCanvasElement,target as unknown as Window,runtime,e=>({x:e.clientX,y:e.clientY}),sync,()=>{});
    bridge.input.addEventListener('blur',()=>{if(owned&&!adapter.hasCapture)chat.blurInput();owned=false;});
    try {
      chat.open('draft survives');runtime.focus('chat');sync();
      adapter.dispatch('down',pointer('pointerdown',1,510),'quest');target.dispatchEvent(pointer('pointerup',1,510));
      expect(chat.isOpen).toBe(true);expect(chat.editor.snapshot().value).toBe('draft survives');
      expect(doc.activeElement).toBe(canvas);expect(owned).toBe(false);
      runtime.clearFocus();sync();chat.blurInput();
      expect(chat.isOpen).toBe(touch);expect(chat.editor.snapshot().value).toBe('draft survives');
      if(touch){chat.open();runtime.focus('chat');sync();expect(doc.activeElement).toBe(bridge.input);}
    } finally {adapter.dispose();bridge.dispose();runtime.dispose();chat.dispose();other.dispose();vi.unstubAllGlobals();}
  });

  it('keeps outside tails before legacy capture and releases before up activation', () => {
    const f = fixture(); let legacy = 0;
    try {
      f.target.addEventListener('pointerup', () => legacy++);
      expect(f.adapter.dispatch('down', pointer('pointerdown'), 'panel')).toBe(true);
      f.target.dispatchEvent(pointer('pointermove', 1, 300));
      f.target.dispatchEvent(pointer('pointerup', 1, 300));
      expect(f.calls.filter(call => /^(down|move|up|cancel):/.test(call))).toEqual(['down:1', 'move:1', 'up:1']);
      expect(f.calls.indexOf('release:1')).toBeLessThan(f.calls.indexOf('up:1'));
      expect(legacy).toBe(0); expect(f.runtime.tracksPointer(1)).toBe(false);
    } finally { f.dispose(); }
  });

  it('cancels on recovery and swallows the old tail before recovery listeners', () => {
    const f = fixture(); let legacy = 0;
    try {
      f.target.addEventListener('pointerup', () => legacy++);
      f.adapter.dispatch('down', pointer('pointerdown'), 'panel'); f.hide();
      f.target.dispatchEvent(pointer('pointerup'));
      expect(f.calls).toContain('cancel:1'); expect(f.calls).not.toContain('up:1');
      expect(legacy).toBe(0); expect(f.captures.size).toBe(0);
      // Unowned world releases still follow the normal host listeners.
      f.target.dispatchEvent(pointer('pointerup', 9)); expect(legacy).toBe(1);
    } finally { f.dispose(); }
  });

  it('unexpected capture loss cancels one pointer and suppresses its eventual release', () => {
    const f = fixture(); let legacy = 0;
    try {
      f.target.addEventListener('pointerup', () => legacy++);
      f.adapter.dispatch('down', pointer('pointerdown', 1), 'panel');
      f.adapter.dispatch('down', pointer('pointerdown', 2), 'panel');
      f.captures.delete(1); f.canvas.dispatchEvent(pointer('lostpointercapture', 1));
      expect(f.calls).toContain('cancel:1'); expect(f.calls).not.toContain('cancel:2');
      f.target.dispatchEvent(pointer('pointerup', 1));
      f.target.dispatchEvent(pointer('pointerup', 2));
      expect(f.calls).not.toContain('up:1'); expect(f.calls).toContain('up:2'); expect(legacy).toBe(0);
    } finally { f.dispose(); }
  });

  it('delayed capture loss after blur does not discard cancelled-tail suppression', () => {
    const f = fixture(); let legacy = 0;
    try {
      f.target.addEventListener('pointerup', () => legacy++);
      f.adapter.dispatch('down', pointer('pointerdown'), 'panel'); f.delayLoss();
      f.adapter.cancel(); f.flushLoss();
      expect(f.runtime.tracksPointer(1)).toBe(true);
      f.target.dispatchEvent(pointer('pointerup'));
      expect(f.calls.filter(call => call === 'cancel:1')).toHaveLength(1);
      expect(f.calls).not.toContain('up:1'); expect(legacy).toBe(0);
    } finally { f.dispose(); }
  });

  it('does not swallow a new native-control gesture after a lost release outside the window', () => {
    const f = fixture(); let nativeDown = 0, nativeUp = 0;
    try {
      f.target.addEventListener('pointerdown', () => nativeDown++);
      f.target.addEventListener('pointerup', () => nativeUp++);
      f.adapter.dispatch('down', pointer('pointerdown'), 'panel');
      f.adapter.cancel(); // Original up occurs off-window and never reaches us.
      expect(f.runtime.tracksPointer(1)).toBe(true);
      f.target.dispatchEvent(pointer('pointerdown'));
      const release = pointer('pointerup'); f.target.dispatchEvent(release);
      expect([nativeDown, nativeUp]).toEqual([1, 1]);
      expect(release.defaultPrevented).toBe(false);
      expect(f.runtime.tracksPointer(1)).toBe(false);
      expect(f.calls).not.toContain('up:1');
    } finally { f.dispose(); }
  });

  it('maps editor rectangles through safe area, fitted scale and CSS resizing without a second DPR factor', () => {
    for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25, 1.5]) {
      const css = { width: 800, height: 600 }, bitmap = { width: css.width * dpr, height: css.height * dpr };
      const dom = { left: 13, top: 29, width: 640, height: 480 }, safe = { left: 21, top: 17 };
      const box = retainedUiClientRect({ x: 31, y: 43, width: 100, height: 20 }, dom, css, safe, scale);
      // Same conversion the game uses for a pointer, independent of bitmap size.
      expect(((box.x - dom.left) * css.width / dom.width - safe.left) / scale).toBeCloseTo(31);
      expect(((box.y - dom.top) * css.height / dom.height - safe.top) / scale).toBeCloseTo(43);
      expect(box.width).toBeCloseTo(100 * scale * dom.width / (bitmap.width / dpr));
      expect(box.height).toBeCloseTo(20 * scale * dom.height / (bitmap.height / dpr));
    }
  });
});
