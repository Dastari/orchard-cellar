import type { StudioToolDefinition } from '../../shell/tool-registry.js';

const DOCKS = ['content_browser', 'asset_library', 'inspector', 'preview', 'validation', 'history'] as const;

export const WORLD_TABLES_TOOL_REGISTRATION = Object.freeze({
  id: 'world-tables', label: 'World Tables', mode: 'author', icon: 'editor.world-tables',
  routes: Object.freeze(['/author/world-tables'] as const), docks: DOCKS,
  commands: Object.freeze([
    { id: 'world-table.new', label: 'New world definition' },
    { id: 'world-table.playtest', label: 'Playtest selected definition' },
    { id: 'world-table.publish', label: 'Publish world tables' },
  ]),
} satisfies StudioToolDefinition);

export const PACK_STUDIO_TOOL_REGISTRATION = Object.freeze({
  id: 'pack-studio', label: 'Pack Studio', mode: 'author', icon: 'editor.pack',
  routes: Object.freeze(['/author/pack'] as const), docks: DOCKS,
  commands: Object.freeze([
    { id: 'pack.import', label: 'Import bounded content pack' },
    { id: 'pack.export', label: 'Export content pack' },
    { id: 'pack.publish', label: 'Publish pack' },
  ]),
} satisfies StudioToolDefinition);

export const WORLD_AUTHORING_TOOL_REGISTRATIONS = Object.freeze([
  WORLD_TABLES_TOOL_REGISTRATION, PACK_STUDIO_TOOL_REGISTRATION,
] as const);
