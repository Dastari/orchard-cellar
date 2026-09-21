import { expect, it, vi } from 'vitest';
import { ui } from './index.js';
import { uiFixed } from '../layout/box.js';
import { uiScrollThumb } from '../layout/scroll.js';
import { UiElement } from '../runtime/element.js';
import { UiRoot } from '../runtime/root.js';

it('reports hidden drawers so a host can release their workspace margins after a narrow resize',()=>{
  const visibility=vi.fn();
  const root=new UiRoot({scale:2});root.resize(1280,800);
  root.mount(ui.workbench({navigation:[],workspace:ui.text('Editor'),
    controls:{title:'',surface:'thin',content:ui.text('Library')},
    inspector:{title:'Selection',content:ui.text('Properties')},onRegionVisibility:visibility}));
  root.arrange();root.resize(480,800);root.arrange();
  expect(visibility).toHaveBeenCalledWith('inspector',false);
  root.resize(1280,800);root.arrange();expect(visibility).toHaveBeenCalledWith('inspector',true);root.dispose();
});

function fixture(width = 1280, height = 800, activeDrawer: 'controls' | 'inspector' | 'none' = 'controls') {
  const changed = vi.fn(), navigate = vi.fn();
  const shell = ui.workbench({
    navigation: Array.from({ length: 20 }, (_, index) => ({ id: String(index), label: `Tool ${index}`, icon: { cf: 'book' as const }, onPress: navigate })),
    workspace: ui.text('Map workspace'), activeDrawer,
    controls: { title: 'Map editor', content: ui.flex({ gap: 4 }, Array.from({ length: 20 }, (_, index) => ui.button({ label: `Control ${index}`, layout: { shrink: 0 } }))) },
    inspector: { title: 'Selection', content: ui.text('No selection') }, onDrawerResize: changed,
  });
  const root = new UiRoot({ scale: 2 }); root.resize(width, height); root.mount(shell); root.arrange();
  const descendants = (element: UiElement): UiElement[] => [element, ...element.children.flatMap(descendants)];
  const find = (id: string) => descendants(shell).find(element => element.id === `workbench.${id}`)!;
  return { root, shell, find, changed, navigate };
}
it('keeps drawer bodies below their headers and clips scrolling rail and controls', () => {
  const { root, find } = fixture();
  for (const side of ['controls', 'inspector']) {
    const drawer = find(side), body = find(`${side}.content`);
    expect(body.rect.y).toBeGreaterThan(drawer.rect.y + 24);
    expect(body.clip.height).toBeGreaterThan(100);
    expect(body.clip.y + body.clip.height).toBeLessThanOrEqual(drawer.rect.y + drawer.rect.height);
  }
  const scrolls = root.entries().filter(({ element }) => element.kind === 'scroll-area' && element.scroll.maxY > 0);
  expect(scrolls.length).toBeGreaterThanOrEqual(2);
  for (const { element } of scrolls) {
    root.wheel({ point: { x: element.rect.x + 1, y: element.rect.y + 1 }, deltaX: 0, deltaY: 100 });
    expect(element.scroll.y).toBeGreaterThan(0);
  }
  root.dispose();
});
it('reserves a gutter so drawer scrollbars do not cover control borders', () => {
  const {root,find}=fixture();
  const body=find('controls.content');
  const scroll=root.entries().find(({element})=>element.kind==='scroll-area'&&element.isDescendantOf(body)&&element.scroll.maxY>0)!.element;
  const thumb=uiScrollThumb(scroll,'y')!;
  const buttons=root.entries().filter(({element})=>element.kind==='button'&&element.isDescendantOf(scroll));
  expect(buttons.length).toBeGreaterThan(0);
  for(const {element} of buttons)expect(element.rect.x+element.rect.width).toBeLessThanOrEqual(thumb.track.x);
  root.dispose();
});
it('resizes either drawer by keyboard without moving its outside anchor', () => {
  const { root, find, changed } = fixture();
  for (const side of ['controls', 'inspector']) {
    const drawer = find(side), left = drawer.rect.x, right = left + drawer.rect.width, width = drawer.rect.width;
    root.focus.set(find(`${side}.resize`)); root.key({ key: side === 'controls' ? 'ArrowRight' : 'ArrowLeft' }); root.arrange();
    expect(drawer.rect.width).toBe(width + 8);
    expect(side === 'controls' ? drawer.rect.x : drawer.rect.x + drawer.rect.width).toBe(side === 'controls' ? left : right);
    expect(changed).toHaveBeenLastCalledWith(side, uiFixed(width + 8));
    root.key({ key: 'End' }); root.arrange(); expect(drawer.rect.width).toBe(210);
    root.key({ key: 'Home' }); root.arrange(); expect(drawer.rect.width).toBe(90);
  }
  root.dispose();
});
it('keeps pointer capture outside the resize strip and releases on cancellation', () => {
  const { root, find, changed } = fixture(), handle = find('inspector.resize'), drawer = find('inspector');
  const edge = drawer.rect.x + drawer.rect.width, point = { x: handle.rect.x + 2, y: handle.rect.y + 20 };
  root.pointer({ type: 'down', point, pointerId: 4, button: 0 });
  root.pointer({ type: 'move', point: { x: point.x - 30, y: point.y }, pointerId: 4, button: 0 }); root.arrange();
  expect(drawer.rect.width).toBe(173); expect(drawer.rect.x + drawer.rect.width).toBe(edge);
  root.pointer({ type: 'cancel', point, pointerId: 4, button: 0 }); changed.mockClear();
  root.pointer({ type: 'move', point: { x: point.x - 60, y: point.y }, pointerId: 4, button: 0 }); expect(changed).not.toHaveBeenCalled(); root.dispose();
});
it.each(['controls', 'inspector', 'none'] as const)('shows only the chosen drawer on a phone: %s', active => {
  const { root, find } = fixture(390, 844, active);
  for (const side of ['controls', 'inspector']) {
    const drawer = find(side); expect(drawer.visible).toBe(side === active);
    if (drawer.visible) { expect(drawer.rect.x).toBeGreaterThanOrEqual(40); expect(drawer.rect.x + drawer.rect.width).toBeLessThanOrEqual(195); }
  }
  root.resize(1280,800); root.arrange(); expect(find('controls').rect.width).toBe(135); expect(find('inspector').rect.width).toBe(143); root.dispose();
});
it('activates rail navigation through retained keyboard focus', () => {
  const { root, find, navigate } = fixture(); root.focus.set(find('nav.0')); root.key({ key: 'Enter' }); expect(navigate).toHaveBeenCalledOnce(); root.dispose();
});
it('does not send blank-drawer clicks or exhausted drawer scrolling to the workspace', () => {
  const pointer = vi.fn(() => true), wheel = vi.fn(() => true);
  const root = new UiRoot({ scale: 1 }); root.resize(640,400);
  const workspace = new UiElement({ style: { width: 'grow', height: 'grow' }, onPointer: pointer, onWheel: wheel });
  root.mount(ui.workbench({ navigation: [], workspace, inspector: { title: 'Selection', content: ui.text('Empty') } })); root.arrange();
  const drawer = root.entries().find(({ element }) => element.id === 'workbench.inspector')!.element;
  const point = { x: drawer.rect.x + 40, y: drawer.rect.y + drawer.rect.height - 40 };
  expect(root.pointer({ type: 'down', point, pointerId: 1, button: 0 })).toBe(true);
  expect(root.wheel({ point, deltaX: 0, deltaY: 100 })).toBe(true);
  expect(pointer).not.toHaveBeenCalled(); expect(wheel).not.toHaveBeenCalled(); root.dispose();
});
it('dismisses a clicked rail tooltip when the pointer leaves, while retaining keyboard help', () => {
  vi.useFakeTimers(); const { root, find } = fixture(); const button = find('nav.0');
  const tooltip = button.parent!, popup = tooltip.children[1]!, point = { x: button.rect.x + 10, y: button.rect.y + 10 };
  root.pointer({ type: 'move', point, pointerId: 1, button: 0 }); vi.advanceTimersByTime(500); expect(popup.visible).toBe(true);
  root.pointer({ type: 'down', point, pointerId: 1, button: 0 }); root.pointer({ type: 'up', point, pointerId: 1, button: 0 });
  root.input.clearHover(); expect(popup.visible).toBe(false);
  root.focus.set(button); vi.runOnlyPendingTimers(); expect(popup.visible).toBe(true);
  root.dispose(); vi.runOnlyPendingTimers(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers();
});
it('keeps a single inspector accessible on a narrow workspace', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(195,400);
  root.mount(ui.workbench({ navigation: [], workspace: ui.text('Canvas'), inspector: { title: 'Selection', content: ui.text('Tile') } })); root.arrange();
  expect(root.entries().find(({ element }) => element.id === 'workbench.inspector')?.element.visible).toBe(true); root.dispose();
});

it('fills a selection editor while keeping its apply action outside the scrolling fields', () => {
  const root = new UiRoot({scale:2}); root.resize(1280,800);
  const apply = ui.button({label:'Apply changes'});
  const fields = ui.scrollArea({width:'grow',height:'grow',gap:4},Array.from({length:40},(_,index)=>ui.input({label:`Field ${index}`})));
  root.mount(ui.workbench({navigation:[],workspace:ui.text('Preview'),inspector:{title:'Selection',fill:true,
    content:ui.flex({width:'grow',height:'grow',gap:4},[fields,apply])}}));root.arrange();
  expect(fields.scroll.maxY).toBeGreaterThan(0);
  expect(apply.clip.height).toBe(apply.rect.height);
  const before={...apply.rect};
  root.wheel({point:{x:fields.rect.x+4,y:fields.rect.y+4},deltaX:0,deltaY:200});root.arrange();
  expect(fields.scroll.y).toBeGreaterThan(0);expect(apply.rect).toEqual(before);
  root.dispose();
});


it('shares navigation geometry, selection and keyboard actions with standalone lab chrome', () => {
  const navigate = vi.fn();
  const navigation = [{ id: 'lab', label: 'UI Lab', icon: { cf: 'book' as const }, selected: true, onPress: navigate }];
  const normal = new UiRoot({ scale: 2 }); normal.resize(1280, 736);
  normal.mount(ui.workbench({ navigation, workspace: ui.text('Preview') })); normal.arrange();
  const lab = new UiRoot({ scale: 2 }); lab.resize(1280, 800);
  lab.mount(ui.workbenchNavigation(navigation, { layout: { position: 'fixed', inset: { left: 0, top: 32, bottom: 0 } } })); lab.arrange();
  const ordinary = normal.entries().find(({ element }) => element.id === 'workbench.nav.lab')!.element;
  const standalone = lab.entries().find(({ element }) => element.id === 'workbench.nav.lab')!.element;
  expect(standalone.rect).toEqual({ ...ordinary.rect, y: ordinary.rect.y + 32 });
  expect(standalone.props['tone']).toBe('success'); expect(standalone.label).toBe('UI Lab');
  lab.focus.set(standalone); lab.key({ key: 'Enter' }); expect(navigate).toHaveBeenCalledOnce();
  normal.dispose(); lab.dispose();
});

it('keeps the navigation scrollbar beside complete icons for an owner with every route', () => {
  const root = new UiRoot({ scale: 2 }); root.resize(1280, 736);
  root.mount(ui.workbenchNavigation(Array.from({length: 22}, (_, index) => ({id: String(index), label: `Route ${index}`, icon: {cf: 'book' as const}, onPress: vi.fn()}))));
  root.arrange();
  const scroll = root.entries().find(({element}) => element.kind === 'scroll-area')!.element;
  const icon = root.entries().find(({element}) => element.id === 'workbench.nav.0')!.element;
  const thumb = uiScrollThumb(scroll, 'y')!;
  expect(thumb).not.toBeNull();
  expect(icon.clip).toEqual(icon.rect);
  expect(thumb.track.x).toBeGreaterThanOrEqual(icon.rect.x + icon.rect.width);
  root.dispose();
});

it('respects editor-specific drawer bounds for fixed icon grids',()=>{
 const changed=vi.fn();const root=new UiRoot({scale:1});root.resize(1000,700);
 const shell=ui.workbench({navigation:[],workspace:ui.text('Map'),controls:{title:'Palette',content:ui.text('Objects'),width:uiFixed(90),minWidth:uiFixed(118),maxWidth:uiFixed(360)},onDrawerResize:changed});
 root.mount(shell);root.arrange();
 const handle=root.entries().find(e=>e.element.id==='workbench.controls.resize')!.element;
 root.focus.set(handle);root.key({key:'Home'});root.arrange();expect(changed).toHaveBeenLastCalledWith('controls',uiFixed(118));
 root.key({key:'End'});root.arrange();expect(changed).toHaveBeenLastCalledWith('controls',uiFixed(360));root.dispose();
});
