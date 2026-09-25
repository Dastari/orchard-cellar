/**
 * Keeps the last frame on screen across our own page loads (owner UI fix item 5).
 *
 * The title, account and world screens are separate page loads. Each new page
 * showed the bare island for about half a second until its kit art loaded, so
 * the gateway frame vanished and reappeared at every step. Just before one of
 * our pages navigates to another, it stores a small snapshot of its canvas; the
 * next page paints that snapshot on its first script turn and the loading
 * screen's first real frame then replaces it. Anything that fails (quota,
 * decoding, an old or mismatched snapshot) silently falls back to the island.
 * The Keycloak hop is another site and never hands off.
 */

export const GATEWAY_HANDOFF_KEY = 'orchard.gateway-handoff';
export const GATEWAY_HANDOFF_MAX_AGE_MS = 15_000;
export const GATEWAY_HANDOFF_MAX_EDGE = 1280;

export interface GatewayHandoff {
  readonly data: string;
  readonly width: number;
  readonly height: number;
  readonly savedAt: number;
}

type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A DOM flag, so the tiny boot script need not import the loading screen. */
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
 * Cover-fit of the snapshot into the target, or null when the orientation
 * differs (a portrait snapshot is never stretched or cropped onto landscape).
 */
export function gatewayHandoffCover(
  source: { readonly width: number; readonly height: number },
  target: { readonly width: number; readonly height: number },
): { x: number; y: number; width: number; height: number } | null {
  if (source.width <= 0 || source.height <= 0 || target.width <= 0 || target.height <= 0) return null;
  if ((source.width >= source.height) !== (target.width >= target.height)) return null;
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height };
}

/** Consume the stored snapshot once; stale or malformed snapshots are dropped. */
export function takeGatewayHandoff(storage: HandoffStorage | undefined, now = Date.now()): GatewayHandoff | null {
  try {
    const raw = storage?.getItem(GATEWAY_HANDOFF_KEY) ?? null;
    if (raw === null) return null;
    storage!.removeItem(GATEWAY_HANDOFF_KEY);
    const value = JSON.parse(raw) as Partial<GatewayHandoff>;
    if (typeof value.data !== 'string' || !value.data.startsWith('data:image/')
      || typeof value.width !== 'number' || typeof value.height !== 'number' || typeof value.savedAt !== 'number') return null;
    const age = now - value.savedAt;
    return age >= 0 && age <= GATEWAY_HANDOFF_MAX_AGE_MS ? value as GatewayHandoff : null;
  } catch { return null; }
}

/** Store a downscaled snapshot of the canvas just before navigating to another of our pages. */
export function saveGatewayHandoff(canvas: HTMLCanvasElement, storage: HandoffStorage | undefined = globalThis.sessionStorage, now = Date.now()): void {
  try {
    if (storage === undefined || canvas.width <= 0 || canvas.height <= 0) return;
    const size = gatewayHandoffSize(canvas.width, canvas.height);
    const scaled = document.createElement('canvas');
    scaled.width = size.width; scaled.height = size.height;
    const context = scaled.getContext('2d');
    if (context === null) return;
    context.imageSmoothingEnabled = true;
    context.drawImage(canvas, 0, 0, size.width, size.height);
    const data = scaled.toDataURL('image/webp', 0.7);
    storage.setItem(GATEWAY_HANDOFF_KEY, JSON.stringify({ data, width: size.width, height: size.height, savedAt: now } satisfies GatewayHandoff));
  } catch { /* quota, tainted canvas or no DOM: keep today's behaviour */ }
}

/**
 * Paint the consumed snapshot onto the page canvas at its display size, unless
 * a real frame has started (`stillEarly` returns false once the loading screen
 * or gateway draws). Resolves true when the snapshot was painted.
 */
export async function paintGatewayHandoff(
  canvas: HTMLCanvasElement,
  handoff: GatewayHandoff,
  display: { readonly width: number; readonly height: number; readonly dpr: number },
  stillEarly: () => boolean,
): Promise<boolean> {
  try {
    const image = new Image();
    image.src = handoff.data;
    await image.decode();
    if (!stillEarly()) return false;
    const width = Math.round(display.width * display.dpr), height = Math.round(display.height * display.dpr);
    const cover = gatewayHandoffCover({ width: image.naturalWidth, height: image.naturalHeight }, { width, height });
    if (cover === null) return false;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${display.width}px`;
    canvas.style.height = `${display.height}px`;
    const context = canvas.getContext('2d');
    if (context === null) return false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(image, cover.x, cover.y, cover.width, cover.height);
    return true;
  } catch { return false; }
}
