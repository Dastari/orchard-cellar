import { afterEach, expect, it, vi } from 'vitest';
import { CanvasTextEditor } from '../../studio/canvas-text-editor.js';
import { uiInput } from '../components/input.js';
import { UiTextBridge } from './text-bridge.js';
import { UiRoot } from './root.js';
import { uiTrade } from '../components/trade.js';
import { bootstrapContentRegistry, BRONZE_PER_GOLD } from '@orchard/sim';
afterEach(() => vi.unstubAllGlobals());

it('sets each trade money keyboard hint before native focus and resets it for ordinary text', () => {
  const focusModes: string[] = [];
  const documentStub = { activeElement: null as unknown, body: { append() {} }, createElement: () => new Input() };
  class Input extends EventTarget {
    style = {}; dataset = {}; value = ''; inputMode = ''; tabIndex = 0; spellcheck = false; readOnly = false;
    focus() { focusModes.push(this.inputMode); documentStub.activeElement = this; }
    setAttribute() {} setSelectionRange() {} remove() {}
  }
  const canvas = { focus() { documentStub.activeElement = canvas; } } as unknown as HTMLCanvasElement;
  vi.stubGlobal('document', documentStub);
  const root = new UiRoot({ scale: 1 }); root.resize(800, 600);
  const offerBronze = vi.fn(), self = { toHexString: () => 'self' }, peer = { toHexString: () => 'peer' };
  const frame = root.mount(uiTrade({ model: {
    contentRegistry: bootstrapContentRegistry(), identityHex: 'self', requesterName: 'Mara', recipientName: 'Toby',
    walletBronze: 1_000_000n, offers: [], inventorySlots: [], session: { id: 'trade', requester: self, recipient: peer,
      state: 'active', requesterAccepted: false, recipientAccepted: false, requesterBronze: 0n, recipientBronze: 0n, revision: 0n, createdTick: 0n },
  }, callbacks: { offerBronze, acceptRequest: vi.fn(), declineRequest: vi.fn(), cancel: vi.fn(),
    offerItem: vi.fn(), removeItem: vi.fn(), setAccepted: vi.fn() } }));
  root.arrange();
  const bridge = new UiTextBridge(canvas, () => root.focus.current, event => root.key(event), node => node.rect, () => root.invalidate());
  try {
    for (const denomination of ['gold', 'silver', 'bronze']) {
      const field = root.entries().find(entry => entry.element.id === `trade.money.${denomination}`)!.element;
      root.focus.set(field); bridge.sync(); expect(bridge.input.inputMode).toBe('numeric');
      expect(focusModes.at(-1)).toBe('numeric');
      if (denomination === 'gold') {
        const editor = field.props['editor'] as CanvasTextEditor; editor.setSelection(0, 1);
        const paste = Object.assign(new Event('paste', { bubbles: true, cancelable: true }), {
          clipboardData: { getData: () => '12x', setData() {} },
        });
        bridge.input.dispatchEvent(paste); expect(paste.defaultPrevented).toBe(true);
        expect(editor.snapshot().value).toBe('12'); expect(offerBronze).not.toHaveBeenCalled();
        bridge.input.dispatchEvent(Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter' }));
        expect(offerBronze).toHaveBeenCalledExactlyOnceWith('trade', 12n * BRONZE_PER_GOLD);
      }
    }
    frame.dispose();
    const name = root.mount(uiInput({ label: 'Name', value: 'Mara' })); root.arrange(); root.focus.set(name); bridge.sync();
    expect(bridge.input.inputMode).toBe('text'); expect(focusModes.at(-1)).toBe('text');
    expect(bridge.input.value).toBe('Mara');
    name.setProps({ inputMode: 'search' }); bridge.sync(); expect(bridge.input.inputMode).toBe('search');
    name.setProps({ inputMode: undefined }); bridge.sync(); expect(bridge.input.inputMode).toBe('text');
    name.setProps({ inputMode: 'numeric' }); bridge.sync();
    root.focus.set(null); bridge.sync(); expect(bridge.input.inputMode).toBe('text'); expect(documentStub.activeElement).toBe(canvas);
  } finally { bridge.dispose(); root.dispose(); }
});

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
