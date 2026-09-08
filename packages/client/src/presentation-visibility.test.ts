import { expect, it } from 'vitest';
import { observePresentationVisibility } from './presentation-visibility.js';

it('resets on hide and resume, and removes its listener when disposed', () => {
  const target = new EventTarget(); let resets = 0;
  const dispose = observePresentationVisibility(target, () => { resets++; });
  target.dispatchEvent(new Event('visibilitychange'));
  target.dispatchEvent(new Event('visibilitychange'));
  expect(resets).toBe(2);
  dispose(); dispose(); target.dispatchEvent(new Event('visibilitychange'));
  expect(resets).toBe(2);
});
