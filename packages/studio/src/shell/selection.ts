export type StudioSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'tile'; readonly spaceId: number; readonly tileX: number; readonly tileY: number }
  | { readonly kind: 'entity'; readonly entityKind: string; readonly id: string; readonly spaceId: number }
  | { readonly kind: 'player'; readonly identity: string; readonly spaceId: number | null }
  | { readonly kind: 'definition'; readonly definitionKind: string; readonly id: string };

export class StudioSelectionBus {
  #selection: StudioSelection = Object.freeze({ kind: 'none' });
  readonly #listeners = new Set<(selection: StudioSelection) => void>();

  current(): StudioSelection { return this.#selection; }

  select(selection: StudioSelection): void {
    this.#selection = Object.freeze({ ...selection });
    for (const listener of this.#listeners) listener(this.#selection);
  }

  subscribe(listener: (selection: StudioSelection) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
}
