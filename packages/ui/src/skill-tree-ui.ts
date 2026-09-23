import { BOOTSTRAP_PROGRESSION, type ProgressionContentDefinition } from '@orchard/sim';
import {
  SKILL_TRACKS,
  availableSkillPoints,
  skillExperienceForLevel,
  skillLevelForExperience,
  skillNodeIsImplemented,
  skillPurchaseRejectionForNodes,
  skillRespecCostBronze,
  type SkillNodeDefinition,
  type EquipmentSkillResolution,
  type SkillTrack,
} from '@orchard/sim';
import { drawOutlinedPixelText, drawPixelText, fitPixelText, type PixelUi } from './pixel-ui.js';
import { BUTTON_HEIGHT, drawButton } from './button.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

export interface SkillTrackProgressModel {
  readonly track: SkillTrack;
  readonly experience: bigint;
  readonly spentPoints: number;
  readonly bonusPoints: number;
  readonly respecCount: number;
}

export interface SkillRankModel {
  readonly nodeId: string;
  readonly rank: number;
}

export interface SkillTreeModel {
  readonly progression?: ProgressionContentDefinition;
  readonly nodes: readonly SkillNodeDefinition[];
  readonly tracks: readonly SkillTrackProgressModel[];
  readonly ranks: readonly SkillRankModel[];
  readonly balanceBronze: bigint;
  readonly skillPriority?: readonly string[];
  readonly equipmentSkills?: EquipmentSkillResolution;
}

export interface SkillTreeCallbacks {
  readonly prioritize?: (nodeId:string)=>void;
  readonly purchase: (nodeId: string) => void;
  readonly reset: (track: SkillTrack) => void;
}

export interface SkillTreeLayout {
  readonly tabs: Readonly<Record<SkillTrack, UiRect>>;
  readonly viewport: UiRect;
  readonly legend: UiRect;
  readonly detail: UiRect;
  readonly centerButton: UiRect;
  readonly resetButton: UiRect;
  readonly learnButton: UiRect;
  readonly priorityButton: UiRect;
}

function label(context: CanvasRenderingContext2D, fonts: PixelUi, text: string, x: number, y: number, options: { readonly color?: string; readonly align?: CanvasTextAlign; readonly header?: boolean } = {}): void {
  drawPixelText(context, fonts, text, Math.round(x), Math.round(y), {
    color: options.color ?? '#5f3b24', align: options.align, font: options.header ? 'header' : 'body',
  });
}

function wrappedLines(text: string, characters: number): readonly string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= characters || line.length === 0) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function bronzeLabel(value: bigint): string {
  const gold = value / 10_000n;
  const silver = (value % 10_000n) / 100n;
  const bronze = value % 100n;
  if (gold > 0n) return `${gold}G ${silver}S`;
  if (silver > 0n) return `${silver}S ${bronze}C`;
  return `${bronze}C`;
}

export function skillTreeLayout(rect: UiRect): SkillTreeLayout {
  const detailWidth = Math.min(204, Math.max(154, Math.floor(rect.width * 0.31)));
  const viewport = {
    x: rect.x + 16,
    y: rect.y + 42,
    width: rect.width - detailWidth - 42,
    height: rect.height - 67,
  };
  const detail = {
    x: viewport.x + viewport.width + 10,
    y: viewport.y,
    width: detailWidth,
    height: viewport.height,
  };
  const tabWidth = Math.floor((viewport.width - 8) / 3);
  const tabs = Object.fromEntries(SKILL_TRACKS.map((track, index) => [track, {
    x: rect.x + 16 + index * (tabWidth + 4), y: rect.y + 2,
    width: tabWidth, height: BUTTON_HEIGHT.regular,
  }])) as unknown as Readonly<Record<SkillTrack, UiRect>>;
  return {
    tabs,
    viewport,
    legend: {
      x: viewport.x, y: viewport.y + viewport.height + 4,
      width: viewport.width, height: 18,
    },
    detail,
    centerButton: {
      x: viewport.x + 6, y: viewport.y + 6,
      width: 62, height: BUTTON_HEIGHT.compact,
    },
    resetButton: {
      x: detail.x + 8, y: detail.y + detail.height - 24,
      width: Math.floor((detail.width - 20) / 2), height: BUTTON_HEIGHT.regular,
    },
    priorityButton:{x:detail.x+8,y:detail.y+detail.height-50,width:detail.width-16,height:BUTTON_HEIGHT.regular},
    learnButton: {
      x: detail.x + 12 + Math.floor((detail.width - 20) / 2), y: detail.y + detail.height - 24,
      width: Math.floor((detail.width - 20) / 2), height: BUTTON_HEIGHT.regular,
    },
  };
}

export function skillNodeShowsReticle(nodeId: string, selectedNodeId: string | null): boolean {
  return selectedNodeId === nodeId;
}

export function skillNodeReticleRect(nodeRect: UiRect): UiRect {
  const size = nodeRect.width + 30;
  return {
    x: Math.round(nodeRect.x + (nodeRect.width - size) / 2),
    y: Math.round(nodeRect.y + (nodeRect.height - size) / 2),
    width: size,
    height: size,
  };
}

export function skillNodeRankLabelPosition(nodeRect: UiRect): UiPoint {
  return {
    x: Math.round(nodeRect.x + nodeRect.width / 2),
    y: nodeRect.y + nodeRect.height - 3,
  };
}

export interface SkillTreeCoordinateBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export function skillTreeCoordinateBounds(
  nodes: readonly SkillNodeDefinition[],
): SkillTreeCoordinateBounds {
  if (nodes.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    minX: Math.min(...nodes.map((node) => node.position[0])),
    maxX: Math.max(...nodes.map((node) => node.position[0])),
    minY: Math.min(...nodes.map((node) => node.position[1])),
    maxY: Math.max(...nodes.map((node) => node.position[1])),
  };
}

export function skillTreeFitZoom(nodes: readonly SkillNodeDefinition[], viewport: UiRect): number {
  const bounds = skillTreeCoordinateBounds(nodes);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  return Math.max(0.35, Math.min(0.65,
    (viewport.width - 72) / width,
    (viewport.height - 64) / height));
}

export class SkillTreeUi {
  private model: SkillTreeModel = { nodes: [], tracks: [], ranks: [], balanceBronze: 0n };
  private track: SkillTrack = 'explorer';
  private selectedNodeId: string | null = null;
  private zoom = 0.65;
  private detailScroll=0;
  private detailScrollMaximum=0;
  private detailDrag:{y:number;scroll:number}|null=null;
  private pan: UiPoint = { x: 0, y: 0 };
  private drag: { readonly start: UiPoint; readonly initialPan: UiPoint } | null = null;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly callbacks: SkillTreeCallbacks,
  ) {}

  update(model: SkillTreeModel): void {
    this.model = model;
    if (!model.nodes.some(({ id }) => id === this.selectedNodeId)) this.selectedNodeId = null;
  }

  private nodes(): readonly SkillNodeDefinition[] {
    return this.model.nodes.filter(({ track }) => track === this.track);
  }

  get selectedTrack(): SkillTrack { return this.track; }

  selectTrack(track: SkillTrack, viewport?: UiRect): void {
    this.track = track;
    this.selectedNodeId = null;
    this.detailScroll=0;
    this.center(viewport);
  }

  private progress(): SkillTrackProgressModel {
    return this.model.tracks.find((entry) => entry.track === this.track) ?? {
      track: this.track, experience: 0n, spentPoints: 0, bonusPoints: 0, respecCount: 0,
    };
  }

  private ranks(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.model.ranks.map((rank) => [rank.nodeId, rank.rank]));
  }

  private nodeRect(
    node: SkillNodeDefinition,
    viewport: UiRect,
    bounds: SkillTreeCoordinateBounds = skillTreeCoordinateBounds(this.nodes()),
  ): UiRect {
    const size = node.root === true ? 36 : 30;
    const treeCenterX = (bounds.minX + bounds.maxX) / 2;
    const treeCenterY = (bounds.minY + bounds.maxY) / 2;
    const centerX = viewport.x + viewport.width / 2 + this.pan.x
      + (node.position[0] - treeCenterX) * this.zoom;
    const centerY = viewport.y + viewport.height / 2 + this.pan.y
      + (node.position[1] - treeCenterY) * this.zoom;
    return { x: Math.round(centerX - size / 2), y: Math.round(centerY - size / 2), width: size, height: size };
  }

  private nodeAt(point: UiPoint, viewport: UiRect): SkillNodeDefinition | null {
    const nodes = [...this.nodes()].reverse();
    const bounds = skillTreeCoordinateBounds(nodes);
    return nodes.find((node) => containsPoint(this.nodeRect(node, viewport, bounds), point)) ?? null;
  }

  pointerDown(point: UiPoint, button: number, rect: UiRect): boolean {
    if (button !== 0) return false;
    const layout = skillTreeLayout(rect);
    for (const track of SKILL_TRACKS) {
      if (!containsPoint(layout.tabs[track], point)) continue;
      this.selectTrack(track, layout.viewport);
      return true;
    }
    if (containsPoint(layout.centerButton, point)) { this.center(layout.viewport); return true; }
    if (containsPoint(layout.resetButton, point)) {
      if (this.progress().spentPoints > 0) this.callbacks.reset(this.track);
      return true;
    }
    if (containsPoint(layout.priorityButton,point)) {
      const selected=this.nodes().find(node=>node.id===this.selectedNodeId);
      if (selected?.gearBoostable===true) this.callbacks.prioritize?.(selected.id);
      return true;
    }
    if (containsPoint(layout.detail,point) && point.y<layout.priorityButton.y) {
      this.detailDrag={y:point.y,scroll:this.detailScroll};
      return true;
    }
    if (containsPoint(layout.learnButton, point)) {
      const node = this.selectedNodeId === null ? null : this.nodes().find((candidate) => candidate.id === this.selectedNodeId);
      if (node && skillPurchaseRejectionForNodes(this.model.nodes, node.id, { ...this.progress(), ranks: this.ranks() }, this.model.progression) === null) this.callbacks.purchase(node.id);
      return true;
    }
    const node = containsPoint(layout.viewport, point) ? this.nodeAt(point, layout.viewport) : null;
    if (node !== null) {
      this.selectedNodeId = node.id;
      this.detailScroll=0;
      return true;
    }
    if (containsPoint(layout.viewport, point)) {
      this.drag = { start: point, initialPan: this.pan };
      return true;
    }
    return false;
  }

  pointerMove(point: UiPoint, rect: UiRect): void {
    void rect;
    if (this.detailDrag!==null) {this.detailScroll=Math.max(0,Math.min(this.detailScrollMaximum,this.detailDrag.scroll+this.detailDrag.y-point.y));return;}
    if (this.drag !== null) {
      this.pan = {
        x: this.drag.initialPan.x + point.x - this.drag.start.x,
        y: this.drag.initialPan.y + point.y - this.drag.start.y,
      };
    }
  }

  pointerUp(): boolean {
    const active = this.drag !== null || this.detailDrag!==null;
    this.drag = null; this.detailDrag=null;
    return active;
  }

  pointerLeave(): void { this.drag = null; this.detailDrag=null; }

  wheel(point: UiPoint, deltaY: number, rect: UiRect): boolean {
    const layout=skillTreeLayout(rect),viewport=layout.viewport;
    if (containsPoint(layout.detail,point) && deltaY!==0) {
      this.detailScroll=Math.max(0,Math.min(this.detailScrollMaximum,this.detailScroll+Math.sign(deltaY)*24));return true;
    }
    if (!containsPoint(viewport, point) || deltaY === 0) return false;
    this.zoom = Math.max(0.35, Math.min(1.4, this.zoom + (deltaY < 0 ? 0.1 : -0.1)));
    return true;
  }

  center(viewport?: UiRect): void {
    this.pan = { x: 0, y: 0 };
    this.zoom = viewport === undefined
      ? 0.65
      : skillTreeFitZoom(this.nodes(), viewport);
  }

  draw(context: CanvasRenderingContext2D, rect: UiRect): void {
    const layout = skillTreeLayout(rect);
    const progress = this.progress();
    const ranks = this.ranks();
    const level = skillLevelForExperience(progress.experience, this.model.progression);
    const points = availableSkillPoints(progress.experience, progress.spentPoints, progress.bonusPoints, this.model.progression);
    const levelStart = skillExperienceForLevel(level, this.model.progression);
    const levelEnd = skillExperienceForLevel(level + 1, this.model.progression);
    const levelSpan = levelEnd > levelStart ? levelEnd - levelStart : 1n;
    const xpFraction = level >= (this.model.progression ?? BOOTSTRAP_PROGRESSION).levelCap ? 1 : Number(progress.experience - levelStart) / Number(levelSpan);

    for (const track of SKILL_TRACKS) {
      const active = track === this.track;
      drawButton(context, this.skin, this.fonts, layout.tabs[track], {
        label: track.toUpperCase(), tone: active ? 'success' : 'neutral',
      });
    }
    label(context, this.fonts, `LV ${level} / ${points} POINT${points === 1 ? '' : 'S'}`, layout.detail.x + layout.detail.width / 2, rect.y + 9, { align: 'center', color: '#4d2e22' });
    const xpBar = { x: rect.x + 18, y: rect.y + 29, width: rect.width - 38, height: 7 };
    context.fillStyle = '#5b3728'; context.fillRect(xpBar.x, xpBar.y, xpBar.width, xpBar.height);
    context.fillStyle = '#d49b38'; context.fillRect(xpBar.x + 1, xpBar.y + 1, Math.max(0, Math.round((xpBar.width - 2) * xpFraction)), xpBar.height - 2);
    label(context, this.fonts, level >= (this.model.progression ?? BOOTSTRAP_PROGRESSION).levelCap ? 'MAX LEVEL' : `${progress.experience - levelStart} / ${levelSpan} XP`, xpBar.x + xpBar.width / 2, xpBar.y - 1, { align: 'center', color: '#fff2d0' });

    context.save();
    context.beginPath();
    context.rect(layout.viewport.x, layout.viewport.y, layout.viewport.width, layout.viewport.height);
    context.clip();
    context.fillStyle = 'rgba(83, 49, 38, 0.08)';
    context.fillRect(layout.viewport.x, layout.viewport.y, layout.viewport.width, layout.viewport.height);
    const nodes = this.nodes();
    const coordinateBounds = skillTreeCoordinateBounds(nodes);
    for (const node of nodes) {
      const from = this.nodeRect(node, layout.viewport, coordinateBounds);
      for (const connectedId of node.connects) {
        if (node.id.localeCompare(connectedId) >= 0) continue;
        const connected = nodes.find((candidate) => candidate.id === connectedId);
        if (!connected) continue;
        const to = this.nodeRect(connected, layout.viewport, coordinateBounds);
        const lit = (node.root === true || (ranks[node.id] ?? 0) > 0)
          && (connected.root === true || (ranks[connected.id] ?? 0) > 0);
        const implemented = skillNodeIsImplemented(node) && skillNodeIsImplemented(connected);
        context.strokeStyle = implemented ? (lit ? '#d49b38' : '#8d674c') : '#9a7668';
        context.lineWidth = lit ? 3 : 2;
        context.setLineDash(implemented ? [] : [3, 3]);
        context.beginPath();
        context.moveTo(Math.round(from.x + from.width / 2), Math.round(from.y + from.height / 2));
        context.lineTo(Math.round(to.x + to.width / 2), Math.round(to.y + to.height / 2));
        context.stroke();
        context.setLineDash([]);
      }
    }
    for (const node of nodes) {
      const nodeRect = this.nodeRect(node, layout.viewport, coordinateBounds);
      const rank = node.root === true ? 1 : ranks[node.id] ?? 0;
      const rejection = skillPurchaseRejectionForNodes(this.model.nodes, node.id, { ...progress, ranks }, this.model.progression);
      const implemented = skillNodeIsImplemented(node);
      context.fillStyle = implemented
        ? rank > 0 ? '#4f8f42' : rejection === null ? '#e4b36d' : '#9b795e'
        : '#88746c';
      context.fillRect(nodeRect.x + 4, nodeRect.y + 4, nodeRect.width - 8, nodeRect.height - 8);
      if (!implemented) {
        context.save();
        context.beginPath();
        context.rect(nodeRect.x + 4, nodeRect.y + 4, nodeRect.width - 8, nodeRect.height - 8);
        context.clip();
        context.strokeStyle = 'rgba(74, 48, 43, 0.42)';
        context.lineWidth = 2;
        for (let offset = -nodeRect.height; offset < nodeRect.width; offset += 7) {
          context.beginPath();
          context.moveTo(nodeRect.x + offset, nodeRect.y + nodeRect.height);
          context.lineTo(nodeRect.x + offset + nodeRect.height, nodeRect.y);
          context.stroke();
        }
        context.restore();
      }
      if (skillNodeShowsReticle(node.id, this.selectedNodeId)) {
        drawUiSkinAsset(context, this.skin.selectorNeutral, skillNodeReticleRect(nodeRect), 'idle');
      }
      const icon = this.skin.skillIcons[node.id];
      if (icon !== undefined) {
        context.save();
        context.globalAlpha *= implemented ? rank > 0 ? 1 : rejection === null ? 0.9 : 0.55 : 0.42;
        drawUiSkinAsset(context, icon, {
          x: Math.round(nodeRect.x + (nodeRect.width - 16) / 2),
          y: Math.round(nodeRect.y + (nodeRect.height - 16) / 2) - 1,
          width: 16,
          height: 16,
        });
        context.restore();
      }
      context.fillStyle = implemented ? '#67a74f' : '#a74646';
      context.fillRect(nodeRect.x + nodeRect.width - 7, nodeRect.y + 3, 5, 5);
      if (node.maxRank > 1) {
        const rankLabel = skillNodeRankLabelPosition(nodeRect);
        drawOutlinedPixelText(context, this.fonts, `${rank}/${node.maxRank}`, rankLabel.x, rankLabel.y, {
          align: 'center', color: '#fff2d0', outlineColor: '#3f2832',
        });
      }
    }
    context.restore();

    drawButton(context, this.skin, this.fonts, layout.centerButton, {
      label: 'CENTER', size: 'compact',
    });
    const legendY = layout.legend.y + 5;
    const legendCenter = layout.legend.x + layout.legend.width / 2;
    context.fillStyle = '#67a74f';
    context.fillRect(Math.round(legendCenter - 101), legendY - 2, 6, 6);
    label(context, this.fonts, 'LIVE IN GAME', legendCenter - 91, legendY, { color: '#5c4934' });
    context.fillStyle = '#a74646';
    context.fillRect(Math.round(legendCenter + 7), legendY - 2, 6, 6);
    label(context, this.fonts, 'PLACEHOLDER', legendCenter + 17, legendY, { color: '#7f4842' });
    context.fillStyle = '#b97755'; context.fillRect(layout.detail.x, layout.detail.y, 1, layout.detail.height);
    const selected = this.selectedNodeId === null ? null : this.nodes().find((node) => node.id === this.selectedNodeId) ?? null;
    const detailX = layout.detail.x + 10;
    const contentHeight=selected===null?100:82+wrappedLines(selected.description,Math.max(18,Math.floor((layout.detail.width-18)/6))).length*13;
    this.detailScrollMaximum=Math.max(0,contentHeight-(layout.priorityButton.y-layout.detail.y-4));
    this.detailScroll=Math.min(this.detailScroll,this.detailScrollMaximum);
    context.save();context.beginPath();context.rect(layout.detail.x,layout.detail.y,layout.detail.width,layout.priorityButton.y-layout.detail.y-4);context.clip();
    context.translate(0,-this.detailScroll);

    if (selected === null) {
      label(context, this.fonts, `${this.track.toUpperCase()} TREE`, detailX, layout.detail.y + 8, { header: true, color: '#4d2e22' });
      wrappedLines('Select a skill to inspect it. Drag the tree to pan and use the mouse wheel to zoom.', Math.max(18, Math.floor((layout.detail.width - 18) / 6))).forEach((line, index) => {
        label(context, this.fonts, line, detailX, layout.detail.y + 31 + index * 13, { color: '#7a4b31' });
      });
    } else {
      const rank = selected.root === true ? 1 : ranks[selected.id] ?? 0;
      const implemented = skillNodeIsImplemented(selected);
      label(context, this.fonts, fitPixelText(selected.name.toUpperCase(),layout.detail.width-20,1,this.fonts.font), detailX, layout.detail.y + 5, { color: '#4d2e22' });
      label(context, this.fonts, implemented ? 'LIVE IN GAME' : 'PLACEHOLDER — NO EFFECT YET', detailX, layout.detail.y + 17, {
        color: implemented ? '#44733b' : '#9a3f39',
      });
      label(context, this.fonts, selected.root === true ? 'ROOT — ALWAYS OWNED' : `RANK ${rank}/${selected.maxRank}   COST ${selected.pointCost}`, detailX, layout.detail.y + 29, { color: '#7a4b31' });
      const equipment=this.model.equipmentSkills;
      const gearLines=selected.gearBoostable===true && equipment!==undefined ? [
        `${equipment.trained[selected.id]??0} TRAINED + ${equipment.bonuses[selected.id]??0} GEAR`,
        `= ${equipment.effective[selected.id]??0} EFFECTIVE (MAX ${equipment.maximums[selected.id]??selected.maxRank})`,
      ] : [];
      gearLines.forEach((line,index)=>label(context,this.fonts,line,detailX,layout.detail.y+41+index*11,{color:'#44733b'}));
      wrappedLines(selected.description, Math.max(18, Math.floor((layout.detail.width - 18) / 6))).forEach((line, index) => {
        label(context, this.fonts, line, detailX, layout.detail.y + 46 + gearLines.length*11 + index * 13, { color: '#5f3b24' });
      });
      const rejection = skillPurchaseRejectionForNodes(this.model.nodes, selected.id, { ...progress, ranks }, this.model.progression);
      if (rejection !== null && selected.root !== true) {
        label(context, this.fonts, rejection.replaceAll('_', ' ').toUpperCase(), detailX, layout.detail.y+contentHeight-8, { color: '#9a3f39' });
      }
    }
    context.restore();
    if (this.detailScrollMaximum>0) {
      const trackHeight=layout.priorityButton.y-layout.detail.y-8;
      context.fillStyle='#ba8256';context.fillRect(layout.detail.x+layout.detail.width-3,layout.detail.y+4,2,trackHeight);
      context.fillStyle='#5f3b24';context.fillRect(layout.detail.x+layout.detail.width-3,layout.detail.y+4+(trackHeight-12)*this.detailScroll/this.detailScrollMaximum,2,12);
    }
    drawButton(context,this.skin,this.fonts,layout.priorityButton,{
      label:this.model.skillPriority?.[0]===selected?.id?'GEAR PRIORITY: FIRST':'PRIORITIZE GEAR SKILL',
      state:selected?.gearBoostable===true?'idle':'disabled',
    });
    const resetCost = skillRespecCostBronze(progress.respecCount, this.model.progression);
    const canReset = progress.spentPoints > 0 && this.model.balanceBronze >= resetCost;
    drawButton(context, this.skin, this.fonts, layout.resetButton, {
      label: `RESET ${bronzeLabel(resetCost)}`,
      tone: 'danger', state: canReset ? 'idle' : 'disabled',
    });
    const selectedRejection = selected === null ? 'skill_not_found' : skillPurchaseRejectionForNodes(this.model.nodes, selected.id, { ...progress, ranks }, this.model.progression);
    const canLearn = selected !== null && selectedRejection === null;
    drawButton(context, this.skin, this.fonts, layout.learnButton, {
      label: selected?.root === true ? 'ROOT OWNED' : 'LEARN +1',
      tone: 'success', state: canLearn ? 'idle' : 'disabled',
    });
  }
}
