import { createMockAdminObjectsApi, type AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioShellController } from '../../shell/controller.js';

/** Sandbox owns one deterministic mock. Connected sessions must provide the
 * injectable W4 adapter; they never silently fall back to local fake data. */
export function objectsApiFor(controller: StudioShellController): AdminObjectsApi | null {
  if (controller.session.snapshot().environment === 'sandbox') {
    return controller.toolState('objects:mock-api', createMockAdminObjectsApi);
  }
  return controller.liveAdapter()?.adminObjects ?? null;
}
