import { UiElement, ui, type AtlasFrame } from '@orchard/ui/studio';

export interface MapPalettePreview {
  readonly image: CanvasImageSource;
  readonly frame: AtlasFrame;
}

/** Asset completion can repaint while an open popover deliberately prevents
 * rebuilding the tool tree. Resolve readiness on paint so retained thumbnails
 * update without dismissing a menu, losing scroll position or replacing rows. */
export function mapPaletteThumbnail(
  label: string,
  preview: (() => MapPalettePreview | undefined) | undefined,
): UiElement {
  const fallback = ui.icon({ cf: 'gift' }, { layout: { width: 'grow', height: 'grow' } });
  let previous = preview?.(); // Start loading as soon as the virtual row mounts.
  let picture: UiElement | undefined;
  return new UiElement({
    kind: 'palette-preview', label, style: { width: 'grow', height: 'grow' },
    paint(element, paint) {
      const ready = preview?.();
      if (ready === undefined) { fallback.hooks.paint?.(element, paint); return; }
      if (picture === undefined || ready.image !== previous?.image || ready.frame !== previous?.frame) {
        picture?.dispose();
        picture = ui.image(ready.image, ready.frame, { label, fit: 'contain' });
        previous = ready;
      }
      picture.hooks.paint?.(element, paint);
    },
    onDispose() { fallback.dispose(); picture?.dispose(); },
  });
}
