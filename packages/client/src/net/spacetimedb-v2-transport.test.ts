import { describe, expect, it } from 'vitest';
import { v2SubscribeUrl } from './spacetimedb-v2-transport.js';

describe('SpacetimeDB V2 transport', () => {
  it('preserves the connection id while disabling compression', () => {
    const url = v2SubscribeUrl(
      new URL('wss://orchard.test/?connection_id=abc123'),
      'orchard-cellar-world',
      'temporary-token',
      true,
      false,
    );
    expect(url.toString()).toBe(
      'wss://orchard.test/v1/database/orchard-cellar-world/subscribe'
      + '?connection_id=abc123&token=temporary-token&compression=None&light=true&confirmed=false',
    );
  });

  it('does not put the long-lived identity token in the subscribe URL', () => {
    const url = v2SubscribeUrl(new URL('ws://localhost:3000'), 'world');
    expect(url.searchParams.get('token')).toBeNull();
    expect(url.searchParams.get('compression')).toBe('None');
  });
});
