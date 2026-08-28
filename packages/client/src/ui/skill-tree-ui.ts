import {
  SKILL_TRACKS,
  availableSkillPoints,
  skillExperienceForLevel,
  skillLevelForExperience,
  skillNodesForTrack,
  skillPurchaseRejection,
  skillRespecCostBronze,
  type SkillNodeDefinition,
  type SkillTrack,
} from '@orchard/sim';
import { drawOutlinedPixelText, drawPixelText, type PixelUi } from '../render/pixel-ui.js';
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
  readonly tracks: readonly SkillTrackProgressModel[];
  readonly ranks: readonly SkillRankModel[];
  readonly balanceBronze: bigint;
}

export interface SkillTreeCallbacks {
  readonly purchase: (nodeId: string) => void;
  readonly reset: (track: SkillTrack) => void;
}

export interface SkillTreeLayout {
  readonly tabs: Readonly<Record<SkillTrack, UiRect>>;
  readonly viewport: UiRect;
  readonly detail: UiRect;
  readonly centerButton: UiRect;
  readonly resetButton: UiRect;
  readonly learnButton: UiRect;
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

function nodeGlyph(node: SkillNodeDefinition): string {
  return node.name.split(/\s+/).map((word) => word[0] ?? '').join('').slice(0, 2).toUpperCase();
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
    y: rect.y + 71,
    width: rect.width - detailWidth - 42,
    height: rect.height - 90,
  };
  const detail = {
    x: viewport.x + viewport.width + 10,
    y: viewport.y,
    width: detailWidth,
    height: viewport.height,
  };
  const tabWidth = Math.min(96, Math.floor((rect.width - 62) / 3));
  const tabs = Object.fromEntries(SKILL_TRACKS.map((track, index) => [track, {
    x: rect.x + 16 + index * (tabWidth + 4), y: rect.y + 31, width: tabWidth, height: 20,
  }])) as unknown as Readonly<Record<SkillTrack, UiRect>>;
  return {
    tabs,
    viewport,
    detail,
    centerButton: { x: viewport.x + 6, y: viewport.y + 6, width: 62, height: 18 },
    resetButton: { x: detail.x + 8, y: detail.y + detail.height - 47, width: detail.width - 16, height: 18 },
    learnButton: { x: detail.x + 8, y: detail.y + detail.height - 24, width: detail.width - 16, height: 18 },
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

export class SkillTreeUi {
  private model: SkillTreeModel = { tracks: [], ranks: [], balanceBronze: 0n };
  private track: SkillTrack = 'explorer';
  private selectedNodeId: string | null = null;
  private zoom = 0.65;
  private pan: UiPoint = { x: 0, y: 0 };
  private drag: { readonly start: UiPoint; readonly initialPan: UiPoint } | null = null;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly callbacks: SkillTreeCallbacks,
  ) {}

  update(model: SkillTreeModel): void { this.model = model; }

  private progress(): SkillTrackProgressModel {
    return this.model.tracks.find((entry) => entry.track === this.track) ?? {
      track: this.track, experience: 0n, spentPoints: 0, bonusPoints: 0, respecCount: 0,
    };
  }

  private ranks(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.model.ranks.map((rank) => [rank.nodeId, rank.rank]));
  }

  private nodeRect(node: SkillNodeDefinition, viewport: UiRect): UiRect {
    const size = node.root === true ? 36 : 30;
    const centerX = viewport.x + viewport.width / 2 + this.pan.x + node.position[0] * this.zoom;
    const centerY = viewport.y + viewport.height * 0.64 + this.pan.y + node.position[1] * this.zoom;
    return { x: Math.round(centerX - size / 2), y: Math.round(centerY - size / 2), width: size, height: size };
  }

  private nodeAt(point: UiPoint, viewport: UiRect): SkillNodeDefinition | null {
    const nodes = [...skillNodesForTrack(this.track)].reverse();
    return nodes.find((node) => containsPoint(this.nodeRect(node, viewport), point)) ?? null;
  }

  pointerDown(point: UiPoint, button: number, rect: UiRect): boolean {
    if (button !== 0) return false;
    const layout = skillTreeLayout(rect);
    for (const track of SKILL_TRACKS) {
      if (!containsPoint(layout.tabs[track], point)) continue;
      this.track = track;
      this.selectedNodeId = null;
      this.center();
      return true;
    }
    if (containsPoint(layout.centerButton, point)) { this.center(); return true; }
    if (containsPoint(layout.resetButton, point)) {
      if (this.progress().spentPoints > 0) this.callbacks.reset(this.track);
      return true;
    }
    if (containsPoint(layout.learnButton, point)) {
      const node = this.selectedNodeId === null ? null : skillNodesForTrack(this.track).find((candidate) => candidate.id === this.selectedNodeId);
      if (node && skillPurchaseRejection(node.id, { ...this.progress(), ranks: this.ranks() }) === null) this.callbacks.purchase(node.id);
      return true;
    }
    const node = this.nodeAt(point, layout.viewport);
    if (node !== null) {
      this.selectedNodeId = node.id;
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
    if (this.drag !== null) {
      this.pan = {
        x: this.drag.initialPan.x + point.x - this.drag.start.x,
        y: this.drag.initialPan.y + point.y - this.drag.start.y,
      };
    }
  }

  pointerUp(): boolean {
    const active = this.drag !== null;
    this.drag = null;
    return active;
  }

  pointerLeave(): void { this.drag = null; }

  wheel(point: UiPoint, deltaY: number, rect: UiRect): boolean {
    const viewport = skillTreeLayout(rect).viewport;
    if (!containsPoint(viewport, point) || deltaY === 0) return false;
    this.zoom = Math.max(0.5, Math.min(1.4, this.zoom + (deltaY < 0 ? 0.1 : -0.1)));
    return true;
  }

  center(): void { this.pan = { x: 0, y: 0 }; this.zoom = 0.65; }

  draw(context: CanvasRenderingContext2D, rect: UiRect): void {
    const layout = skillTreeLayout(rect);
    const progress = this.progress();
    const ranks = this.ranks();
    const level = skillLevelForExperience(progress.experience);
    const points = availableSkillPoints(progress.experience, progress.spentPoints, progress.bonusPoints);
    const levelStart = skillExperienceForLevel(level);
    const levelEnd = skillExperienceForLevel(Math.min(50, level + 1));
    const levelSpan = levelEnd > levelStart ? levelEnd - levelStart : 1n;
    const xpFraction = level >= 50 ? 1 : Number(progress.experience - levelStart) / Number(levelSpan);

    for (const track of SKILL_TRACKS) {
      const active = track === this.track;
      drawUiSkinAsset(context, active ? this.skin.buttonConfirm : this.skin.button, layout.tabs[track], 'idle');
      label(context, this.fonts, track.toUpperCase(), layout.tabs[track].x + layout.tabs[track].width / 2, layout.tabs[track].y + 6, { align: 'center', color: active ? '#fff2d0' : '#5f3b24' });
    }
    label(context, this.fonts, `LEVEL ${level}   ${points} UNSPENT POINT${points === 1 ? '' : 'S'}`, rect.x + rect.width - 22, rect.y + 35, { align: 'right', color: '#4d2e22', header: true });
    const xpBar = { x: rect.x + 18, y: rect.y + 57, width: rect.width - 38, height: 7 };
    context.fillStyle = '#5b3728'; context.fillRect(xpBar.x, xpBar.y, xpBar.width, xpBar.height);
    context.fillStyle = '#d49b38'; context.fillRect(xpBar.x + 1, xpBar.y + 1, Math.max(0, Math.round((xpBar.width - 2) * xpFraction)), xpBar.height - 2);
    label(context, this.fonts, level >= 50 ? 'MAX LEVEL' : `${progress.experience - levelStart} / ${levelSpan} XP`, xpBar.x + xpBar.width / 2, xpBar.y - 1, { align: 'center', color: '#fff2d0' });

    context.save();
    context.beginPath();
    context.rect(layout.viewport.x, layout.viewport.y, layout.viewport.width, layout.viewport.height);
    context.clip();
    context.fillStyle = 'rgba(83, 49, 38, 0.08)';
    context.fillRect(layout.viewport.x, layout.viewport.y, layout.viewport.width, layout.viewport.height);
    const nodes = skillNodesForTrack(this.track);
    for (const node of nodes) {
      const from = this.nodeRect(node, layout.viewport);
      for (const connectedId of node.connects) {
        if (node.id.localeCompare(connectedId) >= 0) continue;
        const connected = nodes.find((candidate) => candidate.id === connectedId);
        if (!connected) continue;
        const to = this.nodeRect(connected, layout.viewport);
        const lit = (node.root === true || (ranks[node.id] ?? 0) > 0)
          && (connected.root === true || (ranks[connected.id] ?? 0) > 0);
        context.strokeStyle = lit ? '#d49b38' : '#8d674c';
        context.lineWidth = lit ? 3 : 2;
        context.beginPath();
        context.moveTo(Math.round(from.x + from.width / 2), Math.round(from.y + from.height / 2));
        context.lineTo(Math.round(to.x + to.width / 2), Math.round(to.y + to.height / 2));
        context.stroke();
      }
    }
    for (const node of nodes) {
      const nodeRect = this.nodeRect(node, layout.viewport);
      const rank = node.root === true ? 1 : ranks[node.id] ?? 0;
      const rejection = skillPurchaseRejection(node.id, { ...progress, ranks });
      context.fillStyle = rank > 0 ? '#4f8f42' : rejection === null ? '#e4b36d' : '#9b795e';
      context.fillRect(nodeRect.x + 4, nodeRect.y + 4, nodeRect.width - 8, nodeRect.height - 8);
      if (skillNodeShowsReticle(node.id, this.selectedNodeId)) {
        drawUiSkinAsset(context, this.skin.selectorNeutral, skillNodeReticleRect(nodeRect), 'idle');
      }
      label(context, this.fonts, nodeGlyph(node), nodeRect.x + nodeRect.width / 2, nodeRect.y + nodeRect.height / 2 - 3, { align: 'center', color: rank > 0 ? '#fff2d0' : '#4d2e22', header: true });
      if (node.maxRank > 1) {
        const rankLabel = skillNodeRankLabelPosition(nodeRect);
        drawOutlinedPixelText(context, this.fonts, `${rank}/${node.maxRank}`, rankLabel.x, rankLabel.y, {
          align: 'center', color: '#fff2d0', outlineColor: '#3f2832',
        });
      }
    }
    context.restore();

    drawUiSkinAsset(context, this.skin.button, layout.centerButton, 'idle');
    label(context, this.fonts, 'CENTER', layout.centerButton.x + layout.centerButton.width / 2, layout.centerButton.y + 5, { align: 'center' });
    context.fillStyle = '#b97755'; context.fillRect(layout.detail.x, layout.detail.y, 1, layout.detail.height);
    const selected = this.selectedNodeId === null ? null : skillNodesForTrack(this.track).find((node) => node.id === this.selectedNodeId) ?? null;
    const detailX = layout.detail.x + 10;
    if (selected === null) {
      label(context, this.fonts, `${this.track.toUpperCase()} TREE`, detailX, layout.detail.y + 8, { header: true, color: '#4d2e22' });
      wrappedLines('Select a skill to inspect it. Drag the tree to pan and use the mouse wheel to zoom.', Math.max(18, Math.floor((layout.detail.width - 18) / 6))).forEach((line, index) => {
        label(context, this.fonts, line, detailX, layout.detail.y + 31 + index * 13, { color: '#7a4b31' });
      });
    } else {
      const rank = selected.root === true ? 1 : ranks[selected.id] ?? 0;
      label(context, this.fonts, selected.name.toUpperCase(), detailX, layout.detail.y + 8, { header: true, color: '#4d2e22' });
      label(context, this.fonts, selected.root === true ? 'ROOT — ALWAYS OWNED' : `RANK ${rank}/${selected.maxRank}   COST ${selected.pointCost}`, detailX, layout.detail.y + 29, { color: '#7a4b31' });
      wrappedLines(selected.description, Math.max(18, Math.floor((layout.detail.width - 18) / 6))).slice(0, 7).forEach((line, index) => {
        label(context, this.fonts, line, detailX, layout.detail.y + 51 + index * 13, { color: '#5f3b24' });
      });
      const rejection = skillPurchaseRejection(selected.id, { ...progress, ranks });
      if (rejection !== null && selected.root !== true) {
        label(context, this.fonts, rejection.replaceAll('_', ' ').toUpperCase(), detailX, layout.learnButton.y - 14, { color: '#9a3f39' });
      }
    }
    const resetCost = skillRespecCostBronze(progress.respecCount);
    const canReset = progress.spentPoints > 0 && this.model.balanceBronze >= resetCost;
    drawUiSkinAsset(context, canReset ? this.skin.buttonDeny : this.skin.button, layout.resetButton, canReset ? 'idle' : 'disabled');
    label(context, this.fonts, `RESET TREE  ${bronzeLabel(resetCost)}`, layout.resetButton.x + layout.resetButton.width / 2, layout.resetButton.y + 5, { align: 'center', color: canReset ? '#fff2d0' : '#8c6c54' });
    const selectedRejection = selected === null ? 'skill_not_found' : skillPurchaseRejection(selected.id, { ...progress, ranks });
    const canLearn = selected !== null && selectedRejection === null;
    drawUiSkinAsset(context, canLearn ? this.skin.buttonConfirm : this.skin.button, layout.learnButton, canLearn ? 'idle' : 'disabled');
    label(context, this.fonts, selected?.root === true ? 'ROOT OWNED' : 'LEARN 1 RANK', layout.learnButton.x + layout.learnButton.width / 2, layout.learnButton.y + 5, { align: 'center', color: canLearn ? '#fff2d0' : '#8c6c54' });
    label(context, this.fonts, 'PREVIEW SKILLS — EFFECTS ARE NOT ACTIVE YET', layout.viewport.x + layout.viewport.width / 2, layout.viewport.y + layout.viewport.height - 12, { align: 'center', color: '#8d3f38' });
  }
}
