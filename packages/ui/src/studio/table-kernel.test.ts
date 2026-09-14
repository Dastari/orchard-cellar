import { describe, expect, it } from 'vitest';
import { applyStudioTableBulkEdit, buildStudioTableView, studioTableCsv } from './table-kernel.js';

const columns = [
  { id: 'name', label: 'Name', sortable: true, editable: true },
  { id: 'kind', label: 'Kind', sortable: true },
  { id: 'count', label: 'Count', sortable: true, filterable: false },
] as const;

const rows = [
  { id: 'b', cells: { name: 'Lamp, Oil', kind: 'item', count: 2 } },
  { id: 'a', cells: { name: 'Apple', kind: 'item', count: 10 }, errors: { count: 'Too many' } },
  { id: 'c', cells: { name: 'Furnace', kind: 'object', count: 1 } },
] as const;

describe('Studio table kernel skin model', () => {
  it('filters selected columns, stably sorts typed rows, and counts inline validation', () => {
    const view = buildStudioTableView({
      columns,
      rows,
      query: 'item',
      sort: { columnId: 'count', direction: 'descending' },
      selectedIds: ['a', 'missing', 'a'],
    });
    expect(view.rows.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(view.selectedIds).toEqual(['a']);
    expect(view.validationCount).toBe(1);
  });

  it('exports the current view as escaped CSV', () => {
    const view = buildStudioTableView({ columns, rows, sort: { columnId: 'name', direction: 'ascending' } });
    expect(studioTableCsv(view)).toBe([
      'Name,Kind,Count',
      'Apple,item,10',
      'Furnace,object,1',
      '"Lamp, Oil",item,2',
    ].join('\r\n'));
  });

  it('plans immutable bulk edits only for selected rows and editable columns', () => {
    const view = buildStudioTableView({ columns, rows, selectedIds: ['a', 'c'] });
    const edited = applyStudioTableBulkEdit(view, 'name', 'Reviewed');
    expect(edited.map(({ cells }) => cells.name)).toEqual(['Lamp, Oil', 'Reviewed', 'Reviewed']);
    expect(rows[1].cells.name).toBe('Apple');
    expect(() => applyStudioTableBulkEdit(view, 'kind', 'retired')).toThrow(/not editable/u);
  });

  it('rejects duplicate columns/rows and invalid sort contracts', () => {
    expect(() => buildStudioTableView({ columns: [...columns, columns[0]], rows })).toThrow(/column/u);
    expect(() => buildStudioTableView({ columns, rows: [...rows, rows[0]] })).toThrow(/row/u);
    expect(() => buildStudioTableView({ columns, rows, sort: { columnId: 'missing', direction: 'ascending' } }))
      .toThrow(/sort/u);
  });
});
