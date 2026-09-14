interface ConnectionLifecycleTarget extends EventTarget {
  readonly hidden: boolean;
}

/** Safari can restore a PWA through pageshow without a visibility transition.
 * Keep both routes idempotent, and never run a catch-up loop while hidden. */
export function installConnectionLifecycle(
  page: EventTarget,
  document: ConnectionLifecycleTarget,
  callbacks: { readonly suspend: () => void; readonly resume: () => void; readonly connectionChanged: () => void },
): () => void {
  const visibility = (): void => { if (document.hidden) callbacks.suspend(); else callbacks.resume(); };
  const show = (): void => { if (!document.hidden) callbacks.resume(); };
  const hide = (): void => callbacks.suspend();
  const online = (): void => { callbacks.connectionChanged(); if (!document.hidden) callbacks.resume(); };
  const offline = (): void => callbacks.connectionChanged();
  document.addEventListener('visibilitychange', visibility);
  page.addEventListener('pagehide', hide);
  page.addEventListener('pageshow', show);
  page.addEventListener('online', online);
  page.addEventListener('offline', offline);
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    page.removeEventListener('pagehide', hide);
    page.removeEventListener('pageshow', show);
    page.removeEventListener('online', online);
    page.removeEventListener('offline', offline);
  };
}
