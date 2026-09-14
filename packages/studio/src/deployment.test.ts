import { describe, expect, it } from 'vitest';
import studioHtml from '../index.html?raw';
import realmJson from '../../../ops/orchard-auth/realm/orchard-realm.json?raw';
import edgeHttpTop from '../../../ops/orchard-auth/npm/http_top.conf?raw';
import studioEnvironment from '../../../ops/orchard-runtime/orchard-studio.env.example?raw';
import studioProxyFragment from '../../../ops/orchard-runtime/npm/orchard-studio.conf?raw';
import studioUnit from '../../../ops/orchard-runtime/systemd/orchard-studio.service?raw';
import {
  STUDIO_PRODUCTION_CSP,
  STUDIO_DOCUMENT_CSP,
  developmentCsp,
  studioListenOptions,
  studioProxy,
  studioSecurityHeaders,
} from '../vite.config.js';

describe('Orchard Studio static deployment', () => {
  it('ships the production policy in its own HTML entry', () => {
    expect(studioHtml).toContain(`content="${STUDIO_DOCUMENT_CSP}"`);
    expect(STUDIO_DOCUMENT_CSP).not.toContain('frame-ancestors');
    expect(STUDIO_PRODUCTION_CSP).toContain("frame-ancestors 'none'");
    expect(STUDIO_PRODUCTION_CSP).toContain("style-src 'self';");
    expect(STUDIO_PRODUCTION_CSP).not.toContain("style-src 'self' 'unsafe-inline'");
    expect(STUDIO_PRODUCTION_CSP).toContain('https://auth.orchard.dastari.net');
    expect(STUDIO_PRODUCTION_CSP).toContain('wss://cellar.dastari.net');
    expect(STUDIO_PRODUCTION_CSP).not.toContain('wss://orchard.dastari.net');
  });

  it('adds only Vite development exceptions to the document policy', () => {
    const development = developmentCsp(STUDIO_PRODUCTION_CSP);
    expect(development).toContain("worker-src 'self' blob:;");
    expect(development).toContain("style-src 'self' 'unsafe-inline';");
    expect(development).toContain("script-src 'self' 'unsafe-eval';");
  });

  it('keeps static-preview traffic on the loopback SpaceTimeDB proxy', () => {
    expect(studioListenOptions).toEqual({
      port: 5174,
      strictPort: true,
      allowedHosts: ['cellar.dastari.net'],
    });
    expect(studioProxy['/v1']).toEqual({ target: 'http://127.0.0.1:3000', ws: true });
    expect(Object.keys(studioProxy)).toEqual(['/v1']);
    expect(studioSecurityHeaders['Content-Security-Policy']).toBe(STUDIO_PRODUCTION_CSP);
    expect(studioSecurityHeaders['Cache-Control']).toBe('no-store');
  });

  it('pins a separate exact-origin public OIDC client', () => {
    const realm = JSON.parse(realmJson) as {
      clients: Array<{
        clientId: string;
        publicClient: boolean;
        standardFlowEnabled: boolean;
        implicitFlowEnabled: boolean;
        directAccessGrantsEnabled: boolean;
        serviceAccountsEnabled: boolean;
        redirectUris: string[];
        webOrigins: string[];
        attributes: Record<string, string>;
        protocolMappers: Array<{ config: Record<string, string> }>;
      }>;
    };
    const studioClient = realm.clients.find(({ clientId }) => clientId === 'orchard-studio');

    expect(studioClient).toMatchObject({
      publicClient: true,
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      redirectUris: ['https://cellar.dastari.net/'],
      webOrigins: ['https://cellar.dastari.net'],
    });
    expect(studioClient?.attributes['pkce.code.challenge.method']).toBe('S256');
    expect(studioClient?.attributes['post.logout.redirect.uris'])
      .toBe('https://cellar.dastari.net/');
    expect(studioClient?.protocolMappers[0]?.config['included.client.audience'])
      .toBe('orchard-studio');
  });

  it('keeps the build environment, static unit, and edge fragment aligned', () => {
    expect(studioEnvironment).toContain('VITE_SPACETIMEDB_PRODUCTION_URI=https://cellar.dastari.net');
    expect(studioEnvironment).toContain('VITE_SPACETIMEDB_LOCAL_URI=https://cellar.dastari.net');
    expect(studioEnvironment).toContain('VITE_OIDC_CLIENT_ID=orchard-studio');
    expect(studioEnvironment).toContain('VITE_OIDC_REDIRECT_URI=https://cellar.dastari.net/');
    expect(studioEnvironment).toContain('VITE_ENABLE_LOCAL_PROFILES=false');
    expect(studioUnit).toContain('ConditionPathExists=/home/toby/projects/orchard-cellar/packages/studio/dist/index.html');
    expect(studioUnit).toContain('npm run preview -w @orchard/studio');
    expect(studioUnit).toContain('--host 10.0.1.150 --port 5174 --strictPort');
    expect(studioProxyFragment).toContain('http://10.0.1.150:5174');
    expect(edgeHttpTop).toContain('log_format orchard_studio');
    expect(edgeHttpTop).toContain('$request_method $uri $server_protocol');
    expect(edgeHttpTop).not.toContain('$request_uri');
    expect(edgeHttpTop).toContain('map $uri $orchard_studio_client_key');
    expect(edgeHttpTop).toContain('~^/(?:assets|generated|ui)(?:/|$) "";');
    expect(edgeHttpTop).toContain('limit_req_zone $orchard_studio_client_key zone=orchard_studio_dynamic_per_ip:10m rate=30r/s;');
    expect(edgeHttpTop).toContain('limit_conn_zone $orchard_studio_client_key zone=orchard_studio_dynamic_connections:10m;');
    expect(studioProxyFragment).toContain('access_log /data/logs/orchard-studio_access.log orchard_studio;');
    expect(studioProxyFragment).toContain('limit_req zone=orchard_studio_dynamic_per_ip burst=120 nodelay;');
    expect(studioProxyFragment).toContain('limit_conn orchard_studio_dynamic_connections 24;');
    expect(studioProxyFragment).toContain(STUDIO_PRODUCTION_CSP);
    expect(studioProxyFragment).toContain('more_set_headers "Content-Security-Policy:');
    expect(studioProxyFragment).not.toContain('add_header Content-Security-Policy');
  });
});
