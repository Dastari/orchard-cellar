import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

describe('Studio NPM generated-log reconciler', () => {
  it('targets exactly one host config and replaces only the query-bearing generated log', async () => {
    const script = await readFile(resolve(root, 'ops/orchard-auth/npm/reconcile-studio-log.sh'), 'utf8');
    expect(script).toContain('server_name $host;');
    expect(script).toContain('[[ ${#configs[@]} -eq 1 ]]');
    expect(script).toContain('proxy-host-[0-9]+_access[.]log proxy;');
    expect(script).toContain('proxy-host-[0-9]+_access[.]log orchard_studio;');
    expect(script).toContain('nginx -t; nginx -s reload');
    expect(script).not.toContain('$request_uri');
  });
});
