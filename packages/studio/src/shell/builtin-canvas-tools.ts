import type { StudioCanvasToolRegistry } from './canvas-tool-registry.js';

export function registerBuiltinStudioCanvasTools(registry: StudioCanvasToolRegistry): void {
  registry.register('map', async () => {
    const [{ buildMapCanvasTool }, { buildRuntimeSpaceTool }] = await Promise.all([
      import('../tools/map/canvas.js'), import('../tools/map/space-canvas.js'),
    ]);
    return (context) => context.route.path.startsWith('/build/map/space/')
      ? buildRuntimeSpaceTool(context) : buildMapCanvasTool(context);
  });
  registry.register('object', () => import('../tools/object/canvas.js').then(({ buildObjectCanvasTool }) => buildObjectCanvasTool));
  registry.register('tiles', () => import('../tools/tiles/canvas.js').then(({ buildTilesCanvasTool }) => buildTilesCanvasTool));
  registry.register('character', () => import('../tools/character/canvas.js').then(({ buildCharacterCanvasTool }) => buildCharacterCanvasTool));
  registry.register('audio', () => import('../tools/audio/canvas.js').then(({ buildAudioCanvasTool }) => buildAudioCanvasTool));
  registry.register('ui-lab', () => import('../tools/ui-lab/canvas.js').then(({ buildUiLabCanvasTool }) => buildUiLabCanvasTool));
  registry.register('items', () => import('../tools/items/canvas.js').then(({ buildItemsCanvasTool }) => buildItemsCanvasTool));
  for (const toolId of ['npc-studio', 'dialogue-graph', 'quest-editor']) {
    registry.register(toolId, () => import('../tools/narrative/canvas.js').then(({ buildNarrativeCanvasTool }) => buildNarrativeCanvasTool));
  }
  for (const toolId of ['world-tables', 'pack-studio']) {
    registry.register(toolId, () => import('../tools/world-tables/canvas.js').then(({ buildWorldAuthoringCanvasTool }) => buildWorldAuthoringCanvasTool));
  }
  registry.register('players', () => import('../tools/operate-canvas.js').then(({ buildPlayersCanvasTool }) => buildPlayersCanvasTool));
  registry.register('playbooks', () => import('../tools/operate-canvas.js').then(({ buildPlaybooksCanvasTool }) => buildPlaybooksCanvasTool));
  registry.register('membership', () => import('../tools/operate-canvas.js').then(({ buildMembershipCanvasTool }) => buildMembershipCanvasTool));
  registry.register('observe', () => import('../tools/operate-canvas.js').then(({ buildObserveCanvasTool }) => buildObserveCanvasTool));
  registry.register('containers', () => import('../tools/operate-canvas.js').then(({ buildContainersCanvasTool }) => buildContainersCanvasTool));
  registry.register('objects', () => import('../tools/operate-canvas.js').then(({ buildObjectsCanvasTool }) => buildObjectsCanvasTool));
  registry.register('npcs', () => import('../tools/operate-canvas.js').then(({ buildNpcsCanvasTool }) => buildNpcsCanvasTool));
  registry.register('world', () => import('../tools/operate-canvas.js').then(({ buildWorldCanvasTool }) => buildWorldCanvasTool));
}
