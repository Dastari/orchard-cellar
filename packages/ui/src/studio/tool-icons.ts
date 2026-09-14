import { FANTASY_ICON_FAMILIES } from '../design-system/fantasy-controls.js';

export const STUDIO_TOOL_ICON_IDS = [
  'map', 'object', 'items', 'npc-studio', 'dialogue-graph', 'quest-editor',
  'character', 'audio', 'ui-lab', 'tiles', 'world-tables', 'pack-studio',
  'players', 'playbooks', 'membership', 'observe', 'containers', 'objects',
  'npcs', 'world',
] as const;

export type StudioToolIconId = (typeof STUDIO_TOOL_ICON_IDS)[number];

export interface StudioToolIconDefinition {
  readonly label: string;
  readonly frame: number;
  readonly outline?: number;
}

function family(id: string, label: string): StudioToolIconDefinition {
  const definition = FANTASY_ICON_FAMILIES.find((candidate) => candidate.id === id);
  if (definition === undefined || definition.frames[0] === undefined) {
    throw new Error(`studio_tool_icon_family_missing:${id}`);
  }
  return Object.freeze({ label, frame: definition.frames[0],
    ...(definition.outline === undefined ? {} : { outline: definition.outline }) });
}

/** Semantic route icons for the Teams-style Studio rail. They are selected in
 * the UI library, not by route views, and all come from the generated fantasy
 * catalog already exercised by UI Lab. Labels are canvas tooltip/accessibility
 * text; the rail itself renders icons only. */
export const STUDIO_TOOL_ICONS: Readonly<Record<StudioToolIconId, StudioToolIconDefinition>> = Object.freeze({
  map: family('star', 'Map Editor'),
  object: family('wrench', 'Object Studio'),
  items: family('backpack', 'Items & Recipes'),
  'npc-studio': family('crown', 'NPC Studio'),
  'dialogue-graph': family('chat', 'Dialogue Graph'),
  'quest-editor': family('book', 'Quest Editor'),
  character: family('heart', 'Character Studio'),
  audio: family('music', 'Audio Preview'),
  'ui-lab': family('gear', 'UI Lab'),
  tiles: family('shield', 'Tile Studio'),
  'world-tables': family('coin', 'World Tables'),
  'pack-studio': family('gift', 'Pack Studio'),
  players: family('crown', 'Player Manager'),
  playbooks: family('book', 'Guided Playbooks'),
  membership: family('mail', 'Membership'),
  observe: family('lightning', 'World Observe'),
  containers: family('backpack', 'Container Inspector'),
  objects: family('wrench', 'Object Manager'),
  npcs: family('sword', 'NPC Manager'),
  world: family('star', 'World Control'),
});

export function studioToolIcon(id: string): StudioToolIconDefinition {
  if (!Object.hasOwn(STUDIO_TOOL_ICONS, id)) throw new Error(`studio_tool_icon_unknown:${id}`);
  return STUDIO_TOOL_ICONS[id as StudioToolIconId];
}
