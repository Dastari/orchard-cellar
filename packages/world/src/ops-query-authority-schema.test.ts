import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(
  new URL('../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);

function sourceBetween(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('T9 transient operational query authority', () => {
  it('exposes no request reducers and gates private scans before reading their tables', () => {
    const last = sourceBetween(
      worldSource,
      'export const requestLastConnections = spacetimedb.view(',
      'export const requestBalanceTop = spacetimedb.view(',
    );
    const balances = sourceBetween(
      worldSource,
      'export const requestBalanceTop = spacetimedb.view(',
      'export const ownChatChannels = spacetimedb.view(',
    );
    expect(worldSource).not.toContain('export const requestLastConnections = spacetimedb.reducer');
    expect(worldSource).not.toContain('export const requestBalanceTop = spacetimedb.reducer');
    expect(last.indexOf("membership?.role !== 'owner'")).toBeLessThan(last.indexOf('connection_audit.iter()'));
    expect(balances.indexOf('membership === null')).toBeLessThan(balances.indexOf('player_wallet.iter()'));
    expect(last).toContain('membership.blocked');
    expect(last).toContain('membership.revokedAt !== undefined');
    expect(balances).toContain('membership.blocked');
    expect(balances).toContain('membership.revokedAt !== undefined');
  });

  it('subscribes only on command and unsubscribes after copying the bounded projection', () => {
    const requests = sourceBetween(
      clientSource,
      'requestLastConnections(): Promise<void>',
      'sendWhisper(recipient: Identity',
    );
    expect(requests).toContain('.subscribe(tables.requestLastConnections)');
    expect(requests).toContain('.subscribe(tables.requestBalanceTop)');
    expect(requests.match(/handle\?\.unsubscribe\(\)/g)).toHaveLength(2);
    expect(sourceBetween(clientSource, 'private subscribeSelf(', 'private subscribeRegion('))
      .not.toContain('tables.requestLastConnections');
    expect(sourceBetween(clientSource, 'private subscribeSelf(', 'private subscribeRegion('))
      .not.toContain('tables.requestBalanceTop');
  });
});
