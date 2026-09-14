export interface StudioFileDownloadPayload {
  readonly filename: string;
  readonly blob: Blob;
}

export interface StudioFileDownloadAnchor {
  href: string;
  download: string;
  rel: string;
  click(): void;
  remove(): void;
}

export interface StudioFileDownloadRuntime {
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createAnchor(): StudioFileDownloadAnchor;
  appendAnchor(anchor: StudioFileDownloadAnchor): void;
}

export type StudioFileDownloadResult =
  | { readonly ok: true; readonly status: 'requested' }
  | { readonly ok: false; readonly code: 'unavailable' | 'failed'; readonly message: string };

/** Resolves browser capabilities at activation time. Preview/test runtimes may
 * omit all DOM download machinery even though they can render the Canvas. */
export function browserStudioFileDownloadRuntime(): StudioFileDownloadRuntime | null {
  if (typeof document === 'undefined' || document.body === null
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
    || typeof URL.revokeObjectURL !== 'function') return null;
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
    appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
  };
}

/** Requests the browser download and releases both temporary resources on all
 * success/failure paths. The result says requested, never saved: browsers may
 * still ask the user for permission or redirect downloads externally. */
export function requestStudioFileDownload(
  payload: StudioFileDownloadPayload,
  runtime: StudioFileDownloadRuntime | null = browserStudioFileDownloadRuntime(),
): StudioFileDownloadResult {
  if (runtime === null) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'This browser preview does not provide a file-download bridge.',
    };
  }

  let objectUrl: string | null = null;
  let anchor: StudioFileDownloadAnchor | null = null;
  try {
    objectUrl = runtime.createObjectUrl(payload.blob);
    anchor = runtime.createAnchor();
    anchor.href = objectUrl;
    anchor.download = payload.filename;
    anchor.rel = 'noopener';
    runtime.appendAnchor(anchor);
    anchor.click();
    return { ok: true, status: 'requested' };
  } catch {
    return {
      ok: false,
      code: 'failed',
      message: 'The browser rejected the file download request.',
    };
  } finally {
    try { anchor?.remove(); } catch { /* Best-effort detached-node cleanup. */ }
    if (objectUrl !== null) {
      try { runtime.revokeObjectUrl(objectUrl); } catch { /* URL cannot be reused after this request. */ }
    }
  }
}
