import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveIslandMapDocument } from '@orchard/sim';
import {
  StudioInspectorKernel,
  StudioNotifications,
  StudioSelectionBus,
  StudioValidationPanel,
} from '../../shell/index.js';

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly messages: unknown[] = [];
  readonly listeners = new Map<string, (event: { data: unknown; message?: string }) => void>();
  constructor() { FakeWorker.instances.push(this); }
  addEventListener(kind: string, listener: (event: { data: unknown; message?: string }) => void): void {
    this.listeners.set(kind, listener);
  }
  postMessage(message: unknown): void { this.messages.push(message); }
  terminate(): void { /* no-op test worker */ }
  reply(data: unknown): void { this.listeners.get('message')?.({ data }); }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  FakeWorker.instances = [];
});

describe('map editor validation worker queue', () => {
  it('keeps only the active and latest validation request', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const {
      loadMapEditorValidation,
      MAP_EDITOR_VALIDATION_SUPERSEDED,
    } = await import('./editor-validation-loader.js');
    const document = createLiveIslandMapDocument();
    const first = loadMapEditorValidation(document)!;
    const second = loadMapEditorValidation({ ...document, revision: 1 })!;
    const third = loadMapEditorValidation({ ...document, revision: 2 })!;
    await expect(second).rejects.toThrow(MAP_EDITOR_VALIDATION_SUPERSEDED);
    const instance = FakeWorker.instances[0]!;
    expect(instance.messages).toHaveLength(1);
    const firstRequest = instance.messages[0] as { requestId: number };
    instance.reply({ requestId: firstRequest.requestId, issues: [] });
    await expect(first).resolves.toEqual([]);
    expect(instance.messages).toHaveLength(2);
    const thirdRequest = instance.messages[1] as { requestId: number };
    instance.reply({ requestId: thirdRequest.requestId, issues: [{
      severity: 'warning', code: 'latest', message: 'latest document validated',
    }] });
    await expect(third).resolves.toEqual([expect.objectContaining({ code: 'latest' })]);
  });

  it('runs whole-map design checks only when explicitly requested', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    const {
      MAP_EDITOR_VALIDATION_DEBOUNCE_MS,
      MapEditorModel,
    } = await import('./model.js');
    const validation = new StudioValidationPanel();
    const model = new MapEditorModel('live-island', {
      selection: new StudioSelectionBus(),
      inspector: new StudioInspectorKernel(),
      validation,
      notifications: new StudioNotifications(),
      live: () => null,
    }, null);

    model.editTerrain({
      kind: 'paint',
      points: [{ tileX: 400, tileY: 400 }],
      patch: { surface: 'stone' },
    });
    expect(validation.issues()).toEqual([]);
    expect(FakeWorker.instances).toHaveLength(0);
    model.validateDesign();
    expect(validation.issues()).toEqual([expect.objectContaining({
      id: 'map_validation_pending', severity: 'info',
    })]);
    expect(FakeWorker.instances).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(MAP_EDITOR_VALIDATION_DEBOUNCE_MS - 1);
    expect(FakeWorker.instances).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    const instance = FakeWorker.instances[0]!;
    expect(instance.messages).toHaveLength(1);
    const request = instance.messages[0] as { requestId: number };
    instance.reply({ requestId: request.requestId, issues: [{
      severity: 'warning', code: 'worker_exact', message: 'worker validated edit',
      tileX: 400, tileY: 400,
    }] });
    await Promise.resolve();
    expect(validation.issues()).toEqual([{
      id: 'worker_exact:400:400',
      severity: 'warning',
      message: 'worker validated edit',
    }]);
  });

  it('cancels a pending validation debounce when its map model is disposed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    const {
      MAP_EDITOR_VALIDATION_DEBOUNCE_MS,
      MapEditorModel,
    } = await import('./model.js');
    const model = new MapEditorModel('live-island', {
      selection: new StudioSelectionBus(),
      inspector: new StudioInspectorKernel(),
      validation: new StudioValidationPanel(),
      notifications: new StudioNotifications(),
      live: () => null,
    }, null);

    model.editTerrain({
      kind: 'paint',
      points: [{ tileX: 400, tileY: 400 }],
      patch: { surface: 'stone' },
    });
    model.validateDesign();
    model.dispose();
    await vi.advanceTimersByTimeAsync(MAP_EDITOR_VALIDATION_DEBOUNCE_MS);

    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('unsubscribes map inspection from the shared selection bus when disposed', async () => {
    const { MapEditorModel } = await import('./model.js');
    const selection = new StudioSelectionBus();
    const inspector = new StudioInspectorKernel();
    const model = new MapEditorModel('live-island', {
      selection,
      inspector,
      validation: new StudioValidationPanel(),
      notifications: new StudioNotifications(),
      live: () => null,
    }, null);
    const inspect = vi.spyOn(inspector, 'inspect');
    inspect.mockClear();

    model.dispose();
    selection.select({ kind: 'tile', spaceId: 0, tileX: 400, tileY: 400 });

    expect(inspect).not.toHaveBeenCalled();
  });
});
