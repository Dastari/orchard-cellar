import { describe, expect, it } from 'vitest';
import { studioInspectorGroups, studioPropertyRow } from './studio-models.js';

describe('Studio inspector model', () => {
  it('derives reset/pin state and groups rows by component', () => {
    const row = studioPropertyRow({
      id: 'radius', label: 'Radius', component: 'light', kind: 'number',
      value: 4, defaultValue: 3, why: 'Controls the authored light reach.', pinned: true,
    });
    expect(row).toMatchObject({ changed: true, canReset: true, pinLabel: 'Unpin Radius' });
    const groups = studioInspectorGroups([
      { id: 'radius', label: 'Radius', component: 'light', kind: 'number', value: 4, why: 'Light reach.', error: 'Too large' },
      { id: 'tint', label: 'Tint', component: 'light', kind: 'text', value: 'warm', why: 'Light tint.', pinned: true },
    ]);
    expect(groups[0]).toMatchObject({ id: 'light', label: 'Light', errorCount: 1, pinnedCount: 1 });
  });

  it('rejects duplicate ids, missing help and empty selects', () => {
    const base = { id: 'a', label: 'A', component: 'c', kind: 'text' as const, value: '', why: 'Help.' };
    expect(() => studioInspectorGroups([base, base])).toThrow(/Duplicate/u);
    expect(() => studioPropertyRow({ ...base, why: ' ' })).toThrow(/why help/u);
    expect(() => studioPropertyRow({ ...base, kind: 'select' })).toThrow(/options/u);
  });
});
