import { describe, expect, it, vi } from 'vitest';
import { StudioNotifications } from './notifications.js';
import { buildLiveOutliner } from './outliners.js';
import { StudioSelectionBus } from './selection.js';

const identity = (value: string) => ({ toHexString: () => value });

describe('Studio shell services', () => {
  it('broadcasts typed cross-tool selection and supports disposal', () => {
    const bus = new StudioSelectionBus(); const listener = vi.fn(); const dispose = bus.subscribe(listener);
    bus.select({ kind: 'player', identity: 'abc', spaceId: 2 });
    expect(listener).toHaveBeenCalledWith({ kind: 'player', identity: 'abc', spaceId: 2 });
    dispose(); bus.select({ kind: 'definition', definitionKind: 'item', id: 'apple' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('creates actionable head-conflict notifications', () => {
    const notifications = new StudioNotifications();
    expect(notifications.conflict('map', '12', '13')).toMatchObject({ kind: 'conflict', title: 'Map head conflict' });
    expect(notifications.items()[0]?.detail).toContain('Review the diff before retrying');
  });

  it('groups deterministic mock Live Outliner rows by space', () => {
    const outliner = buildLiveOutliner({
      placeables: [{ id: 4n, spaceId: 2, kind: 'apple_press' }],
      npcs: [{ id: 3n, spaceId: 0, kind: 'farmer_jane' }],
      homesteads: [{ spaceId: 2, owner: identity('owner') }],
      players: [{ identity: identity('player'), spaceId: 0, displayName: 'Farmer' }],
    });
    expect(outliner.map(({ id }) => id)).toEqual(['live-space:0', 'live-space:2']);
    expect(outliner[0]?.children.map(({ label }) => label)).toEqual(['Farmer', 'farmer_jane']);
    expect(outliner[1]?.children.map(({ label }) => label)).toEqual(['apple_press', 'Homestead 2']);
  });
});
