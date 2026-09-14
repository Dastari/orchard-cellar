import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../ops/orchard-auth/bin/reconcile-studio-client.sh', import.meta.url), 'utf8');
const restoreSource = readFileSync(new URL('../../../ops/orchard-auth/bin/restore-test.sh', import.meta.url), 'utf8');

describe('Studio Keycloak client reconciliation guardrails', () => {
  it('targets exactly one reviewed public PKCE client and prompts privately', () => {
    expect(source).toContain("clientId === 'orchard-studio'");
    expect(source).toContain("read -rsp");
    expect(source).toContain("['https://cellar.dastari.net/']");
    expect(source).toContain("['https://cellar.dastari.net']");
    expect(source).toContain("'pkce.code.challenge.method'] !== 'S256'");
    expect(source).not.toContain('client-secret');
  });

  it('proves exact redirect acceptance and rejects game and localhost redirects', () => {
    expect(source).toContain('redirect_uri=https%3A%2F%2Fcellar.dastari.net%2F');
    expect(source).toContain('redirect_uri=https%3A%2F%2Forchard.dastari.net%2F');
    expect(source).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5174%2F');
    expect(source).toContain('[[ "$game_status" = 400 ]]');
    expect(source).toContain('[[ "$local_status" = 400 ]]');
  });

  it('removes the in-container administrator session on every exit path', () => {
    const cleanup = source.slice(source.indexOf('cleanup() {'), source.indexOf('trap cleanup'));
    expect(source).toContain('kcadm_config=/tmp/orchard-kcadm.config');
    expect(cleanup).toContain('docker compose exec -T keycloak rm -f "$kcadm_config"');
    expect(source).toContain('trap cleanup EXIT INT TERM');
    expect(source.match(/--config "\$kcadm_config"/gu)).toHaveLength(6);
  });
});

describe('Keycloak restore-test topology guardrails', () => {
  it('defaults to requiring the post-change two-client topology', () => {
    expect(restoreSource).toContain('AUTH_RESTORE_EXPECT_STUDIO_CLIENT:-true');
    expect(restoreSource).toContain('true) expected_studio_count=1');
    expect(restoreSource).toContain("client.client_id = 'orchard-web'");
    expect(restoreSource).toContain("client.client_id = 'orchard-studio'");
  });

  it('has an explicit pre-change mode and rejects ambiguous values before restore work', () => {
    expect(restoreSource).toContain('false) expected_studio_count=0');
    expect(restoreSource).toContain('AUTH_RESTORE_EXPECT_STUDIO_CLIENT must be true or false.');
    expect(restoreSource.indexOf('case "$expect_studio_client"')).toBeLessThan(restoreSource.indexOf('docker network create'));
    expect(restoreSource).toContain('"$studio_client_count" == "$expected_studio_count"');
  });
});
