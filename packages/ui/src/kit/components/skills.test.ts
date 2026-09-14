import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiSkills} from './skills.js';
import type {SkillTreeModel} from '../../skill-tree-ui.js';
it('guards learning and reset from authoritative points and balance while retaining graph state',()=>{
 const root=new UiRoot({scale:1});root.resize(800,600);const purchase=vi.fn(),reset=vi.fn();
 const model:SkillTreeModel={tracks:[{track:'explorer',experience:0n,spentPoints:0,bonusPoints:1,respecCount:0}],ranks:[],balanceBronze:0n};
 const frame=uiSkills({model,purchase,reset});root.mount(frame);root.arrange();
 const find=(id:string)=>root.entries().map(e=>e.element).find(e=>e.id===id)!;
 const press=(label:string)=>{const node=root.entries().map(e=>e.element).find(e=>e.props['label']===label)!;root.focus.set(node,'keyboard');root.key({key:'Enter'});};
 const cell=find('skill:trailblazer');root.focus.set(cell,'keyboard');root.key({key:'Enter'});root.arrange();press('LEARN 1 RANK');expect(purchase).toHaveBeenCalledWith('trailblazer');
 const graph=root.entries().map(e=>e.element).find(e=>e.kind==='skill-graph')!;root.focus.set(graph,'keyboard');root.key({key:'ArrowRight'});root.arrange();const pan=graph.props['pan'];
 const spent:SkillTreeModel={...model,tracks:[{...model.tracks[0]!,spentPoints:1,respecCount:1}],ranks:[{nodeId:'trailblazer',rank:1}]};frame.updateSkills(spent);root.arrange();expect(graph.props['pan']).toEqual(pan);expect(root.entries().map(e=>e.element).find(e=>e.props['label']==='LEARN 1 RANK')!.disabled).toBe(true);
 let resetButton=root.entries().map(e=>e.element).find(e=>String(e.props['label']).startsWith('RESET TREE'))!;expect(resetButton.disabled).toBe(true);
 frame.updateSkills({...spent,balanceBronze:1000000n});root.arrange();resetButton=root.entries().map(e=>e.element).find(e=>String(e.props['label']).startsWith('RESET TREE'))!;expect(resetButton.disabled).toBe(false);root.focus.set(resetButton,'keyboard');root.key({key:'Enter'});expect(reset).toHaveBeenCalledWith('explorer');
 frame.selectTrack('combat');root.arrange();expect(frame.selectedTrack).toBe('combat');expect(find('skill:combat_root')).toBeDefined();root.dispose();
});

it('distinguishes owned, available, locked and placeholder nodes without blocking inspection', () => {
 const root = new UiRoot({ scale: 1 }); root.resize(800, 600);
 const model: SkillTreeModel = { tracks: [{ track: 'explorer', experience: 0n, spentPoints: 0, bonusPoints: 1, respecCount: 0 }], ranks: [], balanceBronze: 0n };
 const purchase = vi.fn(); const frame = uiSkills({ model, purchase, reset: vi.fn() }); root.mount(frame); root.arrange();
 const cells = () => root.entries().map(entry => entry.element).filter(element => element.id.startsWith('skill:'));
 expect(new Set(cells().map(cell => cell.props['skillState']))).toEqual(new Set(['owned', 'available', 'locked', 'placeholder']));
 const trail = cells().find(cell => cell.id === 'skill:measured_stride')!;
 expect(trail.props['tone']).toBe('warning');
 for (const cell of cells().filter(cell => ['locked', 'placeholder'].includes(String(cell.props['skillState'])))) {
  expect(cell.disabled).toBe(false); expect(root.focus.set(cell)).toBe(true); root.key({ key: 'Enter' });
  const learn = root.entries().find(entry => entry.element.props['label'] === 'LEARN 1 RANK')!.element;
  if (cell.props['skillState'] === 'locked') expect(learn.disabled).toBe(true);
 }
 expect(purchase).not.toHaveBeenCalled();
 frame.updateSkills({ ...model, tracks: [{ ...model.tracks[0]!, bonusPoints: 0 }] }); root.arrange();
 expect(trail.props['skillState']).toBe('locked'); expect(trail.props['tone']).toBe('neutral');
 frame.updateSkills({ ...model, ranks: [{ nodeId: 'measured_stride', rank: 1 }] }); root.arrange();
 expect(trail.props['skillState']).toBe('owned'); expect(trail.props['tone']).toBe('success');
 root.dispose();
});
