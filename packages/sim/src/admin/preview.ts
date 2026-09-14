/** JSON-safe values accepted by administration previews and audit payloads. */
export type AdminJsonPrimitive = boolean | null | number | string;

export type AdminJsonValue =
  | AdminJsonPrimitive
  | readonly AdminJsonValue[]
  | { readonly [key: string]: AdminJsonValue };

export interface AdminJsonObject {
  readonly [key: string]: AdminJsonValue;
}

/** A presence wrapper keeps property removal distinct from assigning `null`. */
export interface AdminValueSnapshot {
  readonly present: boolean;
  readonly value?: AdminJsonValue;
}

export interface AdminFieldChange {
  /** RFC 6901 JSON Pointer. The root value is represented by an empty string. */
  readonly path: string;
  readonly before: AdminValueSnapshot;
  readonly after: AdminValueSnapshot;
}

export interface AdminChangePreview {
  readonly changes: readonly AdminFieldChange[];
  readonly truncated: boolean;
}

export interface AdminDiffOptions {
  /** Prevent an unexpectedly large player record from producing an unbounded audit row. */
  readonly maxChanges?: number;
  /** Deep documents become one atomic change after this depth. */
  readonly maxDepth?: number;
}

const DEFAULT_MAX_CHANGES = 256;
const DEFAULT_MAX_DEPTH = 8;

function pointerSegment(key: string): string {
  return key.replaceAll('~', '~0').replaceAll('/', '~1');
}

function snapshot(value: AdminJsonValue | undefined): AdminValueSnapshot {
  return value === undefined ? { present: false } : { present: true, value };
}

function isObject(value: AdminJsonValue | undefined): value is AdminJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jsonEqual(left: AdminJsonValue | undefined, right: AdminJsonValue | undefined): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined || left === null || right === null) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key]));
}

/**
 * Produces a stable, bounded field-level diff for Studio previews and audit rows.
 * Arrays are treated as atomic values so inventory ordering remains explicit.
 */
export function diffAdminValues(
  before: AdminJsonValue | undefined,
  after: AdminJsonValue | undefined,
  options: AdminDiffOptions = {},
): AdminChangePreview {
  const maxChanges = Math.max(1, Math.trunc(options.maxChanges ?? DEFAULT_MAX_CHANGES));
  const maxDepth = Math.max(0, Math.trunc(options.maxDepth ?? DEFAULT_MAX_DEPTH));
  const changes: AdminFieldChange[] = [];
  let truncated = false;

  const visit = (
    left: AdminJsonValue | undefined,
    right: AdminJsonValue | undefined,
    path: string,
    depth: number,
  ): void => {
    if (jsonEqual(left, right)) return;
    if (changes.length >= maxChanges) {
      truncated = true;
      return;
    }
    if (depth < maxDepth && isObject(left) && isObject(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        visit(left[key], right[key], `${path}/${pointerSegment(key)}`, depth + 1);
      }
      return;
    }
    changes.push({ path, before: snapshot(left), after: snapshot(right) });
  };

  visit(before, after, '', 0);
  return { changes, truncated };
}

export function invertAdminChanges(changes: readonly AdminFieldChange[]): readonly AdminFieldChange[] {
  return changes.map(({ path, before, after }) => ({ path, before: after, after: before }));
}

export function adminPreviewHasChanges(preview: AdminChangePreview): boolean {
  return preview.changes.length > 0;
}
