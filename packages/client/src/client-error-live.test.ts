import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('authenticated client error transport', () => {
  it('attaches the singleton only after connect and detaches on both failure paths', async () => {
    const source = await readFile(new URL('./net/overworld-connection.ts', import.meta.url), 'utf8');
    const connected = source.indexOf('clientErrorReporter.attach(');
    const reducer = source.indexOf('connection.reducers.reportClientError(');
    const connectError = source.indexOf('.onConnectError(');
    const disconnected = source.indexOf('.onDisconnect(');
    expect(connected).toBeGreaterThan(source.indexOf('.onConnect('));
    expect(reducer).toBeGreaterThan(connected);
    expect(source.slice(connectError, disconnected)).toContain('this.recovery.fail(generation,');
    expect(source.slice(disconnected, source.indexOf('private clearHeldInput'))).toContain('this.recovery.fail(generation,');
    expect(source).toContain('disconnect: () => this.releaseConnection()');
    expect(source.slice(source.indexOf('private releaseConnection'), source.indexOf('  view():'))).toContain('clientErrorReporter.detach()');
    expect(source.slice(connected, reducer + 500)).not.toMatch(/(?:token|authorization):\s*report/u);
  });
});
