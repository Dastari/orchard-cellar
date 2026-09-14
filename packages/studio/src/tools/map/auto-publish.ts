export const MAP_AUTO_PUBLISH_DEBOUNCE_MS = 250;

export type MapAutoPublishValidation = 'ready' | 'pending' | 'invalid';

export interface MapAutoPublishSnapshot {
  readonly enabled: boolean;
  readonly dirty: boolean;
  /** Changes whenever the local document content changes. */
  readonly editKey: string | object;
  readonly conflictRevision: number | null;
  readonly validation: MapAutoPublishValidation;
  readonly connected: boolean;
  readonly synchronizing: boolean;
  readonly writable: boolean;
  readonly authorized: boolean;
  readonly publishAvailable: boolean;
  readonly authorityPublishing: boolean;
}

export type MapAutoPublishState =
  | 'OFF'
  | 'CLEAN'
  | 'WAITING'
  | 'BLOCKED'
  | 'PUBLISHING'
  | 'QUEUED'
  | 'AWAITING_HEAD'
  | 'FAILED';

export interface MapAutoPublishPresentation {
  readonly state: MapAutoPublishState;
  readonly tooltip: string;
}

interface Scheduler {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

const DEFAULT_SCHEDULER: Scheduler = Object.freeze({
  set: (callback: () => void, delayMs: number): unknown => setTimeout(callback, delayMs),
  clear: (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

function blockedReason(snapshot: MapAutoPublishSnapshot): string | null {
  if (snapshot.conflictRevision !== null) {
    return `Live revision ${snapshot.conflictRevision} conflicts with this draft`;
  }
  if (snapshot.validation === 'pending') return 'Map validation is still updating';
  if (snapshot.validation === 'invalid') return 'Map validation has blocking errors';
  if (snapshot.synchronizing) return 'Wait for the live map subscription to synchronize';
  if (!snapshot.connected) return 'Connect to the live world to publish';
  if (!snapshot.writable) return 'This map route is read only';
  if (!snapshot.authorized) return 'Map publish permission is required';
  if (!snapshot.publishAvailable) return 'Live map publishing is unavailable';
  return null;
}

/** Latest-only publication coordinator. It owns debounce and attempt lifecycle,
 * but never owns the document or CAS authority: the supplied publish callback
 * must capture the model's checked-out base revision at invocation time. */
export class MapAutoPublishCoordinator {
  #snapshot: MapAutoPublishSnapshot | null = null;
  #publish: (() => Promise<void>) | null = null;
  #timer: unknown = null;
  #inFlight = false;
  #lastAttemptKey: string | object | null = null;
  #failedKey: string | object | null = null;
  #failureMessage: string | null = null;
  #disposed = false;
  #presentation: MapAutoPublishPresentation = Object.freeze({
    state: 'OFF', tooltip: 'AUTO PUBLISH OFF — Local edits require the Publish action',
  });

  constructor(
    private readonly changed: () => void = () => undefined,
    private readonly scheduler: Scheduler = DEFAULT_SCHEDULER,
  ) {}

  presentation(): MapAutoPublishPresentation { return this.#presentation; }

  observe(snapshot: MapAutoPublishSnapshot, publish: () => Promise<void>): void {
    if (this.#disposed) return;
    const previousKey = this.#snapshot?.editKey ?? null;
    this.#snapshot = snapshot;
    this.#publish = publish;
    if (previousKey !== snapshot.editKey) {
      this.#failedKey = null;
      this.#failureMessage = null;
      this.#cancelTimer();
    }
    this.#reconcile(false);
  }

  /** Routes the existing explicit Publish action through the same single-flight
   * gate. It works while automatic mode is off and is the only way, besides a
   * new edit key, to retry a failed automatic attempt. */
  requestManual(): boolean {
    if (this.#disposed || this.#snapshot === null || this.#publish === null) return false;
    const blocker = blockedReason(this.#snapshot);
    if (!this.#snapshot.dirty || blocker !== null) {
      this.#set(blocker === null
        ? { state: 'CLEAN', tooltip: 'CLEAN — No unpublished map changes' }
        : { state: 'BLOCKED', tooltip: `PUBLISH BLOCKED — ${blocker}` });
      return false;
    }
    this.#failedKey = null;
    this.#failureMessage = null;
    this.#lastAttemptKey = null;
    this.#cancelTimer();
    if (this.#inFlight || this.#snapshot.authorityPublishing) {
      this.#set({ state: 'QUEUED', tooltip: 'PUBLISH QUEUED — Waiting for the current publication' });
      return true;
    }
    this.#start(this.#snapshot.editKey);
    return true;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelTimer();
    this.#snapshot = null;
    this.#publish = null;
  }

  #reconcile(afterAttempt: boolean): void {
    const snapshot = this.#snapshot;
    if (snapshot === null) return;
    if (!snapshot.enabled) {
      this.#cancelTimer();
      this.#set(this.#inFlight
        ? { state: 'PUBLISHING', tooltip: 'PUBLISHING — Automatic mode is off after this in-flight request' }
        : { state: 'OFF', tooltip: 'AUTO PUBLISH OFF — Local edits require the Publish action' });
      return;
    }
    if (!snapshot.dirty) {
      this.#cancelTimer();
      this.#failedKey = null;
      this.#set({ state: 'CLEAN', tooltip: 'AUTO PUBLISH ON · CLEAN — No unpublished map changes' });
      return;
    }
    const blocker = blockedReason(snapshot);
    if (blocker !== null) {
      this.#cancelTimer();
      this.#set(snapshot.authorityPublishing || this.#inFlight
        ? { state: 'PUBLISHING', tooltip: 'PUBLISHING — Waiting for live authority' }
        : { state: 'BLOCKED', tooltip: `AUTO PUBLISH BLOCKED — ${blocker}` });
      return;
    }
    if (this.#inFlight || snapshot.authorityPublishing) {
      this.#cancelTimer();
      const queued = snapshot.editKey !== this.#lastAttemptKey;
      this.#set(queued
        ? { state: 'QUEUED', tooltip: 'AUTO PUBLISH QUEUED — Latest edit waits for the current publication' }
        : { state: 'PUBLISHING', tooltip: 'PUBLISHING — Waiting for live authority' });
      return;
    }
    if (this.#failedKey === snapshot.editKey) {
      this.#cancelTimer();
      this.#set({ state: 'FAILED',
        tooltip: `AUTO PUBLISH PAUSED — ${this.#failureMessage ?? 'Publication failed'}; edit again or use Publish to retry` });
      return;
    }
    if (this.#lastAttemptKey === snapshot.editKey) {
      this.#cancelTimer();
      this.#set({ state: 'AWAITING_HEAD',
        tooltip: 'AUTO PUBLISH SENT — Waiting for the subscribed live head' });
      return;
    }
    if (afterAttempt || this.#timer === null) this.#schedule(snapshot.editKey);
  }

  #schedule(editKey: string | object): void {
    this.#cancelTimer();
    this.#timer = this.scheduler.set(() => {
      this.#timer = null;
      if (this.#disposed || this.#snapshot?.editKey !== editKey) return;
      const blocker = blockedReason(this.#snapshot);
      if (!this.#snapshot.enabled || !this.#snapshot.dirty || blocker !== null
        || this.#inFlight || this.#snapshot.authorityPublishing
        || this.#lastAttemptKey === editKey || this.#failedKey === editKey) {
        this.#reconcile(false);
        return;
      }
      this.#start(editKey);
    }, MAP_AUTO_PUBLISH_DEBOUNCE_MS);
    this.#set({ state: 'WAITING',
      tooltip: `AUTO PUBLISH ON — Publishing the latest edit after ${MAP_AUTO_PUBLISH_DEBOUNCE_MS} ms` });
  }

  #start(editKey: string | object): void {
    const publish = this.#publish;
    if (publish === null || this.#disposed) return;
    this.#inFlight = true;
    this.#lastAttemptKey = editKey;
    this.#set({ state: 'PUBLISHING', tooltip: 'PUBLISHING — Waiting for live authority' });
    void publish().then(() => {
      if (this.#disposed) return;
      this.#inFlight = false;
      this.#reconcile(true);
    }).catch((error: unknown) => {
      if (this.#disposed) return;
      this.#inFlight = false;
      this.#failedKey = editKey;
      this.#failureMessage = (error instanceof Error ? error.message : String(error)).slice(0, 160);
      this.#reconcile(false);
    });
  }

  #cancelTimer(): void {
    if (this.#timer === null) return;
    this.scheduler.clear(this.#timer);
    this.#timer = null;
  }

  #set(presentation: MapAutoPublishPresentation): void {
    if (presentation.state === this.#presentation.state
      && presentation.tooltip === this.#presentation.tooltip) return;
    this.#presentation = Object.freeze(presentation);
    this.changed();
  }
}
