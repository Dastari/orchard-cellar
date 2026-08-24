import { describe, expect, it } from 'vitest';
import { AVATAR_ACTIONS, avatarActionAfterMovement, avatarActionDefinition, isAvatarActionKind } from './actions.js';

describe('avatar action registry', () => {
  it('declares one-shot and looping behavior in one shared registry', () => {
    expect(AVATAR_ACTIONS.swing_axe).toEqual({ playback: 'oneShot', interruptibleByMovement: false });
    expect(AVATAR_ACTIONS.fishing_wait).toEqual({ playback: 'loop', interruptibleByMovement: true });
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
});
