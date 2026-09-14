export type StudioTableValue = string | number | boolean | bigint | null;
export type StudioTableTone = 'plain' | 'muted' | 'success' | 'warning' | 'danger' | 'code';

export interface StudioTableColumn {
  readonly id: string;
  readonly label: string;
  readonly sortable?: boolean;
  readonly filterable?: boolean;
  readonly editable?: boolean;
  readonly tone?: StudioTableTone;
}

export interface StudioTableRow {
  readonly id: string;
  readonly cells: Readonly<Record<string, StudioTableValue>>;
  readonly errors?: Readonly<Record<string, string>>;
}

export interface StudioTableSort {
  readonly columnId: string;
  readonly direction: 'ascending' | 'descending';
}

export interface StudioTableView {
  readonly columns: readonly StudioTableColumn[];
  readonly rows: readonly StudioTableRow[];
  readonly query: string;
  readonly sort: StudioTableSort | null;
  readonly selectedIds: readonly string[];
  readonly validationCount: number;
  readonly emptyMessage: string | null;
}

function comparable(value: StudioTableValue): string | number | bigint {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null) return '';
  return value;
}

function compareValues(left: StudioTableValue, right: StudioTableValue): number {
  const a = comparable(left);
  const b = comparable(right);
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'bigint' && typeof b === 'bigint') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

export function buildStudioTableView(input: {
  readonly columns: readonly StudioTableColumn[];
  readonly rows: readonly StudioTableRow[];
  readonly query?: string;
  readonly sort?: StudioTableSort | null;
  readonly selectedIds?: readonly string[];
}): StudioTableView {
  if (input.columns.length === 0) throw new RangeError('Studio table requires columns');
  if (new Set(input.columns.map(({ id }) => id)).size !== input.columns.length) {
    throw new TypeError('Duplicate Studio table column id');
  }
  if (new Set(input.rows.map(({ id }) => id)).size !== input.rows.length) {
    throw new TypeError('Duplicate Studio table row id');
  }
  const query = input.query?.trim().toLocaleLowerCase('en') ?? '';
  const filterColumns = input.columns.filter(({ filterable }) => filterable !== false);
  let rows = input.rows.filter((row) => query.length === 0 || filterColumns.some((column) => (
    String(row.cells[column.id] ?? '').toLocaleLowerCase('en').includes(query)
  )));
  const sort = input.sort ?? null;
  if (sort !== null) {
    const column = input.columns.find(({ id }) => id === sort.columnId);
    if (column === undefined || column.sortable !== true) throw new TypeError('Invalid Studio table sort');
    rows = rows.map((row, index) => ({ row, index })).sort((left, right) => {
      const compared = compareValues(left.row.cells[column.id] ?? null, right.row.cells[column.id] ?? null);
      return (sort.direction === 'ascending' ? compared : -compared) || left.index - right.index;
    }).map(({ row }) => row);
  }
  const rowIds = new Set(input.rows.map(({ id }) => id));
  const selectedIds = [...new Set(input.selectedIds ?? [])].filter((id) => rowIds.has(id));
  const validationCount = rows.reduce((count, row) => count + Object.keys(row.errors ?? {}).length, 0);
  return Object.freeze({
    columns: Object.freeze([...input.columns]),
    rows: Object.freeze(rows),
    query,
    sort,
    selectedIds: Object.freeze(selectedIds),
    validationCount,
    emptyMessage: rows.length === 0 ? (query.length === 0 ? 'No rows' : `No rows match “${query}”`) : null,
  });
}

function csvCell(value: StudioTableValue): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function studioTableCsv(view: Pick<StudioTableView, 'columns' | 'rows'>): string {
  return [
    view.columns.map(({ label }) => csvCell(label)).join(','),
    ...view.rows.map((row) => view.columns.map(({ id }) => csvCell(row.cells[id] ?? null)).join(',')),
  ].join('\r\n');
}

/** Pure bulk-edit planner. The shell sends the returned document through its
 * normal validation/undo path; this package never mutates caller-owned rows. */
export function applyStudioTableBulkEdit(
  view: StudioTableView,
  columnId: string,
  value: StudioTableValue,
): readonly StudioTableRow[] {
  const column = view.columns.find(({ id }) => id === columnId);
  if (column?.editable !== true) throw new TypeError(`Studio table column is not editable: ${columnId}`);
  const selected = new Set(view.selectedIds);
  return Object.freeze(view.rows.map((row) => selected.has(row.id)
    ? Object.freeze({ ...row, cells: Object.freeze({ ...row.cells, [columnId]: value }) })
    : row));
}

export const STUDIO_TABLE_CLASSES = Object.freeze({
  root: 'orchard-studio-table',
  toolbar: 'orchard-studio-table__toolbar',
  header: 'orchard-studio-table__header',
  row: 'orchard-studio-table__row',
  cell: 'orchard-studio-table__cell',
  invalid: 'is-invalid',
  selected: 'is-selected',
});
