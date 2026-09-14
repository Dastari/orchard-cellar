import { STUDIO_DOCK_CONTRACTS, studioDockFrame, studioTabStrip, type StudioDockFrameModel, type StudioUiScale } from './docks.js';
import { studioInspectorGroups, type StudioInspectorGroupModel } from './inspector.js';
import { buildStudioRailModel, type StudioRailModel } from './rail.js';
import { buildStudioTableView, type StudioTableView } from './table-kernel.js';

export interface StudioUiLabSpecimen {
  readonly id: string;
  readonly contractId: StudioDockFrameModel['id'];
  readonly uiScale: StudioUiScale;
  readonly dock: StudioDockFrameModel;
  readonly tabs: ReturnType<typeof studioTabStrip>;
  readonly inspector: readonly StudioInspectorGroupModel[];
  readonly table: StudioTableView;
  readonly anonymousState: 'interactive' | 'read_only';
}

export interface StudioUiLabModel {
  readonly title: 'Orchard Studio UI Lab';
  readonly deterministicVersion: 1;
  readonly sessionKind: 'anonymous_static';
  readonly rail: StudioRailModel;
  readonly scales: readonly StudioUiScale[];
  readonly referenceNeighbours: readonly ['Map Editor rail', 'wood/parchment canvas frames', 'Item Studio DOM table'];
  readonly specimens: readonly StudioUiLabSpecimen[];
}

const SCALES = [1, 2, 3] as const satisfies readonly StudioUiScale[];

function sampleInspector(): readonly StudioInspectorGroupModel[] {
  return studioInspectorGroups([
    { id: 'display_name', label: 'Display name', component: 'identity', kind: 'text', value: 'Apple Press', defaultValue: 'Press', why: 'Shown in prompts and the World Outliner.', pinned: true },
    { id: 'definition_id', label: 'Definition', component: 'identity', kind: 'readonly', value: 'object:apple_press', why: 'Stable references cannot be renamed.', readOnly: true },
    { id: 'capacity', label: 'Capacity', component: 'processor', kind: 'number', value: 8, defaultValue: 8, why: 'Bounds input accepted by the processor.' },
    { id: 'station', label: 'Station kind', component: 'processor', kind: 'select', value: 'press', options: ['press', 'furnace', 'barrel'], why: 'Resolves the authored process registry.', error: 'Example inline validation' },
  ]);
}

function sampleTable(): StudioTableView {
  return buildStudioTableView({
    columns: [
      { id: 'name', label: 'Name', sortable: true, filterable: true, editable: true },
      { id: 'kind', label: 'Kind', sortable: true, filterable: true, tone: 'code' },
      { id: 'state', label: 'State', sortable: true, filterable: true },
    ],
    rows: [
      { id: 'apple_press', cells: { name: 'Apple Press', kind: 'object', state: 'Draft' } },
      { id: 'furnace', cells: { name: 'Furnace', kind: 'object', state: 'Live' } },
      { id: 'oil_lamp', cells: { name: 'Oil Lamp', kind: 'item', state: 'Invalid' }, errors: { state: 'Missing sell price' } },
    ],
    sort: { columnId: 'name', direction: 'ascending' },
    selectedIds: ['apple_press'],
  });
}

export function buildStudioUiLabModel(): StudioUiLabModel {
  const specimens = SCALES.flatMap((uiScale) => STUDIO_DOCK_CONTRACTS.map((contract) => Object.freeze({
    id: `${contract.id}@${uiScale}x`,
    contractId: contract.id,
    uiScale,
    dock: studioDockFrame(contract.id, uiScale, contract.anonymous ? [] : ['readonly']),
    tabs: studioTabStrip([
      { id: 'local', label: 'Local', badge: 'draft' },
      { id: 'live', label: 'Live', disabled: !contract.anonymous, tooltip: contract.anonymous ? 'Compare against the connected head' : 'Connect to inspect live authority' },
    ], 'local'),
    inspector: sampleInspector(),
    table: sampleTable(),
    anonymousState: contract.anonymous ? 'interactive' : 'read_only',
  } satisfies StudioUiLabSpecimen)));
  return Object.freeze({
    title: 'Orchard Studio UI Lab',
    deterministicVersion: 1,
    sessionKind: 'anonymous_static',
    rail: buildStudioRailModel({
      expanded: true,
      activeMode: 'build',
      session: {
        environment: 'anonymous', identity: null, role: null,
        contentRevision: null, mapRevision: null, connected: false,
      },
      modeBadges: { build: ['draft'], author: ['validation'] },
    }),
    scales: SCALES,
    referenceNeighbours: ['Map Editor rail', 'wood/parchment canvas frames', 'Item Studio DOM table'] as const,
    specimens: Object.freeze(specimens),
  });
}

function escapeHtml(value: unknown): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Server/build-time friendly catalogue rendering: no document, window,
 * identity, live adapter, or asset fetch is required. */
export function renderStudioUiLabHtml(model = buildStudioUiLabModel()): string {
  const specimens = model.specimens.map((specimen) => {
    const badges = specimen.dock.badges.map((badge) => (
      `<span class="orchard-studio-badge orchard-studio-badge--${badge.tone}">${escapeHtml(badge.shortLabel)}</span>`
    )).join('');
    const tabs = specimen.tabs.map((tab) => (
      `<button class="orchard-studio-tab" role="tab" aria-selected="${tab.ariaSelected}" tabindex="${tab.tabIndex}"${tab.disabled === true ? ' disabled' : ''} title="${escapeHtml(tab.tooltip ?? tab.label)}">${escapeHtml(tab.label)}</button>`
    )).join('');
    const rows = specimen.table.rows.map((row) => (
      `<tr class="orchard-studio-table__row${specimen.table.selectedIds.includes(row.id) ? ' is-selected' : ''}">${specimen.table.columns.map((column) => `<td class="orchard-studio-table__cell${row.errors?.[column.id] === undefined ? '' : ' is-invalid'}">${escapeHtml(row.cells[column.id] ?? '')}</td>`).join('')}</tr>`
    )).join('');
    return `<article id="${escapeHtml(specimen.id)}" data-contract="${specimen.contractId}" data-ui-scale="${specimen.uiScale}" data-anonymous-state="${specimen.anonymousState}" class="${specimen.dock.classes.join(' ')}"><header><h2>${escapeHtml(specimen.dock.title)}</h2>${badges}</header><nav class="orchard-studio-tabs" role="tablist">${tabs}</nav><p>${escapeHtml(specimen.dock.description)}</p><table class="orchard-studio-table"><thead><tr class="orchard-studio-table__header">${specimen.table.columns.map((column) => `<th class="orchard-studio-table__cell">${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></article>`;
  }).join('');
  return `<section class="orchard-studio orchard-studio-ui-lab" data-version="${model.deterministicVersion}"><h1>${model.title}</h1>${specimens}</section>`;
}
