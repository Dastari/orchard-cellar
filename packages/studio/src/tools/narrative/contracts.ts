import type { StudioToolDefinition } from '../../shell/tool-registry.js';

const SHARED_DOCKS = ['content_browser', 'asset_library', 'inspector', 'preview', 'validation', 'history'] as const;

export const NPC_STUDIO_REGISTRATION = Object.freeze({
  id: 'npc-studio', label: 'NPC Studio', mode: 'author', icon: 'editor.npc',
  routes: Object.freeze(['/author/npcs'] as const), docks: SHARED_DOCKS,
  commands: Object.freeze([
    { id: 'npc.new', label: 'New NPC definition' },
    { id: 'narrative.publish', label: 'Publish narrative draft' },
  ]),
} satisfies StudioToolDefinition);

export const DIALOGUE_GRAPH_REGISTRATION = Object.freeze({
  id: 'dialogue-graph', label: 'Dialogue Graph', mode: 'author', icon: 'editor.dialogue',
  routes: Object.freeze(['/author/dialogue'] as const), docks: SHARED_DOCKS,
  commands: Object.freeze([
    { id: 'dialogue.new', label: 'New dialogue graph' },
    { id: 'dialogue.play', label: 'Play dialogue graph' },
    { id: 'narrative.publish', label: 'Publish narrative draft' },
  ]),
} satisfies StudioToolDefinition);

export const QUEST_EDITOR_REGISTRATION = Object.freeze({
  id: 'quest-editor', label: 'Quest Editor', mode: 'author', icon: 'editor.quest',
  routes: Object.freeze(['/author/quests'] as const), docks: SHARED_DOCKS,
  commands: Object.freeze([
    { id: 'quest.new', label: 'New quest definition' },
    { id: 'quest.preview', label: 'Preview quest completion' },
    { id: 'narrative.publish', label: 'Publish narrative draft' },
  ]),
} satisfies StudioToolDefinition);

export const NARRATIVE_TOOL_REGISTRATIONS = Object.freeze([
  NPC_STUDIO_REGISTRATION,
  DIALOGUE_GRAPH_REGISTRATION,
  QUEST_EDITOR_REGISTRATION,
] as const);
