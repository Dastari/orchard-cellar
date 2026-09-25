import { expect, it } from 'vitest';
import { ANVIL_FAILURES, failureToastText, RECIPE_PLACE_FAILURES } from './failure-wording.js';

it('words a recipe placement that cannot clear the grid, within the 42-character toast', () => {
  const text = failureToastText(new Error('container_full'), RECIPE_PLACE_FAILURES);
  expect(text).toBe('NO ROOM TO CLEAR THE CRAFTING GRID');
  expect(text.length).toBeLessThanOrEqual(42);
  // Everywhere else a full container keeps the general wording.
  expect(failureToastText(new Error('container_full'))).toBe('NOT ENOUGH INVENTORY SPACE');
});

it('words a crafting mismatch without claiming the grid holds stray items', () => {
  const text = failureToastText(new Error('recipe_inputs_missing'));
  expect(text).toBe("THE GRID DOESN'T MATCH THE RECIPE");
  expect(text.length).toBeLessThanOrEqual(42);
});

it('keeps the anvil-specific wrong-tool wording only at the anvil', () => {
  expect(failureToastText(new Error('wrong_tool'), ANVIL_FAILURES)).toBe('SELECT A DAMAGED TOOL');
  expect(failureToastText(new Error('wrong_tool'))).toBe('THAT NEEDS A DIFFERENT TOOL');
});

it('words a slot refusal within the 42-character toast', () => {
  // Furnace slots refuse with slot_rejects_item like every other slot; nothing emits a furnace-specific code.
  const text = failureToastText(new Error('slot_rejects_item'));
  expect(text).toBe("THAT ITEM DOESN'T GO IN THAT SLOT");
  expect(text.length).toBeLessThanOrEqual(42);
});
