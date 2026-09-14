import { describe, expect, it } from 'vitest';
import { fruitPressContentsAnimation } from './fruit-press-presentation.js';

describe('fruit press contents', () => {
  it.each(['apple', 'cherry', 'grape', 'peach', 'pear'])(
    'shows the public %s processing input to every observer', (fruit) => {
      expect(fruitPressContentsAnimation({
        kind: 'fruit_press', processStartTick: 0n, processInputKind: fruit,
      })).toBe(`contents_${fruit}`);
    },
  );

  it('uses the active batch ahead of an independently observed container slot', () => {
    expect(fruitPressContentsAnimation({
      kind: 'fruit_press', processStartTick: 9n, processInputKind: 'grape',
    }, { itemKind: 'apple', quantity: 3 })).toBe('contents_grape');
  });

  it('previews a loaded idle input and clears after emptying or completing', () => {
    const press = { kind: 'fruit_press' };
    expect(fruitPressContentsAnimation(press, { itemKind: 'pear', quantity: 2 })).toBe('contents_pear');
    expect(fruitPressContentsAnimation(press, { itemKind: 'pear', quantity: 0 })).toBeUndefined();
    expect(fruitPressContentsAnimation({ ...press, processInputKind: 'pear' })).toBeUndefined();
    expect(fruitPressContentsAnimation(press)).toBeUndefined();
  });

  it('does not invent fruit for unknown inputs or other stations', () => {
    expect(fruitPressContentsAnimation({ kind: 'fermentation_cask', processStartTick: 1n, processInputKind: 'apple' })).toBeUndefined();
    expect(fruitPressContentsAnimation({ kind: 'fruit_press', processStartTick: 1n, processInputKind: 'must' })).toBeUndefined();
    expect(fruitPressContentsAnimation({ kind: 'fruit_press', processStartTick: 1n })).toBeUndefined();
  });
});
