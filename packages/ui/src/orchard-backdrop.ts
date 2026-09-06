import { loadHtmlImage } from './html-image.js';

export const ORCHARD_BACKDROP_URL = '/ui/island-background.png';
let islandImage: HTMLImageElement | null = null;
let pendingImage: Promise<void> | null = null;
const viewportImages = new WeakMap<CanvasRenderingContext2D, {
  readonly width: number; readonly height: number; readonly ratio: number;
  readonly canvas: HTMLCanvasElement;
}>();

/** Decorative art never delays sign-in or requires a world connection. */
export function loadOrchardBackdrop(): Promise<void> {
  if (islandImage !== null) return Promise.resolve();
  pendingImage ??= loadHtmlImage(ORCHARD_BACKDROP_URL, 'island backdrop', 6_000)
    .then((image) => { islandImage = image; })
    .catch(() => undefined)
    .finally(() => { pendingImage = null; });
  return pendingImage;
}

/** The same static island crop and tint used by the OIDC and PWA screens. */
export function drawOrchardBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#38633f';
  context.fillRect(0, 0, width, height);
  if (islandImage !== null && islandImage.naturalWidth > 0 && islandImage.naturalHeight > 0) {
    const ratio = Math.max(1, context.getTransform().a);
    let cached = viewportImages.get(context);
    if (cached === undefined || cached.width !== width || cached.height !== height || cached.ratio !== ratio) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
      const paint = canvas.getContext('2d');
      if (paint !== null) {
        paint.imageSmoothingEnabled = false;
        const scale = Math.max(canvas.width / islandImage.naturalWidth, canvas.height / islandImage.naturalHeight);
        const drawnWidth = Math.ceil(islandImage.naturalWidth * scale);
        const drawnHeight = Math.ceil(islandImage.naturalHeight * scale);
        paint.drawImage(islandImage,
          Math.floor((canvas.width - drawnWidth) / 2), Math.floor((canvas.height - drawnHeight) / 2),
          drawnWidth, drawnHeight);
        paint.fillStyle = 'rgba(16, 24, 19, 0.18)';
        paint.fillRect(0, 0, canvas.width, canvas.height);
        cached = { width, height, ratio, canvas };
        viewportImages.set(context, cached);
      }
    }
    if (cached !== undefined) context.drawImage(cached.canvas, 0, 0, width, height);
  }
  context.restore();
}
