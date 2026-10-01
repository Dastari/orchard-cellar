import { describe, expect, it } from 'vitest';
import { UiRoot } from '@orchard/ui/studio';
import { studioMapLoadStatus } from './map-load-status.js';

describe('Map-only startup presentation', () => {
  it('shows retry progress with other tools available and no sign-in action', () => {
    const root = new UiRoot({ scale: 2 }); root.resize(720, 540);
    root.mount(studioMapLoadStatus({ connected: true, mapError: 'Delivery interrupted. Retrying…', mapLoadProgress: { verifiedChunks: 120, totalChunks: 169, attempt: 2 } }, 'Waiting for the live map'));
    root.arrange();
    const texts = root.entries().map(({ element }) => element.props['text']).filter(Boolean);
    expect(texts).toContain('120 of 169 chunks verified · attempt 2');
    expect(texts).toContain('Delivery interrupted. Retrying…');
    expect(texts).toContain('You can use the other Studio tools while the map loads.');
    expect(root.entries().some(({ element }) => element.focusable)).toBe(false);
    expect(texts.join(' ')).not.toMatch(/sign in|reconnect/iu);
    root.dispose();
  });

  it('supports older adapters without optional status fields', () => {
    const surface = studioMapLoadStatus({ connected: true }, 'Waiting for the live map');
    expect(surface.children.map(child => child.props['text'])).toContain('Waiting for the live map');
    surface.dispose();
  });
});
