import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clientListenOptions, clientProxy } from '../vite.config.js';

const unit = readFileSync(new URL('../../../ops/orchard-runtime/systemd/orchard-frontend.service', import.meta.url), 'utf8');
const environment = readFileSync(new URL('../../../ops/orchard-runtime/orchard-client.env.example', import.meta.url), 'utf8');

describe('game static deployment', () => {
  it('serves only a prebuilt artifact and retains the same-origin database proxy', () => {
    expect(unit).toContain('ConditionPathExists=/home/toby/projects/orchard-cellar/packages/client/dist/index.html');
    expect(unit).toContain('npm run preview -w @orchard/client');
    expect(unit).not.toContain('npm run dev');
    expect(clientListenOptions).toMatchObject({ port: 5173, strictPort: true });
    expect(clientProxy['/v1']).toEqual({ target: 'http://127.0.0.1:3000', ws: true });
  });

  it('contains public production identifiers but no credential-shaped value', () => {
    expect(environment).toContain('VITE_OIDC_CLIENT_ID=orchard-web');
    expect(environment).toContain('VITE_SPACETIMEDB_URI=https://orchard.dastari.net');
    expect(environment).not.toMatch(/(?:SECRET|PASSWORD|PRIVATE_KEY|CLIENT_SECRET)=/u);
  });
});
