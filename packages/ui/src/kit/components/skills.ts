import { BOOTSTRAP_PROGRESSION, SKILL_TRACKS, availableSkillPoints, skillExperienceForLevel, skillLevelForExperience, skillNodeIsImplemented, skillPurchaseRejectionForNodes, skillRespecCostBronze, type SkillTrack } from '@orchard/sim';
import type { SkillTreeModel, SkillTreeCallbacks } from '../../skill-tree-ui.js';
import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { scrollUiElement } from '../layout/scroll.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiButton, type UiButtonOptions } from './button.js';
import { uiText } from './text.js';
import { uiMeter } from './meter.js';
import { uiSkillGraph, type UiSkillGraphElement } from './skill-graph.js';

export interface UiSkillsOptions extends SkillTreeCallbacks {
  readonly model: SkillTreeModel; readonly track?: SkillTrack; readonly artwork?: Readonly<Record<string, LoadedAsset>>;
  readonly onNavigate?: (page: 'character' | 'skills' | 'statistics') => void; readonly onClose?: () => void; readonly layout?: UiStyle;
}
export interface UiSkillsElement extends UiElement {
  readonly selectedTrack: SkillTrack;
  selectTrack(track: SkillTrack): void;
  updateSkills(model: SkillTreeModel): void;
  focusSkills(): void;
}

/** A captured action belongs to the selection and command state that began it. */
function skillButton(options: UiButtonOptions, commandKey?: () => string): UiElement {
  const button = uiButton(options); let started: string | undefined;
  return new UiElement({ ...button.hooks, children: [...button.children],
    onPointer(event, element) {
      if (event.type === 'down') started = commandKey?.();
      const stale = event.type === 'up' && commandKey && started !== commandKey();
      const handled = button.hooks.onPointer?.(stale ? { ...event, type: 'cancel' } : event, element) ?? false;
      if (event.type === 'up' || event.type === 'cancel') started = undefined;
      return handled;
    },
    onKey(event, element) {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) return true;
      return button.hooks.onKey?.(event, element) ?? false;
    },
  });
}
const modelKey = (model: SkillTreeModel) => JSON.stringify(model, (_key, value) => typeof value === 'bigint' ? value.toString() : value);

export function uiSkills(options: UiSkillsOptions): UiSkillsElement {
  let model = options.model, track = options.track ?? 'explorer', selected: string | null = null;
  let catalogKey = JSON.stringify(model.nodes), currentModelKey = '';
  let graph: UiSkillGraphElement;
  const progress = () => model.tracks.find(entry => entry.track === track) ?? { track, experience: 0n, spentPoints: 0, bonusPoints: 0, respecCount: 0 };
  const ranks = () => Object.fromEntries(model.ranks.map(entry => [entry.nodeId, entry.rank]));
  const selectedNode = () => model.nodes.find(node => node.track === track && node.id === selected);
  const canLearn = () => selected !== null && skillPurchaseRejectionForNodes(model.nodes, selected, { ...progress(), ranks: ranks() }, model.progression) === null;
  const canReset = () => progress().spentPoints > 0 && model.balanceBronze >= skillRespecCostBronze(progress().respecCount, model.progression);
  const commandKey = () => `${track}:${selected}:${modelKey(model)}`;
  const heading = uiText('', { id: 'skills.summary', wrap: true }), xpLabel = uiText('', { id: 'skills.xp', wrap: true });
  const xp = uiMeter({ label: 'Skill experience', value: 0, tone: 'warning', variant: 'thin' });
  const title = uiText('', { role: 'header', wrap: true }), live = uiText('', { wrap: true });
  const rank = uiText('', { wrap: true }), gear = uiText('', { wrap: true }), description = uiText('', { wrap: true });
  const requirements = uiText('', { wrap: true }), rejection = uiText('', { wrap: true }), resetCost = uiText('', { wrap: true });
  const detail = uiFlex({ id: 'skills.detail', width: 'grow', gap: 4 }, [xpLabel, title, live, rank, gear, description, requirements, rejection]);
  const learn = skillButton({ id: 'skills.learn', label: 'LEARN 1 RANK', tone: 'success', size: 'sm', layout: { width: 'grow' }, onPress: () => { if (canLearn()) options.purchase(selected!); } }, commandKey);
  const reset = skillButton({ id: 'skills.reset', label: 'RESET TREE', tone: 'danger', size: 'sm', layout: { width: 'grow' }, onPress: () => { if (canReset()) options.reset(track); } }, commandKey);
  const priority = skillButton({ id: 'skills.priority', label: 'PRIORITIZE GEAR', ariaLabel: 'Prioritize equipment skill', size: 'sm', layout: { width: 'grow' }, onPress: () => { const node = selectedNode(); if (node?.gearBoostable) options.prioritize?.(node.id); } }, commandKey);
  const detailScroll = uiScrollArea({ id: 'skills.details', label: 'Skill details and actions', width: 'grow', height: 'grow', minWidth: uiFixed(156), grow: 1, gap: 4 }, [detail, priority, learn, resetCost, reset]).setProps({ touchScroll: true });
  const graphHost = uiFlex({ width: 'grow', height: 'grow' });
  const tabs = new Map<SkillTrack, UiElement>();
  const refresh = () => {
    const p = progress(), level = skillLevelForExperience(p.experience, model.progression), start = skillExperienceForLevel(level, model.progression), end = skillExperienceForLevel(level + 1, model.progression);
    const points = availableSkillPoints(p.experience, p.spentPoints, p.bonusPoints, model.progression);
    heading.setProps({ text: `${track.toUpperCase()} LEVEL ${level} · ${points} UNSPENT POINT${points === 1 ? '' : 'S'}` });
    const capped = level >= (model.progression ?? BOOTSTRAP_PROGRESSION).levelCap;
    xpLabel.setProps({ text: capped ? 'MAX LEVEL' : `${p.experience - start} / ${end - start} XP` });
    xp.setProps({ value: capped ? 1 : Number(p.experience - start) / Number(end > start ? end - start : 1n) });
    graph.updateRanks(ranks(), selected);
    const node = selectedNode();
    title.setProps({ text: node?.name.toUpperCase() ?? `${track.toUpperCase()} TREE` });
    live.setProps({ text: node ? skillNodeIsImplemented(node) ? 'LIVE IN GAME' : 'PLACEHOLDER — NO EFFECT YET' : 'Select a skill to inspect it.' });
    rank.setProps({ text: node ? node.root ? 'ROOT — ALWAYS OWNED' : `RANK ${ranks()[node.id] ?? 0}/${node.maxRank} · COST ${node.pointCost}` : '' });
    const equipment = model.equipmentSkills;
    gear.setProps({ text: node?.gearBoostable && equipment ? `${equipment.trained[node.id] ?? 0} TRAINED + ${equipment.bonuses[node.id] ?? 0} GEAR = ${equipment.effective[node.id] ?? 0} EFFECTIVE (MAX ${equipment.maximums[node.id] ?? node.maxRank})` : '' });
    description.setProps({ text: node?.description ?? 'Drag to pan; wheel or +/- to zoom. Focus the graph and use arrow keys to pan or Home to center. Tab selects a node to inspect.' });
    requirements.setProps({ text: node ? [node.requiresLevel ? `REQUIRES LEVEL ${node.requiresLevel}` : '', node.prerequisites?.length ? `REQUIRES: ${node.prerequisites.map(id => model.nodes.find(candidate => candidate.id === id)?.name ?? id).join(', ')}` : ''].filter(Boolean).join('\n') : '' });
    const reason = node && !node.root ? skillPurchaseRejectionForNodes(model.nodes, node.id, { ...p, ranks: ranks() }, model.progression) : null;
    rejection.setProps({ text: reason?.replaceAll('_', ' ').toUpperCase() ?? '' });
    for (const text of [rank, gear, requirements, rejection]) text.setStyle({ visible: text.label !== '' });
    priority.setProps({ label: model.skillPriority?.[0] === node?.id && node ? 'GEAR: FIRST' : 'PRIORITIZE GEAR' }).setDisabled(!node?.gearBoostable || !options.prioritize);
    const cost = skillRespecCostBronze(p.respecCount, model.progression);
    resetCost.setProps({ text: `RESET COST ${cost / 10000n}G ${cost % 10000n / 100n}S ${cost % 100n}C` });
    reset.setDisabled(!canReset()); learn.setProps({ label: node?.root ? 'ROOT OWNED' : 'LEARN 1 RANK' }).setDisabled(!canLearn());
    for (const [candidate, tab] of tabs) tab.setProps({ tone: candidate === track ? 'success' : 'neutral' });
  };
  const rebuildGraph = (preserveView: boolean) => {
    const previousView = preserveView ? graph?.view : undefined;
    graph?.dispose();
    graph = uiSkillGraph({ nodes: model.nodes.filter(node => node.track === track), ranks: ranks(), selected, view: previousView,
      canLearn: id => skillPurchaseRejectionForNodes(model.nodes, id, { ...progress(), ranks: ranks() }, model.progression) === null,
      artwork: options.artwork, onSelect: id => { selected = id; scrollUiElement(detailScroll, 0, 0); refresh(); } });
    graphHost.append(graph);
  };
  const selectTrack = (next: SkillTrack) => {
    track = next; selected = null; scrollUiElement(detailScroll, 0, 0); rebuildGraph(false); refresh(); graph.requestFocus();
  };
  for (const candidate of SKILL_TRACKS) tabs.set(candidate, skillButton({ id: `skills.track.${candidate}`, label: candidate.toUpperCase(), size: 'sm', layout: { width: 'grow' }, onPress: () => selectTrack(candidate) }));
  const toolbar = uiFlex({ direction: 'row', width: 'grow', gap: 2, shrink: 0 }, [
    skillButton({ id: 'skills.center', label: 'CENTER', size: 'sm', onPress: () => graph.center() }),
    skillButton({ id: 'skills.zoom-out', label: '-', ariaLabel: 'Zoom out', size: 'sm', onPress: () => graph.zoomBy(-.1) }),
    skillButton({ id: 'skills.zoom-in', label: '+', ariaLabel: 'Zoom in', size: 'sm', onPress: () => graph.zoomBy(.1) }),
  ]);
  const frame = uiFrame({ id: 'game.skills', blockInput: true, padding: 8, header: { title: 'SKILLS', closable: true, onClose: options.onClose }, layout: { width: 'grow', height: 'grow', ...options.layout, gap: 4 }, children: [
    uiFlex({ direction: 'row', width: 'grow', gap: 4, shrink: 0 }, (['character', 'skills', 'statistics'] as const).map(page => skillButton({ label: page.toUpperCase(), size: 'sm', tone: page === 'skills' ? 'primary' : 'neutral', onPress: () => options.onNavigate?.(page) }))),
    uiFlex({ direction: 'row', width: 'grow', gap: 4, shrink: 0 }, [...tabs.values()]),
    heading, xp,
    uiFlex({ direction: 'row', width: 'grow', height: 'grow', gap: 8 }, [uiFlex({ width: 'grow', height: 'grow', grow: 2, minWidth: uiFixed(100), gap: 4 }, [toolbar, graphHost]), detailScroll]),
  ] });
  const host = new UiElement({ id: 'game.skills.host', kind: 'skills-screen', children: [frame], style: { display: 'stack', width: 'grow', height: 'grow', zLayer: 'modal' }, props: { singlePointer: true },
    onKeyCapture(event) { if (event.key !== 'Escape') return false; if (!event.repeat) options.onClose?.(); return true; } });
  const updateSkills = (next: SkillTreeModel) => {
    const nextKey = modelKey(next); if (nextKey === currentModelKey) return;
    currentModelKey = nextKey; const nextCatalog = JSON.stringify(next.nodes); model = next;
    if (nextCatalog !== catalogKey) {
      catalogKey = nextCatalog; if (!selectedNode()) selected = null; rebuildGraph(true);
    }
    refresh();
  };
  rebuildGraph(false); refresh(); currentModelKey = modelKey(model);
  return Object.defineProperty(Object.assign(host, { selectTrack, updateSkills, focusSkills: () => { frame.setStyle({ visible: true }); graph.requestFocus(); } }), 'selectedTrack', { get: () => track }) as UiSkillsElement;
}
