import { BOOTSTRAP_PROGRESSION, SKILL_TRACKS, availableSkillPoints, skillExperienceForLevel, skillLevelForExperience, skillNodeIsImplemented, skillPurchaseRejectionForNodes, skillRespecCostBronze, type SkillTrack } from '@orchard/sim';
import type { SkillTreeModel, SkillTreeCallbacks } from '../../skill-tree-ui.js';
import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { scrollUiElement } from '../layout/scroll.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiButton, type UiButtonOptions } from './button.js';
import { uiText } from './text.js';
import { drawPixelText, measurePixelText } from '../../pixel-ui.js';
import { uiSlot } from './inventory.js';
import { uiGlyphButton } from './window.js';
import { uiGameBook, uiLiveBookBar, uiPageLabel, uiPageRow, type UiGameBookChapter } from './character-book.js';
import { uiSkillGraph, type UiSkillGraphElement } from './skill-graph.js';

export interface UiSkillsOptions extends SkillTreeCallbacks {
  readonly onKey?: (key: string, repeat: boolean) => boolean;
  readonly model: SkillTreeModel; readonly track?: SkillTrack; readonly artwork?: Readonly<Record<string, LoadedAsset>>;
  readonly onNavigate?: (chapter: UiGameBookChapter) => void; readonly onClose?: () => void; readonly layout?: UiStyle;
  /** Leaf size of the book spread (see uiGameBookPage). */
  readonly page?: { readonly width: number; readonly height: number };
}
export interface UiSkillsElement extends UiElement {
  readonly selectedTrack: SkillTrack;
  selectTrack(track: SkillTrack): void;
  updateSkills(model: SkillTreeModel): void;
  focusSkills(): void;
  setPage(page: { readonly width: number; readonly height: number }): void;
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
  const trackName = (candidate: SkillTrack) => candidate[0]!.toUpperCase() + candidate.slice(1);
  const level = (candidate: SkillTrack) => skillLevelForExperience(model.tracks.find(entry => entry.track === candidate)?.experience ?? 0n, model.progression);
  const points = () => { const p = progress(); return availableSkillPoints(p.experience, p.spentPoints, p.bonusPoints, model.progression); };
  const capped = () => level(track) >= (model.progression ?? BOOTSTRAP_PROGRESSION).levelCap;
  const xpSpan = () => { const p = progress(), current = level(track), start = skillExperienceForLevel(current, model.progression), end = skillExperienceForLevel(current + 1, model.progression); return { value: p.experience - start, span: end > start ? end - start : 1n }; };
  // The left leaf's heading: the open track and its level and unspent points; its label is the summary line.
  const heading = new UiElement({ id: 'skills.summary', kind: 'page-heading', label: '', style: { height: uiFixed(30), shrink: 0, alignSelf: 'stretch' },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, name = trackName(track), count = points(), caption = `Lv ${level(track)}, ${count} point${count === 1 ? '' : 's'}`;
      drawPixelText(context, art.pixel, name, r.x + Math.floor((r.width - measurePixelText(name, 1, art.pixel.headerFont)) / 2), r.y, { font: 'header', color: '#3f2832' });
      drawPixelText(context, art.pixel, caption, r.x + Math.floor((r.width - measurePixelText(caption, 1, art.pixel.font)) / 2), r.y + 17, { color: '#9e5f45' });
      context.fillStyle = '#e4a672'; context.fillRect(r.x + 8, r.y + r.height - 2, r.width - 16, 1);
    } });
  const xp = uiLiveBookBar({ id: 'skills.xp', colour: 'gold', label: () => capped() ? 'MAX LEVEL' : `${xpSpan().value} / ${xpSpan().span} XP`, right: () => `Lv ${level(track)}`,
    fraction: () => capped() ? 1 : Number(xpSpan().value) / Number(xpSpan().span) });
  const title = uiText('', { role: 'label', wrap: true }), live = uiText('', { wrap: true });
  const rank = uiText('', { wrap: true }), gear = uiText('', { wrap: true }), description = uiText('', { wrap: true });
  const requirements = uiText('', { wrap: true }), rejection = uiText('', { wrap: true }), resetCost = uiText('', { wrap: true, layout: { grow: 1, basis: uiFixed(48) } });
  // The selected skill: its icon in a slot beside its name and rank pips, then what it does and needs.
  const emblem = uiSlot({ label: 'Selected skill', stack: () => selected && options.artwork?.[selected] ? { itemKind: selected, quantity: 1 } : null,
    artwork: options.artwork });
  emblem.focusable = false;
  const pips = new UiElement({ kind: 'rank-pips', label: '', style: { height: uiFixed(6), width: 'grow' },
    paint(element, { context }) {
      const node = selectedNode(); if (!node || node.root) return; const current = ranks()[node.id] ?? 0;
      for (let index = 0; index < node.maxRank; index++) {
        const x = element.rect.x + index * 6; context.fillStyle = '#3f2832'; context.fillRect(x, element.rect.y, 5, 5);
        context.fillStyle = index < current ? '#feae34' : '#f6ca9f'; context.fillRect(x + 1, element.rect.y + 1, 3, 3);
      }
    } });
  const detail = uiFlex({ id: 'skills.detail', width: 'grow', gap: 4 }, [
    uiFlex({ direction: 'row', gap: 6, align: 'center', alignSelf: 'stretch' }, [emblem, uiFlex({ direction: 'column', gap: 2, grow: 1 }, [title, pips, rank])]),
    live, gear, description, requirements, rejection]);
  const learn = skillButton({ id: 'skills.learn', label: 'Learn', tone: 'success', size: 'sm', layout: { shrink: 0 }, onPress: () => { if (canLearn()) options.purchase(selected!); } }, commandKey);
  const reset = skillButton({ id: 'skills.reset', label: 'Reset', ariaLabel: 'Reset tree', tone: 'danger', size: 'sm', layout: { shrink: 0 }, onPress: () => { if (canReset()) options.reset(track); } }, commandKey);
  const priority = skillButton({ id: 'skills.priority', label: 'PRIORITIZE GEAR', ariaLabel: 'Prioritize equipment skill', size: 'sm', tone: 'primary', layout: { width: 'grow' }, onPress: () => { const node = selectedNode(); if (node?.gearBoostable) options.prioritize?.(node.id); } }, commandKey);
  const cost = uiText('', { wrap: true, layout: { grow: 1, basis: uiFixed(48) } });
  const tabs = new Map<SkillTrack, UiElement>();
  // Tracks are page rows on the left leaf; the open one is highlighted with its level beside it.
  const order = (['farming', 'explorer', 'combat'] as const).filter(candidate => (SKILL_TRACKS as readonly string[]).includes(candidate)) as SkillTrack[];
  for (const candidate of order) tabs.set(candidate, uiPageRow({ id: `skills.track.${candidate}`, label: trackName(candidate), glyph: 'chapter.skills',
    note: () => `Lv ${level(candidate)}`, selected: () => candidate === track, onPress: () => selectTrack(candidate) }));
  // The whole left leaf scrolls: on short screens the selected skill's actions stay reachable.
  const detailScroll = uiScrollArea({ id: 'skills.details', label: 'Skill details and actions', width: 'grow', height: 'grow', grow: 1, gap: 4, scrollStyle: 'wood', padding: { right: 16 } }, [
    heading, ...order.map(candidate => tabs.get(candidate)!), xp, uiPageLabel('SELECTED'), detail, uiFlex({ direction: 'row', wrap: true, align: 'center', gap: 4, alignSelf: 'stretch' }, [cost, learn]), priority,
    uiFlex({ direction: 'row', wrap: true, align: 'center', gap: 4, alignSelf: 'stretch' }, [resetCost, reset])]).setProps({ touchScroll: true });
  const graphHost = uiFlex({ width: 'grow', height: 'grow' });
  const refresh = () => {
    const p = progress(), count = points();
    heading.label = `${track.toUpperCase()} LEVEL ${level(track)} · ${count} UNSPENT POINT${count === 1 ? '' : 'S'}`; heading.invalidate();
    xp.label = capped() ? 'MAX LEVEL' : `${xpSpan().value} / ${xpSpan().span} XP`; xp.invalidate();
    graph.updateRanks(ranks(), selected);
    const node = selectedNode();
    title.setProps({ text: node?.name ?? `${trackName(track)} tree` }); emblem.invalidate(); pips.label = node && !node.root ? `Rank ${ranks()[node.id] ?? 0} of ${node.maxRank}` : ''; pips.invalidate();
    cost.setProps({ text: node && !node.root ? `Cost ${node.pointCost} point${node.pointCost === 1 ? '' : 's'}` : '' });
    live.setProps({ text: node ? skillNodeIsImplemented(node) ? '' : 'PLACEHOLDER — NO EFFECT YET' : 'Select a skill to inspect it.' });
    rank.setProps({ text: node?.root ? 'ROOT — ALWAYS OWNED' : '' });
    const equipment = model.equipmentSkills;
    gear.setProps({ text: node?.gearBoostable && equipment ? `${equipment.trained[node.id] ?? 0} TRAINED + ${equipment.bonuses[node.id] ?? 0} GEAR = ${equipment.effective[node.id] ?? 0} EFFECTIVE (MAX ${equipment.maximums[node.id] ?? node.maxRank})` : '' });
    description.setProps({ text: node?.description ?? 'Drag to pan; wheel or +/- to zoom. Focus the graph and use arrow keys to pan or Home to center. Tab selects a node to inspect.' });
    requirements.setProps({ text: node ? [node.requiresLevel ? `REQUIRES LEVEL ${node.requiresLevel}` : '', node.prerequisites?.length ? `REQUIRES: ${node.prerequisites.map(id => model.nodes.find(candidate => candidate.id === id)?.name ?? id).join(', ')}` : ''].filter(Boolean).join('\n') : '' });
    const reason = node && !node.root ? skillPurchaseRejectionForNodes(model.nodes, node.id, { ...p, ranks: ranks() }, model.progression) : null;
    rejection.setProps({ text: reason?.replaceAll('_', ' ').toUpperCase() ?? '' });
    for (const text of [live, rank, gear, requirements, rejection]) text.setStyle({ visible: text.label !== '' });
    emblem.setStyle({ visible: Boolean(node) }); priority.setStyle({ visible: Boolean(node?.gearBoostable) });
    priority.setProps({ label: model.skillPriority?.[0] === node?.id && node ? 'GEAR: FIRST' : 'PRIORITIZE GEAR' }).setDisabled(!node?.gearBoostable || !options.prioritize);
    const respec = skillRespecCostBronze(p.respecCount, model.progression);
    resetCost.setProps({ text: `RESET COST ${respec / 10000n}G ${respec % 10000n / 100n}S ${respec % 100n}C` });
    reset.setDisabled(!canReset()); learn.setProps({ label: node?.root ? 'Root owned' : node && (ranks()[node.id] ?? 0) >= node.maxRank ? 'Mastered' : 'Learn' }).setDisabled(!canLearn());
    for (const tab of tabs.values()) tab.invalidate();
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
  const glyph = (id: string, icon: string, label: string, press: () => void) => {
    const button = uiGlyphButton({ id, glyph: icon, label, onPress: press });
    return new UiElement({ ...button.hooks, onKey(event, element) { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) return true; return button.hooks.onKey?.(event, element) ?? false; } });
  };
  const toolbar = uiFlex({ direction: 'row', gap: 2, shrink: 0, alignSelf: 'stretch', justify: 'end' }, [
    glyph('skills.center', 'glyph.play', 'Centre the tree', () => graph.center()),
    glyph('skills.zoom-out', 'glyph.minus', 'Zoom out', () => graph.zoomBy(-.1)),
    glyph('skills.zoom-in', 'glyph.plus', 'Zoom in', () => graph.zoomBy(.1)),
  ]);
  const left = detailScroll;
  const right = uiFlex({ direction: 'column', gap: 2, width: 'grow', height: 'grow' }, [toolbar, graphHost]);
  const frame = uiGameBook({ id: 'game.skills', active: 'skills', left, right, page: options.page ?? { width: 200, height: 248 }, onNavigate: options.onNavigate, onClose: options.onClose });
  const host = new UiElement({ id: 'game.skills.host', kind: 'skills-screen', children: [frame], style: { display: 'flex', justify: 'center', align: 'center', width: 'grow', height: 'grow', zLayer: 'modal' }, props: { singlePointer: true },
    onKeyCapture(event) { if (options.onKey?.(event.key, event.repeat === true)) return true; if (event.key !== 'Escape') return false; if (!event.repeat) options.onClose?.(); return true; } });
  const updateSkills = (next: SkillTreeModel) => {
    const nextKey = modelKey(next); if (nextKey === currentModelKey) return;
    currentModelKey = nextKey; const nextCatalog = JSON.stringify(next.nodes); model = next;
    if (nextCatalog !== catalogKey) {
      catalogKey = nextCatalog; if (!selectedNode()) selected = null; rebuildGraph(true);
    }
    refresh();
  };
  rebuildGraph(false); refresh(); currentModelKey = modelKey(model);
  return Object.defineProperty(Object.assign(host, { selectTrack, updateSkills, setPage: frame.setBookPage, focusSkills: () => { frame.setStyle({ visible: true }); graph.requestFocus(); } }), 'selectedTrack', { get: () => track }) as UiSkillsElement;
}
