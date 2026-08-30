export type PwaUpdateStatus = 'unsupported' | 'current' | 'checking' | 'available' | 'updating' | 'error';

export const PWA_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1_000;
const PWA_HISTORY_GUARD_KEY = '__orchardPwaHistoryGuard';

export function pwaUpdateLabel(status: PwaUpdateStatus): string {
  if (status === 'available') return 'UPDATE';
  if (status === 'checking') return 'CHECKING';
  if (status === 'updating') return 'UPDATING';
  if (status === 'current') return 'CHECK UPDATE';
  if (status === 'error') return 'RETRY UPDATE';
  return 'UPDATE UNAVAILABLE';
}

export function isStandaloneWebApp(): boolean {
  const iosNavigator = navigator as Navigator & { readonly standalone?: boolean };
  return iosNavigator.standalone === true
    || matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches;
}

function editableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

export function shouldSuppressGameShellGesture(
  kind: 'touchmove' | 'gesturestart' | 'gesturechange' | 'wheel',
  cancelable: boolean,
  editing: boolean,
  ctrlKey = false,
): boolean {
  if (!cancelable || editing) return false;
  return kind !== 'wheel' || ctrlKey;
}

/**
 * Prevents document scrolling, pull-to-refresh, pinch zoom, and trackpad zoom
 * from stealing a full-screen game gesture. Hidden native text fields retain
 * normal editing behaviour for chat, filters, clipboard, and IME input.
 */
export function installGameShellGestureGuards(shell: HTMLElement): () => void {
  const suppress = (event: Event): void => {
    const kind = event.type as 'touchmove' | 'gesturestart' | 'gesturechange' | 'wheel';
    const ctrlKey = event instanceof WheelEvent && event.ctrlKey;
    if (shouldSuppressGameShellGesture(kind, event.cancelable, editableTarget(event.target), ctrlKey)) {
      event.preventDefault();
    }
  };
  shell.addEventListener('touchmove', suppress, { passive: false });
  shell.addEventListener('gesturestart', suppress, { passive: false });
  shell.addEventListener('gesturechange', suppress, { passive: false });
  shell.addEventListener('wheel', suppress, { passive: false, capture: true });
  return () => {
    shell.removeEventListener('touchmove', suppress);
    shell.removeEventListener('gesturestart', suppress);
    shell.removeEventListener('gesturechange', suppress);
    shell.removeEventListener('wheel', suppress, { capture: true });
  };
}

/** Installed game windows have no useful document history. Keep edge swipes
 * and Android's browser Back action inside the game, where Escape/Menu owns
 * navigation instead. Normal browser tabs retain ordinary history behaviour. */
export function installStandaloneHistoryGuard(): () => void {
  if (!isStandaloneWebApp()) return () => undefined;
  const original = history.state !== null && typeof history.state === 'object'
    ? history.state as Record<string, unknown> : {};
  history.replaceState({ ...original, [PWA_HISTORY_GUARD_KEY]: 'base' }, '', location.href);
  history.pushState({ ...original, [PWA_HISTORY_GUARD_KEY]: 'top' }, '', location.href);
  const restoreTop = (event: PopStateEvent): void => {
    const state = event.state as Record<string, unknown> | null;
    if (state?.[PWA_HISTORY_GUARD_KEY] === 'base') history.forward();
  };
  window.addEventListener('popstate', restoreTop);
  return () => window.removeEventListener('popstate', restoreTop);
}

/** Owns the service-worker update handshake. A downloaded worker remains in
 * the browser's waiting state until the player explicitly presses UPDATE, so
 * a live session is never replaced halfway through an action. */
export class PwaClient {
  private registration: ServiceWorkerRegistration | null = null;
  private listeners = new Set<(status: PwaUpdateStatus) => void>();
  private updateStatus: PwaUpdateStatus = 'unsupported';
  private reloadForUpdate = false;
  private activatedUpdate = false;
  private started = false;

  get status(): PwaUpdateStatus { return this.updateStatus; }

  subscribe(listener: (status: PwaUpdateStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.updateStatus);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (!import.meta.env.PROD || !isSecureContext || !('serviceWorker' in navigator)) return;
    this.setStatus('checking');
    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      this.observeRegistration(this.registration);
      const controllerAtStart = navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.reloadForUpdate) {
          this.reloadForUpdate = false;
          location.reload();
          return;
        }
        // Another open Orchard window may have activated the worker. Do not
        // reload this live session without consent; offer the same refresh UI.
        if (controllerAtStart !== null) {
          this.activatedUpdate = true;
          this.setStatus('available');
        }
      });
      this.refreshStatus();
      window.setInterval(() => void this.checkForUpdate(), PWA_UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.checkForUpdate();
      });
      window.addEventListener('online', () => void this.checkForUpdate());
      window.addEventListener('pageshow', () => void this.checkForUpdate());
    } catch {
      this.setStatus('error');
    }
  }

  async checkForUpdate(): Promise<void> {
    if (this.registration === null) {
      await this.start();
      return;
    }
    if (this.activatedUpdate || this.registration.waiting !== null) {
      this.setStatus('available');
      return;
    }
    this.setStatus('checking');
    try {
      await this.registration.update();
      this.refreshStatus();
    } catch {
      this.setStatus('error');
    }
  }

  applyUpdate(): void {
    if (this.activatedUpdate) {
      location.reload();
      return;
    }
    const worker = this.registration?.waiting;
    if (worker === null || worker === undefined) {
      void this.checkForUpdate();
      return;
    }
    this.reloadForUpdate = true;
    this.setStatus('updating');
    worker.postMessage({ type: 'SKIP_WAITING' });
  }

  private observeRegistration(registration: ServiceWorkerRegistration): void {
    const observeWorker = (worker: ServiceWorker | null): void => {
      if (worker === null) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') this.refreshStatus();
        else if (worker.state === 'redundant') this.setStatus('error');
      });
    };
    observeWorker(registration.installing);
    registration.addEventListener('updatefound', () => observeWorker(registration.installing));
  }

  private refreshStatus(): void {
    if (this.activatedUpdate) {
      this.setStatus('available');
      return;
    }
    if (this.registration?.waiting !== null && this.registration?.waiting !== undefined
      && navigator.serviceWorker.controller !== null) {
      this.setStatus('available');
      return;
    }
    this.setStatus('current');
  }

  private setStatus(status: PwaUpdateStatus): void {
    if (status === this.updateStatus) return;
    this.updateStatus = status;
    const announcement = document.querySelector<HTMLElement>('#pwa-update-status');
    if (announcement !== null) announcement.textContent = status === 'available'
      ? 'A new Orchard and Cellar version is ready. Refresh now or continue this session.'
      : status === 'updating' ? 'Updating Orchard and Cellar.' : '';
    for (const listener of this.listeners) listener(status);
  }
}

export const pwaClient = new PwaClient();
