import { SKILL_TRACKS, type SkillNodeDefinition, type SkillTrack } from '@orchard/sim';
import { BUTTON_HEIGHT } from './button.js';
import type { UiPoint, UiRect } from './geometry.js';

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
  readonly legend: UiRect;
  readonly detail: UiRect;
  readonly centerButton: UiRect;
  readonly resetButton: UiRect;
  readonly learnButton: UiRect;
}

export function skillTreeLayout(rect: UiRect): SkillTreeLayout {
  const detailWidth = Math.min(204, Math.max(154, Math.floor(rect.width * 0.31)));
  const viewport = {
    x: rect.x + 16,
    y: rect.y + 71,
    width: rect.width - detailWidth - 42,
    height: rect.height - 112,
  };
  const detail = {
    x: viewport.x + viewport.width + 10,
    y: viewport.y,
    width: detailWidth,
    height: viewport.height,
  };
  const tabWidth = Math.min(96, Math.floor((rect.width - 62) / 3));
  const tabs = Object.fromEntries(SKILL_TRACKS.map((track, index) => [track, {
    x: rect.x + 16 + index * (tabWidth + 4), y: rect.y + 31,
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
      x: detail.x + 8, y: detail.y + detail.height - 54,
      width: detail.width - 16, height: BUTTON_HEIGHT.regular,
    },
    learnButton: {
      x: detail.x + 8, y: detail.y + detail.height - 27,
      width: detail.width - 16, height: BUTTON_HEIGHT.regular,
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

