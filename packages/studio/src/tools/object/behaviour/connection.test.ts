import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type {
  StudioConnectionView,
  StudioLiveAdapter,
} from '../../../shell/studio-connection.js';
import {
  objectBehaviourAccessForConnection,
  objectBehaviourPublishAdapterFromConnection,
  objectDefinitionsFromConnection,
} from './connection.js';

const mountedObjectSource = readFileSync(new URL('../canvas.ts', import.meta.url), 'utf8');

function adapter(view: Partial<StudioConnectionView> = {}): StudioLiveAdapter {
  return {
    view: () => ({ connected: true, ...view }) as StudioConnectionView,
    connect: () => undefined,
    disconnect: () => undefined,
  };
}

describe('Object Studio Behaviour contribution connection', () => {
  it('keeps anonymous construction disconnected and maps connected route access', () => {
    expect(objectBehaviourAccessForConnection('write', null)).toBe('anonymous');
    expect(objectBehaviourAccessForConnection('write', adapter())).toBe('write');
    expect(objectBehaviourAccessForConnection('read_only', adapter())).toBe('read_only');
    expect(objectBehaviourAccessForConnection('write', adapter({ connected: false }))).toBe('anonymous');
  });

  it('exposes object rows and delegates publishing only through the shell adapter', async () => {
    const publishContentChangeSet = vi.fn(async () => undefined);
    const live = {
      ...adapter({
        contentDefinitions: [{
          id: 'object:lamp', kind: 'object', json: JSON.stringify({
            id: 'object:lamp', kind: 'object', schemaVersion: 1,
            displayName: 'Lamp', components: {},
          }),
        }] as never,
      }),
      publishContentChangeSet,
    };
    expect(objectDefinitionsFromConnection(live.view()).map(({ id }) => id)).toEqual(['object:lamp']);
    const publishing = objectBehaviourPublishAdapterFromConnection(live);
    expect(publishing).not.toBeNull();
    const request = {
      packId: 'live' as const, expectedRevision: 2n, clientMutationId: 'object.lamp.2',
      upserts: '[]', deletes: '[]', note: 'test',
    };
    await publishing!.publishContentChangeSet(request);
    expect(publishContentChangeSet).toHaveBeenCalledWith(request);
    expect(objectBehaviourPublishAdapterFromConnection(adapter())).toBeNull();
  });

  it('builds the declared Behaviour workspace inside the canvas Object Studio', () => {
    expect(mountedObjectSource).toContain("mode: 'prefab' | 'behaviour'");
    expect(mountedObjectSource).toContain("{value:'behaviour',label:'Behaviour'}");
    expect(mountedObjectSource).toContain('object-behaviour-tabs');
  });
});
