import { describe, expect, it } from 'vitest';
import { accountPointerAction } from './account-actions.js';

describe('account pointer actions', () => {
  it('makes both authenticated account buttons interactive', () => {
    expect(accountPointerAction(true, 240, 158)).toBe('enter-world');
    expect(accountPointerAction(true, 240, 187)).toBe('sign-out');
    expect(accountPointerAction(true, 120, 153)).toBeNull();
  });

  it('keeps unauthenticated account actions on their rendered hit areas', () => {
    expect(accountPointerAction(false, 167, 153)).toBe('sign-in');
    expect(accountPointerAction(false, 313, 153)).toBe('register');
    expect(accountPointerAction(false, 240, 184)).toBe('recover');
    expect(accountPointerAction(false, 240, 210)).toBeNull();
  });
});
