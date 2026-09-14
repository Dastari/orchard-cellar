import { createMockAdminWorldApi, type AdminWorldApi } from '../../admin/world-api.js';
import type { StudioShellController } from '../../shell/controller.js';

export function worldApiFor(controller: StudioShellController): AdminWorldApi | null {
  if (controller.session.snapshot().environment === 'sandbox') {
    return controller.toolState('world:mock-api', createMockAdminWorldApi);
  }
  return controller.liveAdapter()?.adminWorld ?? null;
}
