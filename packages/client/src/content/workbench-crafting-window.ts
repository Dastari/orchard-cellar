import type { ContentRegistry } from '@orchard/sim';
import type { WorldPlaceable } from '@orchard/world-bindings/types';
import { activeObjectFrameId } from './frame-presentation.js';

type Registry = Pick<ContentRegistry, 'objects' | 'frames'>;
type Placeable = Pick<WorldPlaceable, 'id' | 'kind' | 'definitionId'>;

/** Whether a placeable opens the crafting window: its authored frame is a `crafting` surface (a workbench's
 * `openFrame: frame:crafting` interaction). */
export function placeableOpensCrafting(registry: Registry, placeable: Pick<WorldPlaceable, 'kind' | 'definitionId'> | null): boolean {
  const frameId = activeObjectFrameId(registry, placeable);
  return frameId !== null && registry.frames.get(frameId)?.presentation?.surface === 'crafting';
}

/**
 * Keeps the crafting window in step with a server placeable session whose frame is the crafting grid (BUG-059).
 *
 * - The server opens the session when the player uses a workbench; the window opens once for it.
 * - When the player closes the window, the server session is closed once.
 * - Using a bench again always reopens the grid, even when the server confirms it before the client saw the close
 *   (the same bench id throughout), and a close the server refuses leaves the session open, so the grid shows again.
 */
export class WorkbenchCraftingWindow {
  /** The bench the window was opened for, and whether its close is in flight. */
  private session: { readonly placeableId: bigint; closing: boolean } | null = null;

  /** One frame of the window sync. Returns whether to open the crafting window now. */
  step(registry: Registry, activePlaceable: Placeable | null, openWindow: string | null, closePlaceable: () => Promise<void>): boolean {
    if (activePlaceable === null || !placeableOpensCrafting(registry, activePlaceable)) {
      this.session = null;
      return false;
    }
    if (this.session === null || this.session.placeableId !== activePlaceable.id) {
      this.session = { placeableId: activePlaceable.id, closing: false };
      return true;
    }
    if (!this.session.closing && openWindow !== 'crafting') {
      const session = this.session;
      session.closing = true;
      void closePlaceable().catch(() => {
        // The server kept the session: show it again rather than leaving the bench unusable.
        if (this.session === session) this.session = null;
      });
    }
    return false;
  }

  /** The player used a placeable. A crafting bench always opens (again) once the server confirms the session. */
  interacted(registry: Registry, placeable: Pick<WorldPlaceable, 'kind' | 'definitionId'>): void {
    if (placeableOpensCrafting(registry, placeable)) this.session = null;
  }
}
