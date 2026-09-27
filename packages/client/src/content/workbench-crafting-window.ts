import type { ContentRegistry } from '@orchard/sim';
import type { WorldPlaceable } from '@orchard/world-bindings/types';
import { activeObjectFrameId } from './frame-presentation.js';

/** The workbench session the client opened the crafting window for (BUG-059). */
export interface WorkbenchCraftingSession {
  readonly placeableId: bigint;
  /** The player closed the window; the server's placeable session is being closed. */
  readonly closing: boolean;
}

export interface WorkbenchCraftingStep {
  readonly session: WorkbenchCraftingSession | null;
  /** Open the crafting window this frame. */
  readonly openCrafting: boolean;
  /** Ask the server to close the placeable session this frame. */
  readonly closePlaceable: boolean;
}

/** Whether a placeable opens the crafting window: its authored frame is a `crafting` surface (a workbench's
 * `openFrame: frame:crafting` interaction). */
export function placeableOpensCrafting(
  registry: Pick<ContentRegistry, 'objects' | 'frames'>,
  placeable: Pick<WorldPlaceable, 'kind' | 'definitionId'> | null,
): boolean {
  const frameId = activeObjectFrameId(registry, placeable);
  return frameId !== null && registry.frames.get(frameId)?.presentation?.surface === 'crafting';
}

/**
 * Keeps the crafting window in step with a server placeable session whose frame is the crafting grid (BUG-059).
 * The server opens the session when the player uses a workbench; the client opens the crafting window once for it.
 * When the player closes the window, the client closes the server session once. A new session (another bench, or
 * the same bench after its session ended) opens the window again.
 */
export function stepWorkbenchCraftingWindow(
  registry: Pick<ContentRegistry, 'objects' | 'frames'>,
  activePlaceable: Pick<WorldPlaceable, 'id' | 'kind' | 'definitionId'> | null,
  openWindow: string | null,
  session: WorkbenchCraftingSession | null,
): WorkbenchCraftingStep {
  if (activePlaceable === null || !placeableOpensCrafting(registry, activePlaceable)) {
    return { session: null, openCrafting: false, closePlaceable: false };
  }
  if (session === null || session.placeableId !== activePlaceable.id) {
    return { session: { placeableId: activePlaceable.id, closing: false }, openCrafting: true, closePlaceable: false };
  }
  if (!session.closing && openWindow !== 'crafting') {
    return { session: { ...session, closing: true }, openCrafting: false, closePlaceable: true };
  }
  return { session, openCrafting: false, closePlaceable: false };
}
