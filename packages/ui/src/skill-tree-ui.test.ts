import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { BOOTSTRAP_PROGRESSION, SKILL_NODE_DEFINITIONS, skillNodesForTrack, type SkillNodeDefinition } from '@orchard/sim';
import { SkillTreeUi, type SkillTreeModel } from './skill-tree-ui.js';
import { uiTestArt, uiTestAsset } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import { UI_TEXT_METRICS } from './kit/tokens.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
const views: SkillTreeUi[] = [];
afterEach(() => { views.splice(0).forEach(view => view.dispose()); vi.unstubAllGlobals(); });
function model(): SkillTreeModel {
  return { nodes: SKILL_NODE_DEFINITIONS, tracks: [{ track: 'explorer', experience: 10000n, spentPoints: 0, bonusPoints: 1, respecCount: 0 }], ranks: [], balanceBronze: 100n };
}
const frame = (width: number, height: number) => ({ x: 6, y: 6, width: Math.min(680, width - 12), height: Math.min(390, height - 12) });
function fixture(width = 800, height = 500, initial = model()) {
  const purchase = vi.fn(), reset = vi.fn(), prioritize = vi.fn(), navigate = vi.fn(), close = vi.fn();
  const ui = new SkillTreeUi(art, { purchase, reset, prioritize }, { onNavigate: navigate, onClose: close,
    artwork: { measured_stride: uiTestAsset('icon_skill_measured_stride') } }); views.push(ui);
  ui.update(initial); ui.setBounds(frame(width, height), width, height); ui.focus();
  const node = (id: string) => { ui.root.arrange(); const found = ui.root.entries().find(entry => entry.element.id === id)?.element; expect(found, id).toBeDefined(); return found!; };
  const press = (id: string) => { expect(ui.root.focus.set(node(id)), id).toBe(true); ui.root.key({ key: 'Enter' }); ui.root.arrange(); };
  const point = (id: string) => { const element = node(id); ui.root.focus.set(element); ui.root.arrange(); return { x: element.clip.x + element.clip.width / 2, y: element.clip.y + element.clip.height / 2 }; };
  const paint = () => { vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) }); ui.draw(createCanvas(width, height).getContext('2d') as unknown as CanvasRenderingContext2D); };
  return { ui, node, press, point, paint, purchase, reset, prioritize, navigate, close };
}

describe('production retained skills adapter', () => {
  it('uses authored nodes and real requirements for release-only purchase, priority and reset', () => {
    const f = fixture(); f.press('skill:measured_stride'); const p = f.point('skills.learn');
    f.ui.root.pointer({ type: 'down', point: p, button: 0, pointerId: 1 }); expect(f.purchase).not.toHaveBeenCalled();
    f.ui.root.pointer({ type: 'up', point: p, button: 0, pointerId: 1 }); expect(f.purchase).toHaveBeenCalledExactlyOnceWith('measured_stride');
    f.press('skills.priority'); expect(f.prioritize).toHaveBeenCalledExactlyOnceWith('measured_stride');
    f.ui.root.key({ key: 'Enter', repeat: true }); expect(f.prioritize).toHaveBeenCalledOnce();
    expect(f.node('skills.reset').disabled).toBe(true);
    f.ui.update({ ...model(), tracks: [{ ...model().tracks[0]!, spentPoints: 1, respecCount: 1 }], ranks: [{ nodeId: 'measured_stride', rank: 1 }], skillPriority: ['measured_stride'] });
    expect(f.node('skills.priority').props['label']).toBe('GEAR: FIRST'); f.press('skills.reset'); expect(f.reset).toHaveBeenCalledExactlyOnceWith('explorer');
  });
  it('retains graph, selection, detail scroll and focus across equivalent catalog snapshots, values and resize', () => {
    const f = fixture(); f.press('skill:measured_stride'); const graph = f.node('skills.graph');
    f.ui.root.focus.set(graph); f.ui.root.key({ key: 'ArrowRight' }); f.ui.root.key({ key: '+' }); f.ui.root.arrange();
    const pan = graph.props['pan'], zoom = graph.props['zoom'];
    const details = f.node('skills.details'); scrollUiElement(details, 0, 20);
    f.ui.update({ ...model(), nodes: [...model().nodes], balanceBronze: 200n });
    f.ui.setBounds(frame(320, 180), 320, 180);
    expect(f.node('skills.graph')).toBe(graph); expect(f.ui.root.focus.current).toBe(graph); expect(graph.props['pan']).toEqual(pan); expect(graph.props['zoom']).toBe(zoom);
    expect(f.node('skill:measured_stride').props['selected']).toBe(true); expect(details.scroll.y).toBeGreaterThanOrEqual(0); expect(f.ui.root.scale).toBe(1);
  });
  it('deep-links tracks, navigates and reconnects without dispatching stale gestures', () => {
    const f = fixture(), root = f.ui.root; f.ui.selectTrack('farming'); expect(f.ui.selectedTrack).toBe('farming');
    expect(f.node('skill:farming_root')).toBeDefined(); f.ui.selectTrack('explorer'); f.press('skill:measured_stride');
    const p = f.point('skills.learn'); root.pointer({ type: 'down', point: p, button: 0, pointerId: 1 });
    f.ui.update(null); expect(f.ui.active).toBe(false); f.ui.update(model()); f.ui.setBounds(frame(800,500),800,500); f.ui.focus();
    root.pointer({ type: 'up', point: p, button: 0, pointerId: 1 }); expect(f.purchase).not.toHaveBeenCalled(); expect(f.ui.root).toBe(root);
    const stats = root.entries().find(entry => entry.element.label === 'STATISTICS')!.element; root.focus.set(stats); root.key({ key: 'Enter' }); expect(f.navigate).toHaveBeenCalledWith('statistics'); root.key({ key: 'Escape' }); expect(f.close).toHaveBeenCalledOnce();
  });
  it('never retargets an action release after selection, authority or catalog changes', () => {
    const f = fixture(); f.press('skill:measured_stride'); const p = f.point('skills.learn');
    f.ui.root.pointer({ type: 'down', point: p, button: 0, pointerId: 1 }); f.press('skill:trailblazer');
    f.ui.root.pointer({ type: 'up', point: p, button: 0, pointerId: 1 }); expect(f.purchase).not.toHaveBeenCalled();
    f.press('skill:measured_stride'); const next = f.point('skills.learn'); f.ui.root.pointer({ type: 'down', point: next, button: 0, pointerId: 2 });
    f.ui.update({ ...model(), balanceBronze: 99n }); f.ui.root.pointer({ type: 'up', point: next, button: 0, pointerId: 2 }); expect(f.purchase).not.toHaveBeenCalled();
    f.ui.root.pointer({ type: 'down', point: next, button: 0, pointerId: 3 }); f.ui.update({ ...model(), nodes: [] });
    f.ui.root.pointer({ type: 'up', point: next, button: 0, pointerId: 3 }); expect(f.purchase).not.toHaveBeenCalled();
  });
  it('shows equipment contribution, authored progression, exact bigint reset costs and requirements', () => {
    const f = fixture(); f.press('skill:measured_stride');
    const cost = 9007199254740993n;
    f.ui.update({ ...model(), progression: { ...BOOTSTRAP_PROGRESSION, levelCap: 3, xpCurve: { scale: 10, exponent: 1 }, respecCostsBronze: [Number(cost - 1n)] },
      tracks: [{ ...model().tracks[0]!, experience: cost, spentPoints: 1 }], balanceBronze: cost - 2n,
      equipmentSkills: { trained: { measured_stride: 1 }, bonuses: { measured_stride: 2 }, effective: { measured_stride: 3 }, maximums: { measured_stride: 5 }, grantedRanks: 2, overcapRanks: 0, inactive: [] } });
    const text = f.ui.root.entries().map(entry => entry.element.label).join('\n');
    expect(text).toContain('1 TRAINED + 2 GEAR = 3 EFFECTIVE (MAX 5)'); expect(text).toContain('MAX LEVEL'); expect(text).toContain('RESET COST 900719925474G 9S 92C'); expect(f.node('skills.reset').disabled).toBe(true);
    f.press('skill:cliff_climber'); expect(f.ui.root.entries().some(entry => entry.element.label.includes('REQUIRES LEVEL'))).toBe(true);
  });
  it('does not purchase inaccessible authored nodes and does not fabricate success after rejection', () => {
    const source = model(); const node: SkillNodeDefinition = { ...source.nodes.find(node => node.id === 'measured_stride')!, id: 'authored', requiresLevel: 50, prerequisites: ['missing'] };
    const f = fixture(800,500,{ ...source, nodes: [node] }); f.press('skill:authored'); expect(f.node('skills.learn').disabled).toBe(true); expect(f.purchase).not.toHaveBeenCalled();
    f.ui.update(model()); f.press('skill:measured_stride'); f.press('skills.learn');
    f.ui.update(model()); expect(f.node('skill:measured_stride').label).toContain('rank 0/3'); expect(f.purchase).toHaveBeenCalledOnce();
  });
  it('keeps every compact action reachable and reveals distant authored nodes for keyboard input', () => {
    const f = fixture(320,180); f.press('skill:measured_stride');
    const graph = f.node('skills.graph'); expect(graph.clip.width).toBeGreaterThanOrEqual(80); expect(graph.clip.height).toBeGreaterThanOrEqual(31);
    for (const id of ['skills.learn','skills.priority']) {
      const action = f.node(id); f.ui.root.focus.set(action); f.ui.root.arrange();
      expect(action.clip).toEqual(action.rect); expect(action.rect.y + action.rect.height).toBeLessThanOrEqual(180);
    }
    f.ui.selectTrack('farming');
    const distant = f.node('skill:master_forester'); f.ui.root.focus.set(distant); f.ui.root.arrange(); expect(distant.clip).toEqual(distant.rect);
    expect(f.node('skills.details').scroll.maxY).toBeGreaterThan(0);
  });
  it('keeps primary graph pan ownership when a second touch targets a detail action', () => {
    const f=fixture(320,180); f.press('skill:measured_stride'); const cell=f.node('skill:measured_stride');
    f.ui.root.focus.set(cell); f.ui.root.arrange(); const point={x:cell.clip.x+cell.clip.width/2,y:cell.clip.y+cell.clip.height/2};
    f.ui.root.pointer({type:'down',point,pointerId:1,button:0,pointerType:'touch',isPrimary:true}); const focused=f.ui.root.focus.current;
    const details=f.node('skills.details'), other={x:details.rect.x+5,y:details.rect.y+5};
    f.ui.root.pointer({type:'down',point:other,pointerId:2,button:0,pointerType:'touch',isPrimary:false}); expect(f.ui.root.focus.current).toBe(focused); expect(details.scroll.y).toBe(0);
    f.ui.root.pointer({type:'move',point:{x:point.x+12,y:point.y+9},pointerId:1,button:0,pointerType:'touch',isPrimary:true});
    f.ui.root.pointer({type:'up',point:{x:point.x+12,y:point.y+9},pointerId:1,button:0,pointerType:'touch',isPrimary:true});
    f.ui.root.pointer({type:'up',point:other,pointerId:2,button:0,pointerType:'touch',isPrimary:false}); expect(f.purchase).not.toHaveBeenCalled(); expect(f.prioritize).not.toHaveBeenCalled();
  });
  it('touch-scrolls details before action release and preserves pointer cancellation', () => {
    const f=fixture(320,180); f.press('skill:measured_stride'); const point=f.point('skills.learn'),details=f.node('skills.details'),before=details.scroll.y;
    f.ui.root.pointer({type:'down',point,pointerId:1,button:0,pointerType:'touch',isPrimary:true});
    f.ui.root.pointer({type:'move',point:{x:point.x,y:point.y-12},pointerId:1,button:0,pointerType:'touch',isPrimary:true});
    f.ui.root.pointer({type:'up',point:{x:point.x,y:point.y-12},pointerId:1,button:0,pointerType:'touch',isPrimary:true});
    expect(details.scroll.y).toBeGreaterThan(before); expect(f.purchase).not.toHaveBeenCalled();
    const next=f.point('skills.learn'); f.ui.root.pointer({type:'down',point:next,pointerId:2,button:0});f.ui.root.pointer({type:'cancel',point:next,pointerId:2,button:0});expect(f.purchase).not.toHaveBeenCalled();
    f.ui.root.pointer({type:'down',point:next,pointerId:2,button:0});f.ui.root.pointer({type:'up',point:next,pointerId:2,button:0});expect(f.purchase).toHaveBeenCalledExactlyOnceWith('measured_stride');
  });
  it('restores a surviving focused node after catalog rebuild while suppressing its captured old release', () => {
    const f=fixture(); f.press('skill:measured_stride'); const old=f.node('skill:measured_stride');
    f.ui.root.focus.set(old); f.ui.root.arrange(); const point={x:old.rect.x+14,y:old.rect.y+15};
    f.ui.root.pointer({type:'down',point,pointerId:1,button:0});
    f.ui.update({...model(),nodes:model().nodes.map(node=>node.id==='measured_stride'?{...node,description:'Updated authored detail'}:node)});
    const replacement=f.node('skill:measured_stride'); expect(replacement).not.toBe(old); expect(f.ui.root.focus.current).toBe(replacement);
    f.ui.root.pointer({type:'up',point,pointerId:1,button:0});expect(replacement.props['selected']).toBe(true);expect(f.purchase).not.toHaveBeenCalled();
    f.ui.update({...model(),nodes:[]});expect(f.ui.root.focus.current).toBe(f.node('skills.graph'));
  });
  it.each([1,2,3])('renders the real shared host at scale%s with fractional DPR and long details', scale => {
    for (const [width,height] of [[320,180],[800,500]]) {
      const f = fixture(width!,height!); f.ui.update({ ...model(), nodes: model().nodes.map(node => node.id === 'measured_stride' ? { ...node, name: 'An authored skill name '.repeat(3), description: 'A long authored detail '.repeat(30) } : node) }); f.press('skill:measured_stride');
      vi.stubGlobal('document', { createElement: () => createCanvas(1,1) }); const canvas = createCanvas(Math.round(width!*scale*1.25),Math.round(height!*scale*1.25)), context=canvas.getContext('2d'); context.scale(scale*1.25,scale*1.25); f.ui.draw(context as unknown as CanvasRenderingContext2D);
      expect(f.node('skills.details').scroll.maxY).toBeGreaterThan(0);
      for (const {element} of f.ui.root.entries()) if(element.kind==='text') expect(UI_TEXT_METRICS[element.props['role'] as keyof typeof UI_TEXT_METRICS].font).toBe('body');
      f.ui.root.focus.set(f.node('skills.learn')); f.ui.root.arrange(); expect(f.node('skills.learn').clip).toEqual(f.node('skills.learn').rect);
    }
  });
  it('retains authored farming coordinates without overlapping minimum-zoom cells', () => {
    const nodes=skillNodesForTrack('farming'); for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)expect(Math.abs(nodes[i]!.position[0]-nodes[j]!.position[0])*.35>=28||Math.abs(nodes[i]!.position[1]-nodes[j]!.position[1])*.35>=31).toBe(true);
  });
});
