import { describe, expect, it, vi } from 'vitest';
import { skillNodesForTrack, type SkillNodeDefinition } from '@orchard/sim';
import type { UiSkin } from './skin.js';
import type { PixelUi } from './pixel-ui.js';
import { BUTTON_HEIGHT } from './button.js';
import {
  SkillTreeUi,
  skillNodeRankLabelPosition,
  skillNodeReticleRect,
  skillNodeShowsReticle,
  skillTreeCoordinateBounds,
  skillTreeFitZoom,
  skillTreeLayout,
} from './skill-tree-ui.js';

describe('skill-tree canvas layout', () => {
  it('reserves non-overlapping tree, details, tabs, and actions', () => {
    const rect = { x: 60, y: 55, width: 680, height: 390 };
    const layout = skillTreeLayout(rect);
    expect(layout.viewport.x + layout.viewport.width).toBeLessThan(layout.detail.x);
    expect(layout.detail.x + layout.detail.width).toBeLessThanOrEqual(rect.x + rect.width);
    expect(layout.learnButton.x).toBeGreaterThan(layout.resetButton.x + layout.resetButton.width);
    expect(layout.priorityButton.y + layout.priorityButton.height).toBeLessThan(layout.learnButton.y);
    expect(layout.legend.y).toBeGreaterThanOrEqual(layout.viewport.y + layout.viewport.height);
    expect(layout.legend.y + layout.legend.height).toBeLessThanOrEqual(rect.y + rect.height);
    expect(layout.resetButton.height).toBe(BUTTON_HEIGHT.regular);
    expect(layout.learnButton.height).toBe(BUTTON_HEIGHT.regular);
    for (const tab of Object.values(layout.tabs)) {
      expect(tab.y).toBeLessThan(layout.viewport.y);
      expect(tab.x).toBeGreaterThanOrEqual(rect.x);
    }
  });

  it('shows a reticle only on the explicitly selected skill', () => {
    expect(skillNodeShowsReticle('trailblazer', null)).toBe(false);
    expect(skillNodeShowsReticle('trailblazer', 'measured_stride')).toBe(false);
    expect(skillNodeShowsReticle('trailblazer', 'trailblazer')).toBe(true);
  });

  it('places the selected reticle outside the full skill slot and lowers the rank label', () => {
    const node = { x: 40, y: 70, width: 30, height: 30 };
    expect(skillNodeReticleRect(node)).toEqual({ x: 25, y: 55, width: 60, height: 60 });
    expect(skillNodeRankLabelPosition(node)).toEqual({ x: 55, y: 97 });
  });

  it('keeps Farming profession and discovery lanes free of overlapping node cells', () => {
    const nodes = skillNodesForTrack('farming');
    const viewport = skillTreeLayout({ x: 60, y: 55, width: 680, height: 390 }).viewport;
    const zoom = skillTreeFitZoom(nodes, viewport);
    const bounds = skillTreeCoordinateBounds(nodes);
    expect(bounds).toEqual({ minX: -540, maxX: 930, minY: -300, maxY: 380 });
    expect(zoom).toBeGreaterThanOrEqual(0.35);
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const xDistance = Math.abs(nodes[left]!.position[0] - nodes[right]!.position[0]) * zoom;
        const yDistance = Math.abs(nodes[left]!.position[1] - nodes[right]!.position[1]) * zoom;
        expect(xDistance >= 36 || yDistance >= 36,
          `${nodes[left]!.id} overlaps ${nodes[right]!.id}`).toBe(true);
      }
    }
  });
});


describe('authored skill-tree model', () => {
  it('uses active authored nodes for selection and prerequisites instead of bootstrap content', () => {
    const purchase = vi.fn();
    const ui = new SkillTreeUi({} as UiSkin, {} as PixelUi, { purchase, reset: vi.fn() });
    const node: SkillNodeDefinition = {
      id: 'authored_detector', iconAsset: 'icon_skill_existing_detector', track: 'farming', name: 'Detector', description: '',
      position: [0, 0], connects: ['owned_neighbor'], prerequisites: ['required_parent'],
      maxRank: 1, pointCost: 1, implemented: true,
    };
    const parent: SkillNodeDefinition = { ...node, id: 'required_parent', position: [-200, 0], connects: [], prerequisites: [] };
    const neighbor: SkillNodeDefinition = { ...parent, id: 'owned_neighbor', position: [200, 0] };
    const model = {
      nodes: [node, parent, neighbor],
      tracks: [{ track: 'farming' as const, experience: 10_000n, spentPoints: 0, bonusPoints: 0, respecCount: 0 }],
      ranks: [{ nodeId: neighbor.id, rank: 1 }], balanceBronze: 0n,
    };
    const rect = { x: 0, y: 0, width: 680, height: 390 };
    const layout = skillTreeLayout(rect);
    ui.update(model);
    ui.selectTrack('farming', layout.viewport);
    const center = { x: layout.viewport.x + layout.viewport.width / 2, y: layout.viewport.y + layout.viewport.height / 2 };
    const learn = { x: layout.learnButton.x + 2, y: layout.learnButton.y + 2 };
    expect(ui.pointerDown(center, 0, rect)).toBe(true);
    ui.pointerDown(learn, 0, rect);
    expect(purchase).not.toHaveBeenCalled();
    ui.update({ ...model, ranks: [...model.ranks, { nodeId: parent.id, rank: 1 }] });
    ui.pointerDown(learn, 0, rect);
    expect(purchase).toHaveBeenCalledWith('authored_detector');
    purchase.mockClear();
    ui.update({ ...model, nodes: [] });
    ui.pointerDown(learn, 0, rect);
    expect(purchase).not.toHaveBeenCalled();
  });
});
