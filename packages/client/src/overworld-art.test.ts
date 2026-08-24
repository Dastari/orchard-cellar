import { describe, expect, it } from 'vitest';
import { axeAnimationForDirection, avatarAnimationForDirection, isOverworldRoad, sortWorldDrawItems } from './overworld-art.js';
import { canonicalBlob47Index } from './render/tilemap.js';

describe('overworld art topology', () => {
  it('uses the generated atlas canonical blob ordering', () => {
    expect(canonicalBlob47Index(0, 0)).toBe(0);
    expect(canonicalBlob47Index(3, 1)).toBe(4);
    expect(canonicalBlob47Index(15, 15)).toBe(46);
  });

  it('lays two-tile roads between sixteen-tile parcels without a left-edge stripe', () => {
    expect(isOverworldRoad(0, 8)).toBe(false);
    expect(isOverworldRoad(15, 8)).toBe(true);
    expect(isOverworldRoad(16, 8)).toBe(true);
    expect(isOverworldRoad(17, 8)).toBe(false);
    expect(isOverworldRoad(8, 15)).toBe(true);
  });

  it('uses the side pose for diagonal travel when the licensed sheet has cardinal poses only', () => {
    expect(avatarAnimationForDirection('up')).toBe('walk_up');
    expect(avatarAnimationForDirection('upLeft')).toBe('walk_right');
    expect(avatarAnimationForDirection('upRight')).toBe('walk_right');
    expect(avatarAnimationForDirection('down')).toBe('walk_down');
  });

  it('uses the licensed directional axe rows and mirrors side swings', () => {
    expect(axeAnimationForDirection('up')).toBe('axe_up');
    expect(axeAnimationForDirection('down')).toBe('axe_down');
    expect(axeAnimationForDirection('left')).toBe('axe_right');
    expect(axeAnimationForDirection('upRight')).toBe('axe_right');
  });

  it('sorts world objects by foot point with a deterministic tie-break', () => {
    expect(sortWorldDrawItems([
      { footY: 32, tie: 'player' },
      { footY: 16, tie: 'tree' },
      { footY: 32, tie: 'apple' },
    ]).map((item) => item.tie)).toEqual(['tree', 'apple', 'player']);
  });
});
