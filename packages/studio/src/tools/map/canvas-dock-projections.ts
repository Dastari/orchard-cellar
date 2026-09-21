import type { StudioInspectorGroupModel, StudioPropertyRowModel } from '@orchard/ui/studio';
import type { StudioOutlinerNode } from '../../shell/outliners.js';
import type { StudioSelection } from '../../shell/selection.js';

export type MapCanvasOutlinerKind = 'space' | 'group' | 'entity';

export interface MapCanvasOutlinerRow {
  readonly id: string;
  readonly label: string;
  readonly kind: MapCanvasOutlinerKind;
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly layerId: string | null;
  readonly selection: StudioSelection | null;
}

function layerIdForNode(node: StudioOutlinerNode, inherited: string | null): string | null {
  if (node.kind !== 'group') return inherited;
  const marker = ':layer:';
  const index = node.id.indexOf(marker);
  return index < 0 ? inherited : node.id.slice(index + marker.length);
}

/** Flattens only expanded branches, preserving the source's stable ordering.
 * Canvas callers can window this list without constructing hidden entity rows. */
export function mapCanvasOutlinerRows(
  nodes: readonly StudioOutlinerNode[],
  expandedIds: ReadonlySet<string>,
): readonly MapCanvasOutlinerRow[] {
  const rows: MapCanvasOutlinerRow[] = [];
  const append = (node: StudioOutlinerNode, depth: number, inheritedLayer: string | null): void => {
    const layerId = layerIdForNode(node, inheritedLayer);
    const expandable = node.children.length > 0;
    const expanded = expandable && expandedIds.has(node.id);
    rows.push(Object.freeze({
      id: node.id,
      label: node.label,
      kind: node.kind,
      depth,
      expandable,
      expanded,
      layerId,
      selection: node.selection ?? null,
    }));
    if (expanded) node.children.forEach((child) => append(child, depth + 1, layerId));
  };
  nodes.forEach((node) => append(node, 0, null));
  return Object.freeze(rows);
}

export interface MapCanvasInspectorRow {
  readonly id: string;
  readonly label: string;
  readonly heading: boolean;
  readonly danger: boolean;
  /** Present only for the value row. Canvas may offer a tool-owned action
   * after validating its opaque declaration; WHY rows and headings never
   * become mutation affordances. */
  readonly property: StudioPropertyRowModel | null;
}

function propertyValue(value: string | number | boolean | null): string {
  if (value === null) return 'NONE';
  return String(value).replaceAll('_', ' ').toUpperCase();
}

/** Lossless, read-only Canvas projection of the schema Inspector kernel. Each
 * property keeps its type, value, pin/reset/error/read-only state and why help;
 * mutation stays with the owning tool model rather than being approximated. */
export function mapCanvasInspectorRows(
  groups: readonly StudioInspectorGroupModel[],
): readonly MapCanvasInspectorRow[] {
  return Object.freeze(groups.flatMap((group) => [
    Object.freeze({
      id: `group-${group.id}`,
      label: `${group.label.toUpperCase()} · ${group.rows.length} FIELDS`
        + `${group.errorCount === 0 ? '' : ` · ${group.errorCount} ERRORS`}`
        + `${group.pinnedCount === 0 ? '' : ` · ${group.pinnedCount} PINNED`}`,
      heading: true,
      danger: group.errorCount > 0,
      property: null,
    }),
    ...group.rows.flatMap((row) => {
      const flags = [row.kind.toUpperCase(), row.readOnly === true || row.action === undefined
        ? 'READ ONLY' : 'ACTION',
        row.pinned === true ? 'PINNED' : null, row.canReset ? 'RESET AVAILABLE' : null,
        row.error === undefined ? null : `ERROR ${row.error}`].filter((flag): flag is string => flag !== null);
      return [
        Object.freeze({
          id: `property-${row.id}`,
          label: `${row.label.toUpperCase()}  ${propertyValue(row.value)} · ${flags.join(' · ')}`,
          heading: false,
          danger: row.error !== undefined,
          property: row,
        }),
        Object.freeze({
          id: `why-${row.id}`,
          label: `WHY  ${row.why}`,
          heading: false,
          danger: false,
          property: null,
        }),
      ];
    }),
  ]));
}
