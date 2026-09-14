import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEBUG_SPACE_ID,
  bootstrapContentRows,
  buildContentRegistry,
} from '@orchard/sim';
import {
  clientSpaceDefinition,
  spacePresentationKey,
  spaceStreamingKey,
} from './space-authority.js';
import { LiveContentRegistry } from './live-content.js';

const mainSource = readFileSync(new URL('../overworld-main.ts', import.meta.url), 'utf8');
const connectionSource = readFileSync(new URL('../net/overworld-connection.ts', import.meta.url), 'utf8');

function rowsWithDebugSize(sizeTiles: number) {
  return bootstrapContentRows().map((row) => {
    if (row.id !== 'space:debug_flat') return row;
    const definition = JSON.parse(String(row.json)) as Record<string, unknown>;
    return { ...row, json: JSON.stringify({ ...definition, sizeTiles }) };
  });
}

describe('client live space authority', () => {
  it('adopts a verified revision in canvas and streaming keys without a player move', () => {
    const content = new LiveContentRegistry('space-authority', null);
    const firstRows = rowsWithDebugSize(32);
    const firstRegistry = buildContentRegistry(firstRows).registry;
    const previousState = content.update({
      packId: 'live', revision: 1n, contentHash: firstRegistry.contentHash,
      engineVersion: 1, definitionCount: firstRows.length,
    }, firstRows);
    const revisedRows = rowsWithDebugSize(64);
    const revisedRegistry = buildContentRegistry(revisedRows).registry;
    const revisedState = content.update({
      packId: 'live', revision: 2n, contentHash: revisedRegistry.contentHash,
      engineVersion: 1, definitionCount: revisedRows.length,
    }, revisedRows);
    const previous = clientSpaceDefinition(previousState.registry, DEBUG_SPACE_ID);
    const revised = clientSpaceDefinition(revisedState.registry, DEBUG_SPACE_ID);

    expect(previousState).toMatchObject({ source: 'live', status: 'ready', head: { revision: 1n } });
    expect(revisedState).toMatchObject({ source: 'live', status: 'ready', head: { revision: 2n } });
    expect(previous?.sizeTiles).toBe(32);
    expect(revised?.sizeTiles).toBe(64);
    expect(spacePresentationKey(revised)).not.toBe(spacePresentationKey(previous));
    expect(spaceStreamingKey(revised)).not.toBe(spaceStreamingKey(previous));
  });

  it('does not resurrect a removed static definition from the bootstrap registry', () => {
    const registry = buildContentRegistry(
      bootstrapContentRows().filter(({ id }) => id !== 'space:debug_flat'),
    ).registry;
    expect(clientSpaceDefinition(registry, DEBUG_SPACE_ID)).toBeUndefined();
    expect(spacePresentationKey(undefined)).toBe('missing');
    expect(spaceStreamingKey(undefined)).toBe('missing');
  });

  it('keeps static bootstrap lookup APIs out of runtime client paths', () => {
    expect(mainSource).toContain('clientSpaceDefinition(snapshot.content.registry');
    expect(connectionSource).toMatch(/clientSpaceDefinition\(\s*this\.content\.state\.registry,/);
    expect(mainSource).not.toContain('spaceDefinitionFor(');
    expect(connectionSource).not.toContain('spaceDefinitionFor(');
  });
});
