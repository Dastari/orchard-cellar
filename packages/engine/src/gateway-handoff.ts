/**
 * Keeps the last frame on screen across our own page loads (owner UI fix item 5).
 *
 * The title, account and world screens are separate page loads. Each new page
 * showed the bare island for about half a second until its kit art loaded, so
 * the gateway frame vanished and reappeared at every step. Just before one of
 * our pages navigates to another, it stores a small snapshot of its canvas; the
 * next page's classic boot script (`public/gateway-handoff-boot.js`) paints it
 * before the game bundle loads, and the loading screen's first real frame
 * replaces it. Anything that fails (quota, tainted canvas, an old or mismatched
 * snapshot) silently falls back to the island. The Keycloak hop never hands off.
 */

export const GATEWAY_HANDOFF_KEY = 'orchard.gateway-handoff';
export const GATEWAY_HANDOFF_MAX_AGE_MS = 15_000;
export const GATEWAY_HANDOFF_MAX_EDGE = 1280;
/** sessionStorage is shared with the OIDC session, so an oversized snapshot is skipped. */
export const GATEWAY_HANDOFF_MAX_CHARS = 1_500_000;
/** Mirrors the boot script's check: only base64 WebP or JPEG data URLs are painted. */
export const GATEWAY_HANDOFF_DATA_PATTERN = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/;

type HandoffStorage = Pick<Storage, 'setItem'>;
type SnapshotCanvas = Pick<HTMLCanvasElement, 'width' | 'height' | 'toDataURL' | 'getContext'>;

/** A DOM flag, so the boot script need not load the game bundle to know. */
const FRAME_STARTED_ATTRIBUTE = 'data-gateway-frame';

/** Called once the loading screen or gateway takes over the canvas. */
export function markGatewayFrameStarted(): void {
  globalThis.document?.documentElement?.setAttribute(FRAME_STARTED_ATTRIBUTE, 'started');
}

export function gatewayFrameStarted(): boolean {
  return globalThis.document?.documentElement?.hasAttribute(FRAME_STARTED_ATTRIBUTE) ?? true;
}

/** Snapshot size: the canvas scaled down so its long edge is at most `maxEdge`. */
export function gatewayHandoffSize(width: number, height: number, maxEdge = GATEWAY_HANDOFF_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(1, width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Encode as WebP, or as JPEG where the browser can't encode WebP (Safari returns
 * a large lossless PNG instead). Returns null for anything unusable or oversized.
 */
export function encodeGatewayHandoff(canvas: Pick<HTMLCanvasElement, 'toDataURL'>): string | null {
  let data = canvas.toDataURL('image/webp', 0.7);
  if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', 0.7);
  if (data.length > GATEWAY_HANDOFF_MAX_CHARS || !GATEWAY_HANDOFF_DATA_PATTERN.test(data)) return null;
  return data;
}

/** Store a downscaled snapshot of the canvas just before navigating to another of our pages. */
export function saveGatewayHandoff(
  canvas: HTMLCanvasElement,
  storage: HandoffStorage | undefined = globalThis.sessionStorage,
  now = Date.now(),
  createCanvas: () => SnapshotCanvas = () => document.createElement('canvas'),
): void {
  try {
    if (storage === undefined || canvas.width <= 0 || canvas.height <= 0) return;
    const size = gatewayHandoffSize(canvas.width, canvas.height);
    const scaled = createCanvas();
    scaled.width = size.width; scaled.height = size.height;
    const context = scaled.getContext('2d') as CanvasRenderingContext2D | null;
    if (context === null) return;
    context.imageSmoothingEnabled = true;
    context.drawImage(canvas, 0, 0, size.width, size.height);
    const data = encodeGatewayHandoff(scaled);
    if (data === null) return;
    storage.setItem(GATEWAY_HANDOFF_KEY, JSON.stringify({ data, savedAt: now }));
  } catch { /* quota, tainted canvas or no DOM: keep today's behaviour */ }
}

/** Boot failed before a real frame: don't leave the previous page's frame up under the error. */
export function clearGatewayHandoff(canvas: HTMLCanvasElement | null = globalThis.document?.querySelector('#game') ?? null): void {
  try {
    if (canvas?.getAttribute('data-gateway-handoff') !== 'painted') return;
    canvas.removeAttribute('data-gateway-handoff');
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  } catch { /* nothing to clear */ }
}
