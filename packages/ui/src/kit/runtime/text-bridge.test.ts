import { afterEach, expect, it, vi } from 'vitest';
import { CanvasTextEditor } from '../../studio/canvas-text-editor.js';
import { uiInput } from '../components/input.js';
import { UiTextBridge } from './text-bridge.js';
afterEach(() => vi.unstubAllGlobals());

function editingFixture() {
  const documentStub = { activeElement: null as unknown, body: { append() {} }, createElement: () => new Input() };
  class Input extends EventTarget {
    style = {}; dataset = {}; value = ''; tabIndex = 0; spellcheck = false; readOnly = false;
    focus() { documentStub.activeElement = this; }
    setAttribute() {} setSelectionRange() {} remove() {}
  }
  const canvas = { focus() { documentStub.activeElement = canvas; } } as unknown as HTMLCanvasElement;
  vi.stubGlobal('document', documentStub);
  const editor = new CanvasTextEditor({ value: 'Mara' });
  const input = uiInput({ label: 'Name', editor });
  const key = vi.fn(() => false);
  const bridge = new UiTextBridge(canvas, () => input, key, () => ({ x: 0, y: 0, width: 200, height: 24 }), () => {});
  bridge.sync();
  return { canvas, editor, key, bridge };
}

it.each([
  { name: 'ordinary typing', key: 'a', composing: false, ctrl: false, handled: false, calls: 1, prevented: false },
  { name: 'handled Enter', key: 'Enter', composing: false, ctrl: false, handled: true, calls: 1, prevented: true },
  { name: 'native IME', key: 'Process', composing: true, ctrl: false, handled: false, calls: 0, prevented: false },
  { name: 'native clipboard shortcut', key: 'v', composing: false, ctrl: true, handled: false, calls: 0, prevented: false },
])('keeps $name within the editor without disabling native editing', scenario => {
  const { bridge, key } = editingFixture();
  key.mockReturnValue(scenario.handled);
  const event = Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), {
    key: scenario.key, isComposing: scenario.composing, ctrlKey: scenario.ctrl, metaKey: false,
  });
  const stop = vi.spyOn(event, 'stopPropagation');
  try {
    bridge.input.dispatchEvent(event);
    expect(stop).toHaveBeenCalledOnce();
    expect(key).toHaveBeenCalledTimes(scenario.calls);
    expect(event.defaultPrevented).toBe(scenario.prevented);
  } finally { bridge.dispose(); }
});

it('blocks a stale editor key after a modal takes keyboard ownership', () => {
  const { bridge, canvas, key } = editingFixture();
  const event = Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter' });
  const stop = vi.spyOn(event, 'stopPropagation');
  try {
    UiTextBridge.setCanvasBlocked(canvas, true);
    bridge.input.dispatchEvent(event);
    expect(stop).toHaveBeenCalledOnce();
    expect(key).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  } finally { UiTextBridge.setCanvasBlocked(canvas, false); bridge.dispose(); }
});

it('isolates native editing while committing each input once', () => {
  const { bridge, editor, key } = editingFixture();
  try {
    const insert = Object.assign(new Event('beforeinput', { bubbles: true, cancelable: true }), {
      inputType: 'insertText', data: '!',
    });
    const stopInsert = vi.spyOn(insert, 'stopPropagation');
    bridge.input.dispatchEvent(insert);
    expect(stopInsert).toHaveBeenCalledOnce();
    expect(insert.defaultPrevented).toBe(true);
    expect(editor.snapshot().value).toBe('Mara!');
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'copy', 'cut', 'paste']) {
      const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        data: '', clipboardData: { getData: () => '', setData() {} },
      });
      const stop = vi.spyOn(event, 'stopPropagation');
      bridge.input.dispatchEvent(event);
      expect(stop, type).toHaveBeenCalledOnce();
    }
    expect(key).not.toHaveBeenCalled();
  } finally { bridge.dispose(); }
});

it('lets release cleanup clear a movement key held before editor focus', () => {
  const held = new Set(['KeyW']);
  const releaseTarget = new EventTarget();
  releaseTarget.addEventListener('keyup', event => held.delete((event as KeyboardEvent).code));
  const { bridge } = editingFixture();
  try {
    const release = Object.assign(new Event('keyup', { bubbles: true }), { code: 'KeyW' });
    bridge.input.dispatchEvent(release);
    // EventTarget has no DOM ancestry; model only the browser's bubbling step.
    if (release.bubbles && !release.cancelBubble) releaseTarget.dispatchEvent(release);
    expect(held.size).toBe(0);
  } finally { bridge.dispose(); }
});
it('suspends native editing for a blocking canvas surface and restores the retained editor', () => {
  const documentStub = { activeElement: null as unknown, body: { append() {} }, createElement: () => new Input() };
  class Input extends EventTarget {
    style = {}; dataset = {}; value = ''; tabIndex = 0; spellcheck = false; readOnly = false;
    focus() { documentStub.activeElement = this; }
    setAttribute() {} setSelectionRange() {} remove() {}
  }
  const canvas = { focus() { documentStub.activeElement = canvas; } } as unknown as HTMLCanvasElement;
  vi.stubGlobal('document', documentStub);
  const input = uiInput({label:'Name',editor:new CanvasTextEditor({value:'Mara'})});
  const bridge = new UiTextBridge(canvas,()=>input,()=>false,()=>({x:0,y:0,width:200,height:24}),()=>{});
  try {
    bridge.sync();expect(documentStub.activeElement).toBe(bridge.input);
    UiTextBridge.setCanvasBlocked(canvas,true);expect(documentStub.activeElement).toBe(canvas);
    bridge.sync();expect(documentStub.activeElement).toBe(canvas);
    UiTextBridge.setCanvasBlocked(canvas,false);expect(documentStub.activeElement).toBe(bridge.input);expect(bridge.input.value).toBe('Mara');
  } finally { bridge.dispose();vi.unstubAllGlobals(); }
});
