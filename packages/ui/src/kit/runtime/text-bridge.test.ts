import { expect, it, vi } from 'vitest';
import { uiInput } from '../components/input.js';
import { UiTextBridge } from './text-bridge.js';
it('suspends native editing for a blocking canvas surface and restores the retained editor', () => {
  const documentStub = { activeElement: null as unknown, body: { append() {} }, createElement: () => new Input() };
  class Input extends EventTarget {
    style = {}; dataset = {}; value = ''; tabIndex = 0; spellcheck = false; readOnly = false;
    focus() { documentStub.activeElement = this; }
    setAttribute() {} setSelectionRange() {} remove() {}
  }
  const canvas = { focus() { documentStub.activeElement = canvas; } } as unknown as HTMLCanvasElement;
  vi.stubGlobal('document', documentStub);
  const input = uiInput({label:'Name',value:'Mara'});
  const bridge = new UiTextBridge(canvas,()=>input,()=>false,()=>({x:0,y:0,width:200,height:24}),()=>{});
  try {
    bridge.sync();expect(documentStub.activeElement).toBe(bridge.input);
    UiTextBridge.setCanvasBlocked(canvas,true);expect(documentStub.activeElement).toBe(canvas);
    bridge.sync();expect(documentStub.activeElement).toBe(canvas);
    UiTextBridge.setCanvasBlocked(canvas,false);expect(documentStub.activeElement).toBe(bridge.input);expect(bridge.input.value).toBe('Mara');
  } finally { bridge.dispose();vi.unstubAllGlobals(); }
});
