import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(
  new URL('../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);

describe('T9 operational query retirement', () => {
  it('exposes only bounded typed Studio procedures', () => {
    expect(worldSource).not.toContain('export const requestLastConnections =');
    expect(worldSource).not.toContain('export const requestBalanceTop =');
    expect(worldSource).toContain('export const adminConnectionsPage = spacetimedb.procedure(');
    expect(worldSource).toContain('export const adminFindPlayers = spacetimedb.procedure(');
  });

  it('contains no game-client operational subscription path', () => {
    expect(clientSource).not.toContain('requestLastConnections');
    expect(clientSource).not.toContain('requestBalanceTop');
    expect(clientSource).not.toContain('tables.requestLastConnections');
    expect(clientSource).not.toContain('tables.requestBalanceTop');
  });
});
