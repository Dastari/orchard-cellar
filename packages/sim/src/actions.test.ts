import { describe, expect, it } from 'vitest';
import {
  AVATAR_ACTIONS,
  avatarActionAfterMovement,
  avatarActionDefinition,
  avatarActionForEquippedKind,
  itemActionRejection,
  isAvatarActionKind,
} from './actions.js';

describe('avatar action registry', () => {
  it('declares one-shot and looping behavior in one shared registry', () => {
    expect(AVATAR_ACTIONS.swing_axe).toEqual({
      playback: 'oneShot',
      interruptibleByMovement: false,
      equippedKind: 'axe',
    });
    expect(AVATAR_ACTIONS.swing_pickaxe).toEqual({
      playback: 'oneShot',
      interruptibleByMovement: false,
      equippedKind: 'pickaxe',
    });
    expect(AVATAR_ACTIONS.fishing_wait).toEqual({ playback: 'loop', interruptibleByMovement: true });
  });

  it('maps equipment to its shared action without client-side tool rules', () => {
    expect(avatarActionForEquippedKind('axe')).toBe('swing_axe');
    expect(avatarActionForEquippedKind('pickaxe')).toBe('swing_pickaxe');
    expect(avatarActionForEquippedKind('hoe')).toBe('swing_hoe');
    expect(avatarActionForEquippedKind('watering_can')).toBe('water');
    expect(avatarActionForEquippedKind('bow')).toBe('ranged_weapon');
  });

  it('clears only movement-interruptible loops', () => {
    expect(avatarActionAfterMovement('fishing_wait', true)).toBe('none');
    expect(avatarActionAfterMovement('fishing_wait', false)).toBe('fishing_wait');
    expect(avatarActionAfterMovement('swing_axe', true)).toBe('swing_axe');
  });

  it('supports forward-compatible unknown action fallback', () => {
    expect(isAvatarActionKind('pickup')).toBe(true);
    expect(isAvatarActionKind('future_spell')).toBe(false);
    expect(avatarActionDefinition('future_spell')).toBeNull();
  });

  it('blocks presentation for broken tools and ranged weapons without ammunition', () => {
    expect(itemActionRejection(
      { itemKind: 'axe', quantity: 1, durability: 0 },
      [],
    )).toBe('tool_broken');
    expect(itemActionRejection(
      { itemKind: 'axe', quantity: 1, durability: 1 },
      [],
    )).toBeNull();
    expect(itemActionRejection(
      { itemKind: 'bow', quantity: 1, durability: 20 },
      [{ itemKind: 'stone', quantity: 10 }],
    )).toBe('out_of_arrows');
    expect(itemActionRejection(
      { itemKind: 'bow', quantity: 1, durability: 20 },
      [{ itemKind: 'arrow', quantity: 1 }],
    )).toBeNull();
  });
});
