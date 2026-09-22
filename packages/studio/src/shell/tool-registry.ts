import type { StudioDockId, StudioMode } from '@orchard/ui/studio';
import { AUDIO_TOOL_REGISTRATION } from '../tools/audio/model.js';
import { CHARACTER_TOOL_REGISTRATION } from '../tools/character/model.js';
import { ITEMS_TOOL_REGISTRATION } from '../tools/items/contracts.js';
import { NARRATIVE_TOOL_REGISTRATIONS } from '../tools/narrative/contracts.js';
import { MEMBERSHIP_TOOL_REGISTRATION } from '../tools/membership/model.js';
import { OBSERVE_TOOL_REGISTRATION } from '../tools/observe/model.js';
import { CONTAINERS_TOOL_REGISTRATION } from '../tools/containers/model.js';
import { OBJECTS_TOOL_REGISTRATION } from '../tools/objects/model.js';
import { NPCS_TOOL_REGISTRATION } from '../tools/npcs/model.js';
import { WORLD_TOOL_REGISTRATION } from '../tools/world/model.js';
import { PLAYERS_TOOL_REGISTRATION } from '../tools/players/model.js';
import { PLAYBOOKS_TOOL_REGISTRATION } from '../tools/playbooks/model.js';
import { UI_LAB_TOOL_REGISTRATION } from '../tools/ui-lab/model.js';
import { TILES_TOOL_REGISTRATION } from '../tools/tiles/contracts.js';
import { WORLD_AUTHORING_TOOL_REGISTRATIONS } from '../tools/world-tables/contracts.js';
import { studioModeAccess, studioScopedToolAccess, type StudioScope, type StudioAccess } from './access.js';

export interface StudioCommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly keywords?: readonly string[];
}

export interface StudioToolDefinition {
  readonly id: string;
  readonly label: string;
  readonly mode: StudioMode;
  readonly icon: string;
  readonly routes: readonly string[];
  readonly docks: readonly StudioDockId[];
  readonly commands: readonly StudioCommandDefinition[];
}

export interface StudioToolRoute {
  readonly path: string;
  readonly tool: StudioToolDefinition;
  readonly access: StudioAccess;
}

export class StudioToolRegistry {
  #scopes: readonly StudioScope[] | undefined;
  setScopes(scopes: readonly StudioScope[] | undefined): void { this.#scopes = scopes; }
  readonly #tools = new Map<string, StudioToolDefinition>();

  registerStudioTool(tool: StudioToolDefinition): () => void {
    if (!/^[a-z][a-z0-9-]*$/u.test(tool.id)) throw new TypeError(`Invalid Studio tool id: ${tool.id}`);
    if (tool.routes.length === 0 || tool.routes.some((route) => !route.startsWith('/'))) {
      throw new TypeError(`Studio tool ${tool.id} requires absolute routes`);
    }
    if (this.#tools.has(tool.id) || this.tools().some((candidate) => (
      candidate.routes.some((route) => tool.routes.includes(route))
    ))) throw new TypeError(`Duplicate Studio tool or route: ${tool.id}`);
    const frozen = Object.freeze({
      ...tool,
      routes: Object.freeze([...tool.routes]),
      docks: Object.freeze([...tool.docks]),
      commands: Object.freeze([...tool.commands]),
    });
    this.#tools.set(tool.id, frozen);
    return () => { this.#tools.delete(tool.id); };
  }

  tools(): readonly StudioToolDefinition[] {
    return Object.freeze([...this.#tools.values()]);
  }

  routes(role: string | null): readonly StudioToolRoute[] {
    return Object.freeze(this.tools().flatMap((tool) => {
      const access = this.#scopes === undefined ? studioModeAccess(role, tool.mode) : studioScopedToolAccess(this.#scopes, tool.id);
      return access === 'hidden' ? [] : tool.routes.map((path) => ({ path, tool, access }));
    }));
  }

  resolve(path: string, role: string | null): StudioToolRoute | null {
    return this.routes(role).find((route) => route.path === path) ?? null;
  }
}

export const defaultStudioToolRegistry = new StudioToolRegistry();

export function registerStudioTool(tool: StudioToolDefinition): () => void;
export function registerStudioTool(registry: StudioToolRegistry, tool: StudioToolDefinition): () => void;
export function registerStudioTool(
  registryOrTool: StudioToolRegistry | StudioToolDefinition,
  maybeTool?: StudioToolDefinition,
): () => void {
  if (registryOrTool instanceof StudioToolRegistry) {
    if (maybeTool === undefined) throw new TypeError('Studio tool definition required');
    return registryOrTool.registerStudioTool(maybeTool);
  }
  return defaultStudioToolRegistry.registerStudioTool(registryOrTool);
}

export function registerBuiltinStudioTools(registry: StudioToolRegistry): void {
  const tools: readonly StudioToolDefinition[] = [
    { id: 'map', label: 'Map Editor', mode: 'build', icon: 'editor.mode.build', routes: ['/build/map', '/build/map/terrain-lab', '/build/map/procedural-world'], docks: ['world_outliner', 'live_outliner', 'inspector', 'validation'], commands: [{ id: 'map.frame', label: 'Frame map' }] },
    { id: 'object', label: 'Object Studio', mode: 'build', icon: 'editor.object', routes: ['/build/object'], docks: ['world_outliner', 'inspector', 'behaviour', 'validation'], commands: [{ id: 'object.new', label: 'New object definition' }] },
    ITEMS_TOOL_REGISTRATION,
    ...NARRATIVE_TOOL_REGISTRATIONS,
    CHARACTER_TOOL_REGISTRATION,
    AUDIO_TOOL_REGISTRATION,
    UI_LAB_TOOL_REGISTRATION,
    TILES_TOOL_REGISTRATION,
    ...WORLD_AUTHORING_TOOL_REGISTRATIONS,
    PLAYERS_TOOL_REGISTRATION,
    PLAYBOOKS_TOOL_REGISTRATION,
    MEMBERSHIP_TOOL_REGISTRATION,
    OBSERVE_TOOL_REGISTRATION,
    CONTAINERS_TOOL_REGISTRATION,
    OBJECTS_TOOL_REGISTRATION,
    NPCS_TOOL_REGISTRATION,
    WORLD_TOOL_REGISTRATION,
  ];
  for (const tool of tools) registry.registerStudioTool(tool);
}
