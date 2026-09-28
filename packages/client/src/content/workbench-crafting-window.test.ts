import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRows, buildContentRegistry } from '@orchard/sim';
import { placeableOpensCrafting, WorkbenchCraftingWindow } from './workbench-crafting-window.js';

const registry = buildContentRegistry(bootstrapContentRows()).registry;
const workbench = { id: 7n, kind: 'workbench', definitionId: 'object:workbench' };
const chest = { id: 8n, kind: 'chest', definitionId: 'object:chest' };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** The client's window sync in miniature: the controller opens the grid, the player closes it. */
function harness(close: () => Promise<void> = () => Promise.resolve()) {
  const controller = new WorkbenchCraftingWindow();
  const closePlaceable = vi.fn(close);
  let window: string | null = null;
  return {
    controller, closePlaceable,
    get window() { return window; },
    closeWindow() { window = null; },
    frame(active: typeof workbench | null) { if (controller.step(registry, active, window, closePlaceable)) window = 'crafting'; },
  };
}

describe('workbench crafting window (BUG-059)', () => {
  it('recognises the workbench by its authored crafting frame, not by kind', () => {
    expect(registry.objects.get('object:workbench')?.components.frame?.ref).toBe('frame:crafting');
    expect(placeableOpensCrafting(registry, workbench)).toBe(true);
    expect(placeableOpensCrafting(registry, { ...workbench, definitionId: '' })).toBe(true);
    expect(placeableOpensCrafting(registry, chest)).toBe(false);
    expect(placeableOpensCrafting(registry, null)).toBe(false);
  });

  it('opens the grid once per session and closes the server session once when the grid closes', () => {
    const h = harness();
    h.frame(workbench); expect(h.window).toBe('crafting');
    h.frame(workbench); expect(h.closePlaceable).not.toHaveBeenCalled();
    h.closeWindow();
    h.frame(workbench); h.frame(workbench);
    expect(h.closePlaceable).toHaveBeenCalledOnce();
    expect(h.window).toBeNull();
    // The server ends the session; using the bench again opens the grid again.
    h.frame(null);
    h.controller.interacted(registry, workbench); h.frame(workbench);
    expect(h.window).toBe('crafting');
  });

  it('reopens when the bench is used again before the client sees the close (same bench id throughout)', () => {
    const h = harness();
    h.frame(workbench); h.closeWindow(); h.frame(workbench);
    expect(h.closePlaceable).toHaveBeenCalledOnce();
    // E again at once: the server's close and re-open coalesce, so the active bench never changes.
    h.controller.interacted(registry, workbench);
    h.frame(workbench);
    expect(h.window).toBe('crafting');
  });

  it('shows the grid again when the server refuses the close, instead of leaving the bench stuck', async () => {
    const h = harness(() => Promise.reject(new Error('placeable_close_failed')));
    h.frame(workbench); h.closeWindow(); h.frame(workbench);
    expect(h.closePlaceable).toHaveBeenCalledOnce();
    await settle();
    h.frame(workbench);
    expect(h.window).toBe('crafting');
    // Closing again tries again.
    h.closeWindow(); h.frame(workbench);
    expect(h.closePlaceable).toHaveBeenCalledTimes(2);
  });

  it('opens the grid for a different bench and leaves other placeables to their own windows', () => {
    const h = harness();
    h.frame(workbench);
    h.closeWindow(); h.frame({ ...workbench, id: 9n });
    expect(h.window).toBe('crafting');
    h.closeWindow(); h.frame(chest);
    expect(h.window).toBeNull();
    expect(h.closePlaceable).not.toHaveBeenCalled();
    // Using a chest doesn't reset a bench session.
    h.controller.interacted(registry, chest);
  });
});
