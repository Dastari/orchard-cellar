import type { StudioOutlinerNode } from '../../shell/outliners.js';

export const MAP_OUTLINER_QUERY_MAX_LENGTH = 80;
export const MAP_OUTLINER_SESSION_VERSION = 1 as const;

export interface MapOutlinerTreeState {
  readonly version: typeof MAP_OUTLINER_SESSION_VERSION;
  readonly query: string;
  readonly expandedIds: readonly string[];
  readonly focusedId: string | null;
  readonly selectedId: string | null;
}

export interface MapOutlinerTreeRow {
  readonly node: StudioOutlinerNode;
  readonly depth: number;
  readonly parentId: string | null;
  readonly expanded: boolean;
  readonly forcedExpanded: boolean;
  readonly matched: boolean;
}

export type MapOutlinerTreeKey =
  | 'ArrowDown'
  | 'ArrowUp'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'Enter'
  | ' ';

export interface MapOutlinerTreeKeyResult {
  readonly state: MapOutlinerTreeState;
  readonly effect: 'none' | 'activate';
  readonly activatedId: string | null;
}

interface IndexedNode {
  readonly node: StudioOutlinerNode;
  readonly parentId: string | null;
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/gu, ' ').slice(0, MAP_OUTLINER_QUERY_MAX_LENGTH);
}

function queryTokens(query: string): readonly string[] {
  return normalizeQuery(query).toLocaleLowerCase('en').split(' ').filter(Boolean);
}

function nodeMatches(node: StudioOutlinerNode, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const source = `${node.label} ${node.id}`.toLocaleLowerCase('en');
  return tokens.every((token) => source.includes(token));
}

/** Indexes only the first occurrence of an id and stops at cyclic references.
 * Authored trees are acyclic by construction; this guard keeps corrupt inputs
 * from making the Canvas projection recurse forever. */
function indexTree(nodes: readonly StudioOutlinerNode[]): ReadonlyMap<string, IndexedNode> {
  const indexed = new Map<string, IndexedNode>();
  const visit = (node: StudioOutlinerNode, parentId: string | null, ancestors: ReadonlySet<object>): void => {
    if (indexed.has(node.id) || ancestors.has(node)) return;
    indexed.set(node.id, { node, parentId });
    const nextAncestors = new Set(ancestors).add(node);
    node.children.forEach((child) => visit(child, node.id, nextAncestors));
  };
  nodes.forEach((node) => visit(node, null, new Set()));
  return indexed;
}

function orderedExpandableIds(nodes: readonly StudioOutlinerNode[]): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const visit = (node: StudioOutlinerNode): void => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    if (node.children.length > 0) ids.push(node.id);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
}

function withNormalizedState(
  nodes: readonly StudioOutlinerNode[],
  input: Partial<Omit<MapOutlinerTreeState, 'version'>>,
): MapOutlinerTreeState {
  const indexed = indexTree(nodes);
  const expandable = new Set(orderedExpandableIds(nodes));
  const requestedExpanded = new Set(input.expandedIds ?? []);
  const expandedIds = [...expandable].filter((id) => requestedExpanded.has(id));
  const query = normalizeQuery(input.query ?? '');
  const selectedId = input.selectedId !== null && input.selectedId !== undefined
    && indexed.has(input.selectedId) ? input.selectedId : null;
  const provisional: MapOutlinerTreeState = Object.freeze({
    version: MAP_OUTLINER_SESSION_VERSION,
    query,
    expandedIds: Object.freeze(expandedIds),
    focusedId: null,
    selectedId,
  });
  const rows = mapOutlinerTreeRows(nodes, provisional);
  const visible = new Set(rows.map(({ node }) => node.id));
  const requestedFocus = input.focusedId !== null && input.focusedId !== undefined
    && visible.has(input.focusedId) ? input.focusedId : null;
  const focusedId = requestedFocus
    ?? (selectedId !== null && visible.has(selectedId) ? selectedId : rows[0]?.node.id ?? null);
  return Object.freeze({ ...provisional, focusedId });
}

export function createMapOutlinerTreeState(
  nodes: readonly StudioOutlinerNode[],
  input: Partial<Omit<MapOutlinerTreeState, 'version'>> = {},
): MapOutlinerTreeState {
  return withNormalizedState(nodes, input);
}

/** Builds the sole visible-row projection used by drawing, pointer hit tests,
 * focus and keyboard movement. Search reveals matching ancestor paths without
 * mutating the user's stored expansion choices. A matching branch label keeps
 * its descendants visible so searches such as "World Objects" remain useful. */
export function mapOutlinerTreeRows(
  nodes: readonly StudioOutlinerNode[],
  state: Pick<MapOutlinerTreeState, 'query' | 'expandedIds'>,
): readonly MapOutlinerTreeRow[] {
  const tokens = queryTokens(state.query);
  const filtering = tokens.length > 0;
  const expanded = new Set(state.expandedIds);
  const included = new Set<string>();
  const matched = new Set<string>();
  const childCache = new Map<string, readonly StudioOutlinerNode[]>();
  const seen = new Set<string>();

  const filter = (node: StudioOutlinerNode, ancestorMatched: boolean): boolean => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    const selfMatched = nodeMatches(node, tokens);
    if (selfMatched) matched.add(node.id);
    const includeWholeBranch = ancestorMatched || selfMatched;
    const children = node.children.filter((child) => filter(child, includeWholeBranch));
    childCache.set(node.id, children);
    if (!filtering || includeWholeBranch || children.length > 0) {
      included.add(node.id);
      return true;
    }
    return false;
  };
  nodes.forEach((node) => filter(node, false));

  const rows: MapOutlinerTreeRow[] = [];
  const flattened = new Set<string>();
  const append = (node: StudioOutlinerNode, depth: number, parentId: string | null): void => {
    if (!included.has(node.id) || flattened.has(node.id)) return;
    flattened.add(node.id);
    const visibleChildren = childCache.get(node.id) ?? [];
    const forcedExpanded = filtering && visibleChildren.length > 0;
    const isExpanded = visibleChildren.length > 0 && (forcedExpanded || expanded.has(node.id));
    rows.push(Object.freeze({
      node,
      depth,
      parentId,
      expanded: isExpanded,
      forcedExpanded,
      matched: matched.has(node.id),
    }));
    if (isExpanded) visibleChildren.forEach((child) => append(child, depth + 1, node.id));
  };
  nodes.forEach((node) => append(node, 0, null));
  return Object.freeze(rows);
}

export function setMapOutlinerQuery(
  nodes: readonly StudioOutlinerNode[],
  state: MapOutlinerTreeState,
  query: string,
): MapOutlinerTreeState {
  return withNormalizedState(nodes, { ...state, query, focusedId: state.selectedId });
}

function toggleExpanded(state: MapOutlinerTreeState, id: string, expand: boolean): MapOutlinerTreeState {
  const expanded = new Set(state.expandedIds);
  if (expand) expanded.add(id);
  else expanded.delete(id);
  return Object.freeze({ ...state, expandedIds: Object.freeze([...expanded]) });
}

export function applyMapOutlinerTreeKey(
  nodes: readonly StudioOutlinerNode[],
  input: MapOutlinerTreeState,
  key: MapOutlinerTreeKey,
): MapOutlinerTreeKeyResult {
  let state = withNormalizedState(nodes, input);
  let rows = mapOutlinerTreeRows(nodes, state);
  if (rows.length === 0) return Object.freeze({ state, effect: 'none', activatedId: null });
  let index = Math.max(0, rows.findIndex(({ node }) => node.id === state.focusedId));
  const current = rows[index]!;
  let effect: MapOutlinerTreeKeyResult['effect'] = 'none';
  let activatedId: string | null = null;

  if (key === 'ArrowDown') index = Math.min(rows.length - 1, index + 1);
  else if (key === 'ArrowUp') index = Math.max(0, index - 1);
  else if (key === 'Home') index = 0;
  else if (key === 'End') index = rows.length - 1;
  else if (key === 'ArrowRight' && current.node.children.length > 0) {
    if (!current.expanded && !current.forcedExpanded) {
      state = toggleExpanded(state, current.node.id, true);
      rows = mapOutlinerTreeRows(nodes, state);
      index = rows.findIndex(({ node }) => node.id === current.node.id);
    } else if (rows[index + 1]?.parentId === current.node.id) index += 1;
  } else if (key === 'ArrowLeft') {
    if (current.expanded && !current.forcedExpanded) {
      state = toggleExpanded(state, current.node.id, false);
      rows = mapOutlinerTreeRows(nodes, state);
      index = rows.findIndex(({ node }) => node.id === current.node.id);
    } else if (current.parentId !== null) {
      index = rows.findIndex(({ node }) => node.id === current.parentId);
    }
  } else if (key === ' ' && current.node.children.length > 0 && !current.forcedExpanded) {
    state = toggleExpanded(state, current.node.id, !current.expanded);
    rows = mapOutlinerTreeRows(nodes, state);
    index = rows.findIndex(({ node }) => node.id === current.node.id);
  } else if (key === 'Enter' || key === ' ') {
    effect = 'activate';
    activatedId = current.node.id;
    state = Object.freeze({ ...state, selectedId: current.node.id });
  }

  const focusedId = rows[Math.max(0, index)]?.node.id ?? null;
  // Re-normalization orders expanded ids by the source tree even when a child
  // was restored open before its parent. Serialized sessions are therefore
  // deterministic regardless of the user's key sequence.
  state = withNormalizedState(nodes, { ...state, focusedId });
  return Object.freeze({ state, effect, activatedId });
}

export function serializeMapOutlinerTreeState(state: MapOutlinerTreeState): string {
  return JSON.stringify({
    version: MAP_OUTLINER_SESSION_VERSION,
    query: normalizeQuery(state.query),
    expandedIds: [...state.expandedIds],
    focusedId: state.focusedId,
    selectedId: state.selectedId,
  });
}

/** Parses the bounded, document-independent portion of retained Outliner
 * state. A later `createMapOutlinerTreeState` call reconciles ids against the
 * current authored tree, so stale document nodes are never resurrected. */
export function parseMapOutlinerTreeState(value: unknown): MapOutlinerTreeState | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate['version'] !== MAP_OUTLINER_SESSION_VERSION
    || typeof candidate['query'] !== 'string'
    || candidate['query'].length > MAP_OUTLINER_QUERY_MAX_LENGTH
    || !Array.isArray(candidate['expandedIds'])
    || candidate['expandedIds'].length > 256
    || candidate['expandedIds'].some((id) => typeof id !== 'string' || id.length > 160)
    || !(candidate['focusedId'] === null || (typeof candidate['focusedId'] === 'string'
      && candidate['focusedId'].length <= 160))
    || !(candidate['selectedId'] === null || (typeof candidate['selectedId'] === 'string'
      && candidate['selectedId'].length <= 160))) return null;
  return Object.freeze({
    version: MAP_OUTLINER_SESSION_VERSION,
    query: normalizeQuery(candidate['query']),
    expandedIds: Object.freeze([...(candidate['expandedIds'] as string[])]),
    focusedId: candidate['focusedId'] as string | null,
    selectedId: candidate['selectedId'] as string | null,
  });
}

/** Restores authored Outliner UI state only. Callers intentionally keep Live
 * Outliner rows ephemeral because authority ids may disappear between sessions. */
export function restoreMapOutlinerTreeState(
  nodes: readonly StudioOutlinerNode[],
  source: string | null,
): MapOutlinerTreeState {
  if (source === null) return createMapOutlinerTreeState(nodes);
  try {
    const value = parseMapOutlinerTreeState(JSON.parse(source));
    if (value === null) return createMapOutlinerTreeState(nodes);
    return createMapOutlinerTreeState(nodes, {
      query: value.query,
      expandedIds: value.expandedIds,
      focusedId: value.focusedId,
      selectedId: value.selectedId,
    });
  } catch {
    return createMapOutlinerTreeState(nodes);
  }
}
