import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const TILES_TOOL_REGISTRATION = Object.freeze({
  id: 'tiles', label: 'Tile Editor', mode: 'build', icon: 'editor.tiles',
  routes: Object.freeze(['/build/tiles'] as const),
  docks: Object.freeze(['asset_library', 'inspector', 'preview', 'validation', 'history'] as const),
  commands: Object.freeze([
    { id: 'tiles.clone', label: 'Clone tileset family' },
    { id: 'tiles.publish', label: 'Publish tileset family' },
  ]),
} satisfies StudioToolDefinition);
