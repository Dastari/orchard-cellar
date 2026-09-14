import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('active-content artwork runtime wiring', () => {
  it('starts revision-aware synchronization without delaying launch and refreshes on snapshots', () => {
    const construction = source.indexOf('createClientContentArtSynchronizer(');
    const initial = source.indexOf('synchronizeContentArt();', construction);
    const updateStart = source.indexOf('function update(): void');
    const updateEnd = source.indexOf('function render(', updateStart);
    const update = source.slice(updateStart, updateEnd);
    expect(construction).toBeGreaterThan(source.indexOf('const art = await loadOverworldArt()'));
    expect(initial).toBeGreaterThan(construction);
    expect(source.slice(construction, initial)).toContain('void contentArtSynchronizer.synchronize(');
    expect(update).toContain('latestSnapshot = network.view();');
    expect(update.indexOf('synchronizeContentArt();'))
      .toBeGreaterThan(update.indexOf('latestSnapshot = network.view();'));
    expect(source).not.toContain('await contentArtSynchronizer.synchronize(');
  });

  it('never resurrects bootstrap item presentation after a live definition disappears', () => {
    const start = source.indexOf('function liveItemDefinition(');
    const end = source.indexOf('function liveItemContentDefinition(', start);
    const resolver = source.slice(start, end);
    expect(resolver).toContain('runtimeItemDefinition(snapshot.content.registry, itemKind)');
    expect(resolver).not.toContain('itemDefinition(');
    expect(source).toContain('hotbarItemLabel(itemKind, snapshot.content.registry)');

    const contentStart = source.indexOf('function liveItemContentDefinition(');
    const contentEnd = source.indexOf('function itemDescription(', contentStart);
    const contentResolver = source.slice(contentStart, contentEnd);
    expect(contentResolver).toContain('runtimeItemDefinition(snapshot.content.registry, itemKind)');
    expect(contentResolver).not.toContain('?? itemDefinition(');
  });
});
