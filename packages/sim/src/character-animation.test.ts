import { describe, expect, it } from 'vitest';
import {
  CUTE_FANTASY_PLAYER_ROWS,
  actionToolFlipsForDirection,
  characterActionAnimation,
  characterLocomotionAnimation,
  characterToolAnimation,
} from './character-animation.js';

describe('shared modular character animation contract', () => {
  it('uses cardinal north and south only and mirrors authored right-facing side rows', () => {
    expect(characterLocomotionAnimation('up', true)).toBe('walk_up');
    expect(characterLocomotionAnimation('upRight', true)).toBe('walk_right');
    expect(characterLocomotionAnimation('downLeft', false)).toBe('idle_right');
    expect(actionToolFlipsForDirection('downLeft')).toBe(true);
    expect(actionToolFlipsForDirection('upRight')).toBe(false);
  });

  it('resolves body and held-tool animation names through the same policy', () => {
    expect(characterActionAnimation('swing_pickaxe', 'up')).toBe('swing_pickaxe_up');
    expect(characterToolAnimation('swing_axe', 'left')).toBe('axe_right');
    expect(characterToolAnimation('ranged_weapon', 'down')).toBe('ranged_weapon_down');
    expect(characterActionAnimation('jump', 'downLeft')).toBe('jump_right');
  });

  it('catalogues each source row once for extractor consumers', () => {
    expect(new Set(CUTE_FANTASY_PLAYER_ROWS.map((entry) => entry.name)).size)
      .toBe(CUTE_FANTASY_PLAYER_ROWS.length);
    expect(CUTE_FANTASY_PLAYER_ROWS.find((entry) => entry.name === 'fish_cast_down'))
      .toMatchObject({ row: 44, authoredFrameCount: 9, outputFrameCount: 40 });
    expect(CUTE_FANTASY_PLAYER_ROWS.find((entry) => entry.name === 'jump_right'))
      .toMatchObject({ row: 27, authoredFrameCount: 6, outputFrameCount: 6, loop: false });
  });
});
