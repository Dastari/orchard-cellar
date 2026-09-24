import {expect,it,vi} from 'vitest';
import {skillNodesForTrack} from '@orchard/sim';
import {UiRoot} from '../runtime/root.js';
import {uiSkillGraph} from './skill-graph.js';
it('uses arranged skill cells for keyboard selection, pan, zoom and centering',()=>{
 const root=new UiRoot({scale:1});root.resize(640,400);const select=vi.fn(),graph=uiSkillGraph({nodes:skillNodesForTrack('explorer'),ranks:{},onSelect:select});root.mount(graph);root.arrange();
 const cell=graph.children.find(n=>n.clip.width===n.rect.width&&n.clip.height===n.rect.height)!;expect(cell).toBeDefined();root.focus.set(cell,'keyboard');root.key({key:'Enter'});expect(select).toHaveBeenCalledWith(cell.id.slice(6));expect(cell.props['selected']).toBe(true);
 const original={...cell.rect};root.focus.set(graph,'keyboard');root.key({key:'ArrowRight'});root.arrange();expect(cell.rect.x).toBe(original.x+20);
 const zoom=Number(graph.props['zoom']);root.wheel({point:{x:1,y:1},deltaX:0,deltaY:-1});root.arrange();expect(Number(graph.props['zoom'])).toBeGreaterThan(zoom);
 graph.center();root.arrange();expect(cell.rect).toEqual(original);root.dispose();
});

it('pans from a node on primary touch without selecting it, cancels cleanly and accepts a fresh tap', () => {
 const root=new UiRoot({scale:1});root.resize(640,400);const select=vi.fn(),graph=uiSkillGraph({nodes:skillNodesForTrack('explorer'),ranks:{},onSelect:select});root.mount(graph);root.arrange();
 const cell=graph.children.find(node=>node.clip.width===node.rect.width&&node.clip.height===node.rect.height)!;
 const point={x:cell.rect.x+14,y:cell.rect.y+15},move={x:point.x+18,y:point.y+12};
 root.pointer({type:'down',point,pointerId:1,button:0,pointerType:'touch',isPrimary:true});const focused=root.focus.current;
 root.pointer({type:'down',point:{x:point.x+40,y:point.y},pointerId:2,button:0,pointerType:'touch',isPrimary:false});expect(root.focus.current).toBe(focused);
 root.pointer({type:'move',point:move,pointerId:1,button:0,pointerType:'touch',isPrimary:true});root.arrange();expect(graph.props['pan']).toEqual({x:18,y:12});
 root.pointer({type:'up',point:move,pointerId:1,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'up',point,pointerId:2,button:0,pointerType:'touch',isPrimary:false});expect(select).not.toHaveBeenCalled();
 const next={x:cell.rect.x+14,y:cell.rect.y+15};root.pointer({type:'down',point:next,pointerId:3,button:0,pointerType:'touch',isPrimary:true});root.input.cancelPointers();root.pointer({type:'up',point:next,pointerId:3,button:0,pointerType:'touch',isPrimary:true});expect(select).not.toHaveBeenCalled();
 root.pointer({type:'down',point:next,pointerId:3,button:0,pointerType:'touch',isPrimary:true});root.pointer({type:'up',point:next,pointerId:3,button:0,pointerType:'touch',isPrimary:true});expect(select).toHaveBeenCalledExactlyOnceWith(cell.id.slice(6));root.dispose();
});

it('bounds zoom, centers through the keyboard and preserves viewport state across authored rebuilds',()=>{
 const root=new UiRoot({scale:1});root.resize(640,400);const options={nodes:skillNodesForTrack('explorer'),ranks:{},onSelect:vi.fn()};let graph=uiSkillGraph(options);root.mount(graph);root.arrange();
 for(let i=0;i<20;i++)graph.zoomBy(1);root.arrange();expect(graph.view.zoom).toBe(1.4);for(let i=0;i<20;i++)graph.zoomBy(-1);root.arrange();expect(graph.view.zoom).toBe(.35);
 root.focus.set(graph);root.key({key:'ArrowDown'});root.arrange();const view=graph.view;graph.dispose();graph=uiSkillGraph({...options,view});root.mount(graph);root.arrange();expect(graph.view).toEqual(view);
 root.focus.set(graph);root.key({key:'Home'});root.arrange();expect(graph.view.pan).toEqual({x:0,y:0});root.dispose();
});
