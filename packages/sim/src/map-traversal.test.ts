import { describe, expect, it } from 'vitest';
import { createEmptyMapDocument } from './terrain-lab.js';
import { migrateMapDocumentV2, terrainDocumentForMapV3 } from './map-document-v3.js';
import { compileMapDocument } from './map-compiler.js';
import { mapDocumentTraversalChannels, mapTraversalChannels, staticTraversalChannels } from './map-traversal.js';
import { RULE_MEDIA } from './rule-catalogue.js';
import { cellFlags } from './cell-flags.js';

const base = () => migrateMapDocumentV2(createEmptyMapDocument({ id: 'media', title: 'Media', width: 8, height: 8 }));
describe('shared map traversal channels', () => {
  it('matches the compiled projection without building render arrays', () => {
    const document = { ...base(), cells: {
      '0,0': { surface: 'water' as const, collision: 'force_block' as const },
      '1,0': { surface: 'water' as const, collision: 'force_walk' as const },
      '2,0': { surface: 'grass' as const, ledge: true },
      '3,0': { feature: 'river' as const },
    } };
    expect(mapDocumentTraversalChannels(document)).toEqual(mapTraversalChannels(document, compileMapDocument(terrainDocumentForMapV3(document))));
  });
  it('uses semantic base roles while preserving explicit independent solids', () => {
    const document = { ...base(), cells: { '0,0': { collision: 'force_block' as const } } };
    const compiled = compileMapDocument(terrainDocumentForMapV3(document));
    const channels = mapTraversalChannels(document, compiled, () => ({ medium: 'shroom_water', blocksMovement: false }));
    expect(channels.medium[0]).toBe(RULE_MEDIA.indexOf('shroom_water'));
    expect(channels.solidBlocked[0]).toBe(1);
    expect(channels.solidBlocked[1]).toBe(0);
    expect(() => mapTraversalChannels(document, { ...compiled, width: 1 })).toThrow('traversal_map_size_mismatch');
  });
  it('removes only named static hazards, retaining enclosure geometry', () => {
    const channels = staticTraversalChannels({ width: 3, height: 1, blocked: cellFlags([true, true, false]) },
      index => index === 1 ? 'lava' : 'land', new Set([1]));
    expect(Array.from(channels.solidBlocked)).toEqual([1, 0, 0]);
    expect(Array.from(channels.medium)).toEqual([0, RULE_MEDIA.indexOf('lava'), 0]);
  });
});
