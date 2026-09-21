import { describe, expect, it } from 'vitest';
import { StudioShellController, type StudioConnectionFactory } from './controller.js';
import type { StudioConnectionView, StudioLiveAdapter } from './studio-connection.js';

const LIVE_VIEW: StudioConnectionView = {
  connected: true, synchronizing: false, identity: 'identity-1', role: 'admin',
  contentRevision: 8n, mapRevision: 12, mapDocument: null,
  publishingMap: false, worldMutating: false, error: null,
  rows: { placeables: [], npcs: [], homesteads: [], players: [] },
};

describe('Studio anonymous/live boundary', () => {
  it('constructs no auth or live adapter until explicit connect', async () => {
    let constructions = 0;
    let changed = (): void => undefined;
    const factory: StudioConnectionFactory = async (_environment, onChanged) => {
      constructions += 1;
      changed = onChanged;
      return { view: () => LIVE_VIEW, connect: () => changed(), disconnect: () => undefined };
    };
    const controller = new StudioShellController(factory, null);
    expect(constructions).toBe(0);
    expect(controller.tools.routes(null).map(({ tool }) => tool.mode)).toEqual(expect.arrayContaining(['build', 'author']));
    expect(controller.tools.routes(null).some(({ tool }) => tool.mode === 'operate')).toBe(false);
    controller.chooseEnvironment('production');
    expect(constructions).toBe(0);
    await controller.connectExplicit();
    expect(constructions).toBe(1);
    expect(controller.session.snapshot()).toMatchObject({ phase: 'connected', role: 'admin', mapRevision: 12 });
  });

  it('does not expose a live adapter for sandbox connect attempts', async () => {
    const factory: StudioConnectionFactory = async (): Promise<StudioLiveAdapter> => {
      throw new Error('must_not_construct');
    };
    const controller = new StudioShellController(factory, null);
    await expect(controller.connectExplicit()).rejects.toThrow('live_environment_required');
  });

  it('begins production authentication before constructing the adapter', async () => {
    const events: string[] = [];
    const controller = new StudioShellController(
      async (): Promise<StudioLiveAdapter> => {
        events.push('adapter');
        throw new Error('must_not_construct_during_redirect');
      },
      null,
      () => undefined,
      async () => { events.push('authenticate'); return 'redirecting'; },
    );
    controller.chooseEnvironment('production');
    await controller.connectExplicit();
    expect(events).toEqual(['authenticate']);
    expect(controller.session.snapshot().phase).toBe('connecting');
  });

  it('fails closed when an applied subscription has no effective Studio role', async () => {
    let changed = (): void => undefined;
    let liveView: StudioConnectionView = { ...LIVE_VIEW, synchronizing: true, role: null };
    const controller = new StudioShellController(async (_environment, onChanged) => {
      changed = onChanged;
      return { view: () => liveView, connect: () => changed(), disconnect: () => undefined };
    }, null);
    controller.chooseEnvironment('production');
    await controller.connectExplicit();
    expect(controller.session.snapshot().phase).toBe('connecting');
    liveView = { ...liveView, synchronizing: false };
    changed();
    expect(controller.session.snapshot()).toMatchObject({ phase: 'error', role: null, error: 'studio_role_required' });
  });

  it('indexes accessible tools in search everywhere and resolves commands to routes', () => {
    const controller = new StudioShellController(async () => { throw new Error('unused'); }, null);
    expect(controller.palette.search('tile editor')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tool.open:tiles' }),
    ]));
    expect(controller.routeForCommand('tool.open:tiles')).toBe('/build/tiles');
    expect(controller.routeForCommand('map.frame')).toBe('/build/map');
    expect(controller.routeForCommand('missing.command')).toBeNull();
  });

  it('owns one grid visibility preference for every canvas route', () => {
    let changes = 0;
    const controller = new StudioShellController(async () => { throw new Error('unused'); }, null, () => { changes += 1; });
    expect(controller.gridVisible()).toBe(true);
    expect(controller.toggleGrid()).toBe(false);
    controller.navigate('/build/tiles');
    expect(controller.gridVisible()).toBe(false);
    expect(controller.toggleGrid()).toBe(true);
    expect(changes).toBe(3);
  });

  it('evicts only the retained tool state owned by the departing lifecycle', () => {
    const controller = new StudioShellController(async () => { throw new Error('unused'); }, null);
    const retained = {};
    expect(controller.toolState('map-canvas:live-island', () => retained)).toBe(retained);
    expect(controller.releaseToolState('map-canvas:live-island', {})).toBe(false);
    expect(controller.toolState('map-canvas:live-island', () => { throw new Error('must remain'); })).toBe(retained);
    expect(controller.releaseToolState('map-canvas:live-island', retained)).toBe(true);
    const replacement = {};
    expect(controller.toolState('map-canvas:live-island', () => replacement)).toBe(replacement);
  });
});

it('revokes connected editing state immediately after transport disconnect',async()=>{
 let changed=()=>{};let view:StudioConnectionView={...LIVE_VIEW};
 const controller=new StudioShellController(async(_environment,onChanged)=>{changed=onChanged;return {view:()=>view,connect:()=>changed(),disconnect:()=>undefined};},null);
 controller.chooseEnvironment('production');await controller.connectExplicit();
 expect(controller.session.snapshot().phase).toBe('connected');view={...view,connected:false,error:null};changed();
 expect(controller.session.snapshot()).toMatchObject({phase:'error',role:null});
});
