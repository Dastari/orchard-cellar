import type { StudioMode } from '@orchard/ui';

export const STUDIO_SHORTCUT_STORAGE_KEY = 'orchard.studio.shortcuts:v1';

export type StudioShortcutAction =
  | 'mode.build'
  | 'mode.author'
  | 'mode.operate'
  | 'mode.observe'
  | 'palette.open'
  | 'search.everywhere';

export interface StudioShortcutDefinition {
  readonly action: StudioShortcutAction;
  readonly label: string;
  readonly chord: string;
  readonly mode?: StudioMode;
}

export const DEFAULT_STUDIO_SHORTCUTS = Object.freeze([
  { action: 'mode.build', label: 'Build mode', chord: 'Ctrl+1', mode: 'build' },
  { action: 'mode.author', label: 'Author mode', chord: 'Ctrl+2', mode: 'author' },
  { action: 'mode.operate', label: 'Operate mode', chord: 'Ctrl+3', mode: 'operate' },
  { action: 'mode.observe', label: 'Observe mode', chord: 'Ctrl+4', mode: 'observe' },
  { action: 'palette.open', label: 'Command palette', chord: 'Ctrl+K' },
  { action: 'search.everywhere', label: 'Search everywhere', chord: 'Ctrl+Shift+F' },
] as const satisfies readonly StudioShortcutDefinition[]);

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

export function normalizeStudioShortcut(chord: string): string {
  const parts = chord.split('+').map((part) => part.trim()).filter(Boolean);
  const keyPart = parts.find((part) => !(MODIFIER_ORDER as readonly string[]).some((modifier) => modifier.toLocaleLowerCase('en') === part.toLocaleLowerCase('en')));
  if (keyPart === undefined || keyPart.length !== 1) throw new Error('studio_shortcut_key_required');
  const modifiers = MODIFIER_ORDER.filter((modifier) => parts.some((part) => part.toLocaleLowerCase('en') === modifier.toLocaleLowerCase('en')));
  if (modifiers.length === 0) throw new Error('studio_shortcut_modifier_required');
  return [...modifiers, keyPart.toLocaleUpperCase('en')].join('+');
}

export function studioShortcutForKeyboardEvent(event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'key'>): string | null {
  if (event.key.length !== 1 || (!event.ctrlKey && !event.altKey && !event.metaKey)) return null;
  return [
    ...(event.ctrlKey ? ['Ctrl'] : []), ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []), ...(event.metaKey ? ['Meta'] : []),
    event.key.toLocaleUpperCase('en'),
  ].join('+');
}

function parsedOverrides(storage: StorageLike | null): Readonly<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(storage?.getItem(STUDIO_SHORTCUT_STORAGE_KEY) ?? '{}');
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([action, chord]) => (
      typeof chord === 'string' ? [[action, chord]] : []
    )));
  } catch { return {}; }
}

export class StudioShortcutMap {
  readonly #storage: StorageLike | null;
  readonly #chords = new Map<StudioShortcutAction, string>();

  constructor(storage: StorageLike | null = typeof localStorage === 'undefined' ? null : localStorage) {
    this.#storage = storage;
    const overrides = parsedOverrides(storage);
    for (const definition of DEFAULT_STUDIO_SHORTCUTS) {
      const candidate = overrides[definition.action] ?? definition.chord;
      try { this.assign(definition.action, candidate, false); }
      catch { this.assign(definition.action, definition.chord, false); }
    }
    this.persist();
  }

  definitions(): readonly StudioShortcutDefinition[] {
    return Object.freeze(DEFAULT_STUDIO_SHORTCUTS.map((definition) => Object.freeze({
      ...definition, chord: this.#chords.get(definition.action) ?? definition.chord,
    })));
  }

  chord(action: StudioShortcutAction): string {
    const chord = this.#chords.get(action);
    if (chord === undefined) throw new Error(`studio_shortcut_unknown_action:${action}`);
    return chord;
  }

  actionFor(event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'key'>): StudioShortcutAction | null {
    const chord = studioShortcutForKeyboardEvent(event);
    if (chord === null) return null;
    return this.definitions().find((definition) => definition.chord === chord)?.action ?? null;
  }

  assign(action: StudioShortcutAction, chord: string, persist = true): void {
    if (!DEFAULT_STUDIO_SHORTCUTS.some((definition) => definition.action === action)) {
      throw new Error(`studio_shortcut_unknown_action:${action}`);
    }
    const normalized = normalizeStudioShortcut(chord);
    const conflict = [...this.#chords].find(([candidateAction, candidateChord]) => candidateAction !== action && candidateChord === normalized);
    if (conflict !== undefined) throw new Error(`studio_shortcut_conflict:${conflict[0]}`);
    this.#chords.set(action, normalized);
    if (persist) this.persist();
  }

  reset(): void {
    this.#chords.clear();
    for (const definition of DEFAULT_STUDIO_SHORTCUTS) this.assign(definition.action, definition.chord, false);
    this.persist();
  }

  private persist(): void {
    this.#storage?.setItem(STUDIO_SHORTCUT_STORAGE_KEY, JSON.stringify(Object.fromEntries(this.#chords)));
  }
}
