export type PwaUpdateStatus = 'unsupported' | 'current' | 'checking' | 'available' | 'updating' | 'error';

export function pwaUpdateLabel(status: PwaUpdateStatus): string {
  if (status === 'available') return 'UPDATE';
  if (status === 'checking') return 'CHECKING';
  if (status === 'updating') return 'UPDATING';
  if (status === 'current') return 'CHECK UPDATE';
  if (status === 'error') return 'RETRY UPDATE';
  return 'WEB VERSION';
}

export function isStandaloneWebApp(): boolean {
  const iosNavigator = navigator as Navigator & { readonly standalone?: boolean };
  return iosNavigator.standalone === true
    || matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches;
}

/** Owns the service-worker update handshake. A downloaded worker remains in
 * the browser's waiting state until the player explicitly presses UPDATE, so
 * a live session is never replaced halfway through an action. */
export class PwaClient {
  private registration: ServiceWorkerRegistration | null = null;
  private listeners = new Set<(status: PwaUpdateStatus) => void>();
  private updateStatus: PwaUpdateStatus = 'unsupported';
  private reloadForUpdate = false;
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
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!this.reloadForUpdate && this.updateStatus !== 'available' && this.updateStatus !== 'updating') return;
        this.reloadForUpdate = false;
        location.reload();
      });
      this.refreshStatus();
      window.setInterval(() => void this.checkForUpdate(), 30 * 60 * 1_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.checkForUpdate();
      });
    } catch {
      this.setStatus('error');
    }
  }

  async checkForUpdate(): Promise<void> {
    if (this.registration === null) {
      await this.start();
      return;
    }
    if (this.registration.waiting !== null) {
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
    for (const listener of this.listeners) listener(status);
  }
}

export const pwaClient = new PwaClient();
