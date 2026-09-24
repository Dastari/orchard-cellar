import { SKILL_NODE_DEFINITIONS } from '@orchard/sim';
import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiSkills} from './skills.js';
import type {SkillTreeModel} from '../../skill-tree-ui.js';
it('guards learning and reset from authoritative points and balance while retaining graph state',()=>{
 const root=new UiRoot({scale:1});root.resize(800,600);const purchase=vi.fn(),reset=vi.fn();
 const model:SkillTreeModel={nodes:SKILL_NODE_DEFINITIONS,tracks:[{track:'explorer',experience:0n,spentPoints:0,bonusPoints:1,respecCount:0}],ranks:[],balanceBronze:0n};
 const frame=uiSkills({model,purchase,reset});root.mount(frame);root.arrange();
 const find=(id:string)=>root.entries().map(e=>e.element).find(e=>e.id===id)!;
 const press=(label:string)=>{const node=root.entries().map(e=>e.element).find(e=>e.props['label']===label)!;root.focus.set(node,'keyboard');root.key({key:'Enter'});};
 const cell=find('skill:trailblazer');root.focus.set(cell,'keyboard');root.key({key:'Enter'});root.arrange();press('Learn');expect(purchase).toHaveBeenCalledWith('trailblazer');
 const graph=root.entries().map(e=>e.element).find(e=>e.kind==='skill-graph')!;root.focus.set(graph,'keyboard');root.key({key:'ArrowRight'});root.arrange();const pan=graph.props['pan'];
 const spent:SkillTreeModel={...model,tracks:[{...model.tracks[0]!,spentPoints:1,respecCount:1}],ranks:[{nodeId:'trailblazer',rank:1}]};frame.updateSkills(spent);root.arrange();expect(graph.props['pan']).toEqual(pan);expect(root.entries().map(e=>e.element).find(e=>e.id==='skills.learn')!.disabled).toBe(true);
 let resetButton=root.entries().map(e=>e.element).find(e=>e.id==='skills.reset')!;expect(resetButton.disabled).toBe(true);
 frame.updateSkills({...spent,balanceBronze:1000000n});root.arrange();resetButton=root.entries().map(e=>e.element).find(e=>e.id==='skills.reset')!;expect(resetButton.disabled).toBe(false);root.focus.set(resetButton,'keyboard');root.key({key:'Enter'});expect(reset).toHaveBeenCalledWith('explorer');
 frame.selectTrack('combat');root.arrange();expect(frame.selectedTrack).toBe('combat');expect(find('skill:combat_root')).toBeDefined();root.dispose();
});

it('distinguishes owned, available, locked and placeholder nodes without blocking inspection', () => {
 const root = new UiRoot({ scale: 1 }); root.resize(800, 600);
 const model: SkillTreeModel = { nodes:SKILL_NODE_DEFINITIONS, tracks: [{ track: 'explorer', experience: 0n, spentPoints: 0, bonusPoints: 1, respecCount: 0 }], ranks: [], balanceBronze: 0n };
 const purchase = vi.fn(); const frame = uiSkills({ model, purchase, reset: vi.fn() }); root.mount(frame); root.arrange();
 const cells = () => root.entries().map(entry => entry.element).filter(element => element.id.startsWith('skill:'));
 expect(new Set(cells().map(cell => cell.props['skillState']))).toEqual(new Set(['owned', 'available', 'locked', 'placeholder']));
 const trail = cells().find(cell => cell.id === 'skill:measured_stride')!;
 expect(trail.props['tone']).toBe('warning');
 for (const cell of cells().filter(cell => ['locked', 'placeholder'].includes(String(cell.props['skillState'])))) {
  expect(cell.disabled).toBe(false); expect(root.focus.set(cell)).toBe(true); root.key({ key: 'Enter' });
  const learn = root.entries().find(entry => entry.element.id === 'skills.learn')!.element;
  if (cell.props['skillState'] === 'locked') expect(learn.disabled).toBe(true);
 }
 expect(purchase).not.toHaveBeenCalled();
 frame.updateSkills({ ...model, tracks: [{ ...model.tracks[0]!, bonusPoints: 0 }] }); root.arrange();
 expect(trail.props['skillState']).toBe('locked'); expect(trail.props['tone']).toBe('neutral');
 frame.updateSkills({ ...model, ranks: [{ nodeId: 'measured_stride', rank: 1 }] }); root.arrange();
 expect(trail.props['skillState']).toBe('owned'); expect(trail.props['tone']).toBe('success');
 root.dispose();
});

it('uses the supplied skill catalog and refreshes it when authored nodes change', () => {
 const root = new UiRoot({ scale: 1 }); root.resize(800, 600);
 const authored = {...SKILL_NODE_DEFINITIONS.find(node => node.id === 'trailblazer')!, id: 'authored_trail', connects: ['explorer_root'], prerequisites: []};
 const model: SkillTreeModel = { nodes: [SKILL_NODE_DEFINITIONS.find(node => node.id === 'explorer_root')!,authored], tracks: [{track:'explorer',experience:0n,spentPoints:0,bonusPoints:1,respecCount:0}], ranks: [], balanceBronze: 0n };
 const purchase = vi.fn(); const frame = uiSkills({model,purchase,reset:vi.fn()}); root.mount(frame); root.arrange();
 const cells = () => root.entries().map(entry => entry.element).filter(node => node.id.startsWith('skill:'));
 expect(cells().map(node => node.id)).toEqual(['skill:explorer_root','skill:authored_trail']);
 root.focus.set(cells().find(node => node.id === 'skill:authored_trail')!, 'keyboard'); root.key({key:'Enter'}); root.arrange();
 const learn = root.entries().find(entry => entry.element.id === 'skills.learn')!.element;
 expect(learn.disabled).toBe(false); root.focus.set(learn, 'keyboard'); root.key({key:'Enter'});
 expect(purchase).toHaveBeenCalledWith('authored_trail');
 frame.updateSkills({...model,nodes:[]}); root.arrange(); expect(cells()).toEqual([]);
 root.dispose();
});

it('uses authored level caps, XP thresholds and respec costs after content changes', async () => {
 const {BOOTSTRAP_PROGRESSION}=await import('@orchard/sim');
 const root=new UiRoot({scale:1});root.resize(800,600);
 const progression={...BOOTSTRAP_PROGRESSION,levelCap:3,xpCurve:{scale:10,exponent:1},respecCostsBronze:[7]};
 const model:SkillTreeModel={nodes:SKILL_NODE_DEFINITIONS,progression,tracks:[{track:'explorer',experience:30n,spentPoints:1,bonusPoints:0,respecCount:0}],ranks:[],balanceBronze:6n};
 const frame=uiSkills({model,purchase:vi.fn(),reset:vi.fn()});root.mount(frame);root.arrange();
 const nodes=()=>root.entries().map(entry=>entry.element);
 expect(nodes().some(node=>node.label==='EXPLORER LEVEL 3 · 2 UNSPENT POINTS')).toBe(true);
 expect(nodes().some(node=>node.label==='MAX LEVEL')).toBe(true);
 expect(nodes().some(node=>node.label==='RESET COST 0G 0S 7C')).toBe(true);
 expect(nodes().find(node=>node.id==='skills.reset')?.disabled).toBe(true);
 frame.updateSkills({...model,balanceBronze:7n});root.arrange();
 expect(nodes().find(node=>node.id==='skills.reset')?.disabled).toBe(false);
 root.dispose();
});
