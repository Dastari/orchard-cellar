import type { StudioShellController } from './controller.js';

const ROUTES: Readonly<Record<string, string>> = {
  item: '/author/items', recipe: '/author/items', process: '/author/items', shop: '/author/items',
  npc: '/author/npcs', dialogue: '/author/dialogue', quest: '/author/quests',
};
interface PendingDefinition { id: string | null }
export function openStudioDefinition(controller: StudioShellController, id: string): boolean {
  const kind = id.split(':')[0]!;
  const route = ROUTES[kind] ?? '/author/world-tables';
  const pending = controller.toolState<PendingDefinition>('content-navigation', () => ({ id: null }));
  pending.id = id;
  controller.selection.select({ kind: 'definition', definitionKind: kind, id });
  if (controller.navigate(route)) return true;
  pending.id = null;
  return false;
}
export function consumeStudioDefinition(controller: StudioShellController, accepts: (kind: string) => boolean): string | null {
  const pending = controller.toolState<PendingDefinition>('content-navigation', () => ({ id: null }));
  if (!pending.id || !accepts(pending.id.split(':')[0]!)) return null;
  const id = pending.id; pending.id = null; return id;
}
