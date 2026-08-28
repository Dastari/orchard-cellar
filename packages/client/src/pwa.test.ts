import { describe, expect, it } from 'vitest';
import { pwaUpdateLabel } from './pwa.js';

describe('PWA update presentation', () => {
  it('keeps update activation explicit and gives every lifecycle state a concise menu label', () => {
    expect(pwaUpdateLabel('current')).toBe('CHECK UPDATE');
    expect(pwaUpdateLabel('available')).toBe('UPDATE');
    expect(pwaUpdateLabel('updating')).toBe('UPDATING');
    expect(pwaUpdateLabel('error')).toBe('RETRY UPDATE');
    expect(pwaUpdateLabel('unsupported')).toBe('WEB VERSION');
  });
});
