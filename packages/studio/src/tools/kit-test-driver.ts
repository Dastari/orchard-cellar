import { UiRoot, scrollUiElement, type UiElement, type UiButtonModifiers } from '@orchard/ui/studio';
import type { StudioCanvasToolSurface } from '../shell/canvas-tool.js';

/** Inspect actual retained controls, including the currently mounted virtual rows. */
export function kitElements(surface: StudioCanvasToolSurface): UiElement[] {
  const visit = (element: UiElement): UiElement[] => [element, ...element.children.flatMap(visit)];
  return Object.values(surface.kit ?? {}).flatMap(element => element ? visit(element) : []);
}
export function kitElement(surface: StudioCanvasToolSurface, id: string): UiElement | undefined {
  return kitElements(surface).find(element => element.id === id);
}
function drive(surface: StudioCanvasToolSurface, id: string, keys: readonly string[], modifiers: UiButtonModifiers): boolean {
  const virtual=kitElements(surface).find(node=>Array.isArray(node.props['items'])&&(node.props['items'] as {id?:string}[]).some(item=>item.id===id));
  const element=kitElement(surface,id)??virtual;
  if(!element)throw new Error(`Missing retained control ${id}`);
  let tree=element, row:UiElement|undefined;
  while(tree.parent){if(tree.kind==='list-row')row=tree;tree=tree.parent;}
  const list=row?.parent?.parent??virtual, index=row?Number(row.props['index']):virtual?(virtual.props['items'] as {id?:string}[]).findIndex(item=>item.id===id):0, height=row?.style.height??virtual?.children[0]?.children[0]?.style.height;
  const rowHeight=typeof height==='object'&&height.mode==='fixed'?height.size:0;
  const root=new UiRoot({scale:1});root.resize(280,620);root.mount(tree);root.arrange();
  try {
    // Bring an offscreen action into its virtual window before focusing it.
    if(list&&rowHeight){scrollUiElement(list,0,index*rowHeight);root.arrange();}
    const target=root.entries().find(entry=>entry.element.id===id)?.element;
    if(!target)throw new Error(`Control ${id} did not mount after scrolling`);
    root.focus.set(target);
    let handled=false;for(const key of keys)handled=root.key({key,...modifiers});return handled;
  } finally {root.unmount(tree);root.dispose();}
}
export function pressKit(surface: StudioCanvasToolSurface, id: string, modifiers: UiButtonModifiers = {}): void {
  drive(surface,id,['Enter'],modifiers);
}
export function chooseKit(surface: StudioCanvasToolSurface, id: string, label: string): void {
  drive(surface,id,[...label,'Enter'],{});
}
export function keyKit(surface: StudioCanvasToolSurface, id: string, key: string, modifiers: UiButtonModifiers = {}): boolean {
  return drive(surface,id,[key],modifiers);
}
