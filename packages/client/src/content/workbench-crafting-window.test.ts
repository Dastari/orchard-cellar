import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootstrapContentRows, buildContentRegistry } from '@orchard/sim';
import { placeableOpensCrafting, stepWorkbenchCraftingWindow } from './workbench-crafting-window.js';

const registry = buildContentRegistry(bootstrapContentRows()).registry;
const workbench = { id: 7n, kind: 'workbench', definitionId: 'object:workbench' };
const chest = { id: 8n, kind: 'chest', definitionId: 'object:chest' };

describe('workbench crafting window (BUG-059)', () => {
  it('recognises the workbench by its authored crafting frame, not by kind', () => {
    expect(registry.objects.get('object:workbench')?.components.frame?.ref).toBe('frame:crafting');
    expect(placeableOpensCrafting(registry, workbench)).toBe(true);
    expect(placeableOpensCrafting(registry, { ...workbench, definitionId: '' })).toBe(true);
    expect(placeableOpensCrafting(registry, chest)).toBe(false);
    expect(placeableOpensCrafting(registry, null)).toBe(false);
  });

  it('opens the crafting window once for a workbench session and closes the session when the window closes', () => {
    const opened = stepWorkbenchCraftingWindow(registry, workbench, null, null);
    expect(opened).toEqual({ session: { placeableId: 7n, closing: false }, openCrafting: true, closePlaceable: false });

    // While the grid is open, nothing more happens.
    const open = stepWorkbenchCraftingWindow(registry, workbench, 'crafting', opened.session);
    expect(open).toEqual({ session: opened.session, openCrafting: false, closePlaceable: false });

    // The player closes the grid: the server session is closed exactly once, and the window is not reopened.
    const closing = stepWorkbenchCraftingWindow(registry, workbench, null, open.session);
    expect(closing).toEqual({ session: { placeableId: 7n, closing: true }, openCrafting: false, closePlaceable: true });
    expect(stepWorkbenchCraftingWindow(registry, workbench, null, closing.session))
      .toEqual({ session: closing.session, openCrafting: false, closePlaceable: false });

    // The server ends the session; using the bench again opens the grid again.
    const ended = stepWorkbenchCraftingWindow(registry, null, null, closing.session);
    expect(ended).toEqual({ session: null, openCrafting: false, closePlaceable: false });
    expect(stepWorkbenchCraftingWindow(registry, workbench, null, ended.session).openCrafting).toBe(true);
  });

  it('opens the grid for a different bench and leaves other placeables to their own windows', () => {
    const first = stepWorkbenchCraftingWindow(registry, workbench, 'crafting', null).session;
    expect(stepWorkbenchCraftingWindow(registry, { ...workbench, id: 9n }, 'crafting', first).openCrafting).toBe(true);
    expect(stepWorkbenchCraftingWindow(registry, chest, 'chest', first))
      .toEqual({ session: null, openCrafting: false, closePlaceable: false });
  });

  it('is wired into the client window sync', () => {
    const source = readFileSync(new URL('../overworld-main.ts', import.meta.url), 'utf8');
    const sync = source.slice(source.indexOf("if (snapshot.activeChest !== null && overworldUi.openWindow !== 'chest')"),
      source.indexOf('if (optimisticSelectedSlot !== null && snapshot.survival?.selectedSlot === optimisticSelectedSlot)'));
    expect(sync).toContain('stepWorkbenchCraftingWindow(snapshot.content.registry, snapshot.activePlaceable,');
    expect(sync).toContain("if (workbenchStep.openCrafting) overworldUi.openWindow = 'crafting';");
    expect(sync).toContain('if (workbenchStep.closePlaceable) void network.closePlaceable()');
  });
});
