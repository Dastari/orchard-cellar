import { expect, it, vi } from 'vitest';
import { ui } from './index.js';
import { uiFixed } from '../layout/box.js';
import { UiRoot } from '../runtime/root.js';

it('blocks panel background input while leaving its controls and the surrounding workspace interactive', () => {
  const root = new UiRoot({ scale: 1 }), press = vi.fn(); root.resize(320,240);
  root.mount(ui.stack({ width: 'grow', height: 'grow' }, [ui.frame({ blockInput: true, style: 'thin',
    layout: { position: 'absolute', inset: { left: 8, top: 8 }, width: uiFixed(160), height: uiFixed(120) },
    children: [ui.button({ id: 'confirm', label: 'Confirm', onPress: press })],
  })])); root.arrange();
  const pointer = (x:number,y:number,type:'down'|'up'='down') => root.pointer({type,point:{x,y},button:0,pointerId:1});
  expect(pointer(12,110)).toBe(true);
  expect(root.wheel({point:{x:12,y:110},deltaX:0,deltaY:100})).toBe(true);
  expect(pointer(250,200)).toBe(false);
  expect(root.wheel({point:{x:250,y:200},deltaX:0,deltaY:100})).toBe(false);
  const button=root.entries().find(({element})=>element.id==='confirm')!.element;
  const x=button.rect.x+button.rect.width/2,y=button.rect.y+button.rect.height/2;
  pointer(x,y);pointer(x,y,'up');expect(press).toHaveBeenCalledOnce();root.dispose();
});


it('anchors the opposite corner while kit resize handles clamp to the requested minimum and maximum', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(640,400);
  const frame = root.mount(ui.frame({ header: { title: 'CHEST' },
    layout: { position: 'absolute', inset: { left: uiFixed(100), top: uiFixed(80) }, width: uiFixed(240), height: uiFixed(200) },
    resizable: { handles: 'corners', min: { width: 120, height: 100 }, max: { width: 300, height: 240 } },
  })); root.arrange();
  const drag = (edge: string, dx: number, dy: number) => {
    const handle = root.entries().find(({ element }) => element.kind === 'resize-handle' && element.props['edge'] === edge)!.element;
    const start = { x: handle.clip.x + 4, y: handle.clip.y + 4 }, end = { x: start.x + dx, y: start.y + dy };
    root.pointer({ type: 'down', point: start, button: 0, pointerId: 1 });
    root.pointer({ type: 'move', point: end, button: 0, pointerId: 1 });
    root.pointer({ type: 'up', point: end, button: 0, pointerId: 1 }); root.arrange();
  };
  drag('nw', 500, 500);
  expect(frame.rect).toEqual({ x: 220, y: 180, width: 120, height: 100 });
  drag('se', 500, 500);
  expect(frame.rect).toEqual({ x: 220, y: 180, width: 300, height: 240 });
  expect(frame.clip.y + frame.clip.height).toBe(400);
  root.dispose();
});
