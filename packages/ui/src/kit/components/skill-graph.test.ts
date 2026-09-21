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
