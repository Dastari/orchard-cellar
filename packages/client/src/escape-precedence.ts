/** BUG-060: Escape closes the topmost open surface first; only with nothing open does it open the Escape menu.
 *
 * Blocking surfaces (update prompt, Delve rewards and confirmation, name prompt, trade, NPC dialogue and shop, the
 * online roster, and every game window) own Escape through their retained hosts before this runs. This covers the
 * two non-blocking surfaces the game draws over the world, which would otherwise let Escape fall through to the menu:
 * an open chat input and build mode. */
export type EscapeSurface = 'chat-input' | 'build-mode';

export interface EscapeSurfaces {
  /** The chat input is open (typing a message). */
  readonly chatOpen: boolean;
  /** Build mode (the build palette) is on. */
  readonly buildMode: boolean;
  /** A game window is open (inventory, crafting, chest, a station, the menu...). It owns Escape itself. */
  readonly windowOpen: boolean;
}

/** The surface an Escape press closes before the game sees it, topmost first, or null to let the game handle it. */
export function escapeClosesSurface(key: string, repeat: boolean, surfaces: EscapeSurfaces): EscapeSurface | null {
  if (key !== 'Escape' || repeat) return null;
  if (surfaces.chatOpen) return 'chat-input';
  if (surfaces.buildMode && !surfaces.windowOpen) return 'build-mode';
  return null;
}

/** How long a closed entity window stays closed while waiting for the server to confirm the close. */
export const CLOSING_ENTITY_WINDOW_MS = 2_000;

/**
 * A chest or station window the player just closed (Escape, the close button, a key) must not reopen while the
 * server still reports that entity as open, before it applies the close. Otherwise the window flickers back, and
 * the next Escape can reach the wrong surface. The guard lasts until the server reports a different (or no)
 * entity, or CLOSING_ENTITY_WINDOW_MS passes, so a close the server never applies can't lock the window shut.
 */
export class ClosingEntityWindows {
  private closing: { readonly key: string; readonly at: number } | null = null;
  private shown: string | null = null;
  /** The entity whose window the last snapshot sync left on screen (null when none is). The close callbacks record
   * this one, not the newest snapshot's entity: when the sync itself closes a window because the server switched to
   * another entity, the new entity must not be suppressed (review of #252, finding 1). */
  showing(key: string | null): void { this.shown = key; }
  /** The player closed the window on screen (Escape, the close button, a key, or the sync switching entities). */
  closedShown(now: number): void { this.closed(this.shown, now); this.shown = null; }
  /** The player closed the window of this entity (a chest id, a placeable id, or the hearth stash). */
  closed(key: string | null, now: number): void { this.closing = key === null ? null : { key, at: now }; }
  /** The player interacted with an entity again: a fresh open must never wait for an old close (review of #252,
   * finding 2). */
  interacted(): void { this.closing = null; }
  /** Called with the server's currently open entity each snapshot; forgets the guard once it no longer applies. */
  observe(active: string | null, now: number): void {
    if (this.closing !== null && (active !== this.closing.key || now - this.closing.at >= CLOSING_ENTITY_WINDOW_MS)) this.closing = null;
  }
  /** Whether the window of this open entity should stay closed for now. */
  suppresses(active: string | null): boolean { return active !== null && this.closing?.key === active; }
}

/** The key a chest, placeable or hearth stash window is tracked by. */
export function entityWindowKey(snapshot: { readonly activeChest: { readonly id: bigint } | null; readonly activePlaceable: { readonly id: bigint } | null; readonly hearthStashOpen?: boolean }): string | null {
  if (snapshot.activeChest !== null) return `chest:${snapshot.activeChest.id}`;
  if (snapshot.hearthStashOpen === true) return 'hearth-stash';
  if (snapshot.activePlaceable !== null) return `placeable:${snapshot.activePlaceable.id}`;
  return null;
}
