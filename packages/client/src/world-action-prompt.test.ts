import { expect, it } from 'vitest';
import { worldActionPrompt } from './world-action-prompt.js';

it.each(['[F] EAT APPLE', '[F] PLACE TORCH', '[F] TILL SOIL', '[F] REPAIR TOOL'])('keeps picking available beside %s', hint => {
  expect(worldActionPrompt('[E] PICK APPLE', hint)).toBe(`[E] PICK APPLE  ${hint}`);
});
it('uses the selected E target instead of an unrelated farming hint', () => {
  expect(worldActionPrompt('[E] PICK APPLE', '[E] HARVEST CARROT')).toBe('[E] PICK APPLE');
});
it('shows only the winning F action when a nearby object also advertises F', () => {
  expect(worldActionPrompt('[E] OPEN CHEST  [F] PICK UP', '[F] EAT APPLE')).toBe('[E] OPEN CHEST  [F] EAT APPLE');
});
it('retains tree status and handles absent or identical hints', () => {
  expect(worldActionPrompt('FRUIT RIPENING - 1:01', '[F] EAT APPLE')).toBe('FRUIT RIPENING - 1:01  [F] EAT APPLE');
  expect(worldActionPrompt(null, '[F] EAT APPLE')).toBe('[F] EAT APPLE');
  expect(worldActionPrompt('[E] PICK APPLE', null)).toBe('[E] PICK APPLE');
  expect(worldActionPrompt('[E] PICK APPLE', '[E] PICK APPLE')).toBe('[E] PICK APPLE');
  expect(worldActionPrompt(null, null)).toBeNull();
});
it('preserves a contextual secondary action without duplicating E', () => {
  expect(worldActionPrompt('[E] OPEN CHEST', '[E] OPEN CHEST  [F] BREAK WITH AXE')).toBe('[E] OPEN CHEST  [F] BREAK WITH AXE');
});

it('does not repeat a tree status when the contextual prompt already includes it', () => {
  expect(worldActionPrompt('FRUIT RIPENING - 1:01', 'FRUIT RIPENING - 1:01  [F] EQUIP TORCH'))
    .toBe('FRUIT RIPENING - 1:01  [F] EQUIP TORCH');
});
