import { ui as kit } from '@orchard/ui/studio';
import type { SpaceRegistryEntry } from '@orchard/sim';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { studioSpaceRef } from './routes.js';

/** Safe route boundary until the visual World Map lane consumes space-data.ts. */
export function buildRuntimeSpaceTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const reference = studioSpaceRef(context.route.path);
  const adapter = context.controller.liveAdapter();
  const view = adapter?.view();
  const state = context.controller.toolState(`runtime-space:${context.route.path}:${view?.connected}:${view?.identity}:${view?.role}`, () => ({
    started: false, entry: null as SpaceRegistryEntry | null, error: null as string | null,
  }));
  if (!state.started) {
    state.started = true;
    if (reference?.kind !== 'space' || adapter?.spaceRegistry === undefined) state.error = 'Space is unavailable.';
    else void adapter.spaceRegistry().then((rows) => {
      state.entry = rows.find((row) => row.definition.spaceId === reference.spaceId) ?? null;
      if (state.entry === null) state.error = 'Space is unavailable.';
      context.invalidate();
    }).catch(() => { state.error = 'Unable to load this space.'; context.invalidate(); });
  }
  return { kit: { workspace: kit.flex({ width: 'grow', gap: 8 }, [
    kit.text(state.entry?.label ?? state.error ?? 'Loading space…'),
    kit.text(state.entry === null ? '' : `${state.entry.definition.sizeTiles} × ${state.entry.definition.sizeTiles} tiles · Read only`),
  ]) } };
}
