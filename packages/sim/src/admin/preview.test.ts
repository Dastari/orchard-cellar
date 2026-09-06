import { describe, expect, it } from 'vitest';
import {
  adminPreviewHasChanges,
  diffAdminValues,
  invertAdminChanges,
} from './preview.js';

describe('administration change previews', () => {
  it('returns stable JSON Pointer paths and distinguishes removal from null', () => {
    const preview = diffAdminValues(
      { displayName: 'Pip', profile: { note: null, title: 'Farmer' }, wallet: 100 },
      { displayName: 'Pip', profile: { note: null }, wallet: 140 },
    );

    expect(preview).toEqual({
      changes: [
        {
          path: '/profile/title',
          before: { present: true, value: 'Farmer' },
          after: { present: false },
        },
        {
          path: '/wallet',
          before: { present: true, value: 100 },
          after: { present: true, value: 140 },
        },
      ],
      truncated: false,
    });
  });

  it('escapes pointer segments and treats ordered slot arrays atomically', () => {
    const preview = diffAdminValues(
      { 'slot/by~id': [{ itemKind: 'wood', quantity: 1 }] },
      { 'slot/by~id': [{ itemKind: 'wood', quantity: 2 }] },
    );

    expect(preview.changes).toEqual([expect.objectContaining({ path: '/slot~1by~0id' })]);
  });

  it('bounds audit growth and marks a truncated preview', () => {
    const preview = diffAdminValues(
      { a: 0, b: 0, c: 0 },
      { a: 1, b: 1, c: 1 },
      { maxChanges: 2 },
    );

    expect(preview.changes).toHaveLength(2);
    expect(preview.truncated).toBe(true);
  });

  it('builds an exact inverse without mutating the original preview', () => {
    const preview = diffAdminValues({ wallet: 100 }, { wallet: 140 });
    const inverse = invertAdminChanges(preview.changes);

    expect(inverse).toEqual([{
      path: '/wallet',
      before: { present: true, value: 140 },
      after: { present: true, value: 100 },
    }]);
    expect(adminPreviewHasChanges(preview)).toBe(true);
    expect(adminPreviewHasChanges(diffAdminValues({ wallet: 100 }, { wallet: 100 }))).toBe(false);
  });
});
