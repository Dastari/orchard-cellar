import type { StudioDockId, StudioDockPlacement, StudioMode } from './studio-models.js';

export const STUDIO_LAYOUT_VERSION = 1;
export const STUDIO_LAYOUT_STORAGE_KEY = 'orchard.studio.layouts:v1';

export interface StudioDockLayoutItem {
  readonly id: StudioDockId;
  readonly placement: StudioDockPlacement;
  readonly order: number;
  readonly size: number;
  readonly collapsed: boolean;
}

export interface StudioNamedLayout {
  readonly version: 1;
  readonly name: string;
  readonly mode: StudioMode;
  readonly docks: readonly StudioDockLayoutItem[];
  readonly workspace: StudioWorkspaceLayout;
}

export interface StudioWorkspaceLayout {
  readonly direction: 'horizontal' | 'vertical';
  readonly primaryRoute: string | null;
  readonly secondaryRoute: string | null;
  readonly ratio: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEFAULT_DOCKS: Readonly<Record<StudioMode, readonly StudioDockLayoutItem[]>> = {
  build: [
    { id: 'world_outliner', placement: 'left', order: 0, size: 260, collapsed: false },
    { id: 'live_outliner', placement: 'left', order: 1, size: 260, collapsed: false },
    { id: 'inspector', placement: 'right', order: 0, size: 310, collapsed: false },
    { id: 'validation', placement: 'bottom', order: 0, size: 170, collapsed: false },
  ],
  author: [
    { id: 'content_browser', placement: 'left', order: 0, size: 280, collapsed: false },
    { id: 'inspector', placement: 'right', order: 0, size: 330, collapsed: false },
    { id: 'validation', placement: 'bottom', order: 0, size: 170, collapsed: false },
  ],
  operate: [
    { id: 'live_outliner', placement: 'left', order: 0, size: 300, collapsed: false },
    { id: 'inspector', placement: 'right', order: 0, size: 350, collapsed: false },
    { id: 'audit_tail', placement: 'bottom', order: 0, size: 200, collapsed: false },
  ],
  observe: [
    { id: 'live_outliner', placement: 'left', order: 0, size: 280, collapsed: false },
    { id: 'telemetry', placement: 'bottom', order: 0, size: 220, collapsed: false },
    { id: 'console', placement: 'bottom', order: 1, size: 220, collapsed: false },
  ],
};

function validDock(value: unknown): value is StudioDockLayoutItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<StudioDockLayoutItem>;
  return typeof item.id === 'string' && typeof item.placement === 'string'
    && Number.isSafeInteger(item.order) && typeof item.size === 'number'
    && Number.isFinite(item.size) && typeof item.collapsed === 'boolean';
}

function normalizedLayoutName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/gu, ' ');
  return name.length >= 1 && name.length <= 64 ? name : null;
}

function parseWorkspace(value: unknown): StudioWorkspaceLayout {
  if (typeof value !== 'object' || value === null) {
    return Object.freeze({ direction: 'horizontal', primaryRoute: null, secondaryRoute: null, ratio: 0.5 });
  }
  const candidate = value as Partial<StudioWorkspaceLayout>;
  const route = (input: unknown): string | null => typeof input === 'string' && input.startsWith('/') ? input : null;
  const ratio = typeof candidate.ratio === 'number' && Number.isFinite(candidate.ratio)
    ? Math.max(0.2, Math.min(0.8, candidate.ratio)) : 0.5;
  return Object.freeze({
    direction: candidate.direction === 'vertical' ? 'vertical' : 'horizontal',
    primaryRoute: route(candidate.primaryRoute), secondaryRoute: route(candidate.secondaryRoute), ratio,
  });
}

function parseLayout(value: unknown): StudioNamedLayout | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { version?: unknown; name?: unknown; mode?: unknown; docks?: unknown };
  const name = normalizedLayoutName(candidate.name);
  if (name === null || !['build', 'author', 'operate', 'observe'].includes(String(candidate.mode))) return null;
  if (!Array.isArray(candidate.docks)) return null;
  const docks = candidate.version === 0
    ? candidate.docks.map((id, order) => ({ id, placement: id === 'validation' ? 'bottom' : id === 'inspector' ? 'right' : 'left', order, size: 260, collapsed: false }))
    : candidate.docks;
  if (!docks.every(validDock)) return null;
  const workspace = 'workspace' in candidate
    ? parseWorkspace((candidate as { workspace?: unknown }).workspace)
    : parseWorkspace(null);
  return Object.freeze({ version: 1, name, mode: candidate.mode as StudioMode,
    docks: Object.freeze(docks), workspace });
}

export function defaultStudioLayout(mode: StudioMode): StudioNamedLayout {
  return Object.freeze({
    version: 1, name: `${mode}-default`, mode,
    docks: Object.freeze(DEFAULT_DOCKS[mode].map((dock) => Object.freeze({ ...dock }))),
    workspace: parseWorkspace(null),
  });
}

export class StudioLayoutManager {
  readonly #storage: StorageLike | null;
  #layouts = new Map<string, StudioNamedLayout>();

  constructor(storage: StorageLike | null = typeof sessionStorage === 'undefined' ? null : sessionStorage) {
    this.#storage = storage;
    this.restore();
  }

  layouts(mode?: StudioMode): readonly StudioNamedLayout[] {
    return Object.freeze([...this.#layouts.values()].filter((layout) => mode === undefined || layout.mode === mode));
  }

  load(name: string, mode: StudioMode): StudioNamedLayout {
    return this.#layouts.get(`${mode}:${name}`) ?? defaultStudioLayout(mode);
  }

  save(layout: StudioNamedLayout): void {
    const parsed = parseLayout(layout);
    if (parsed === null) throw new TypeError('Invalid Studio layout');
    this.#layouts.set(`${parsed.mode}:${parsed.name}`, parsed);
    this.persist();
  }

  saveWorkspace(
    name: string,
    mode: StudioMode,
    workspace: StudioWorkspaceLayout,
  ): StudioNamedLayout {
    const current = this.load(name, mode);
    const next = Object.freeze({ ...current, name, workspace: parseWorkspace(workspace) });
    this.save(next);
    return next;
  }

  private restore(): void {
    const raw = this.#storage?.getItem(STUDIO_LAYOUT_STORAGE_KEY);
    if (raw === null || raw === undefined) return;
    try {
      const values: unknown = JSON.parse(raw);
      if (!Array.isArray(values)) return;
      for (const value of values) {
        const layout = parseLayout(value);
        if (layout !== null) this.#layouts.set(`${layout.mode}:${layout.name}`, layout);
      }
      this.persist();
    } catch { /* Invalid session state falls back to shipped layouts. */ }
  }

  private persist(): void {
    this.#storage?.setItem(STUDIO_LAYOUT_STORAGE_KEY, JSON.stringify(this.layouts()));
  }
}
