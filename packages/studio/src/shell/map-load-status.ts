import { ui, type UiElement } from '@orchard/ui/studio';

interface MapLoadStatusView {
  readonly connected: boolean;
  readonly mapError?: string | null;
  readonly mapLoadProgress?: { readonly verifiedChunks: number; readonly totalChunks: number; readonly attempt: number } | null;
}

export function studioMapLoadError(view: MapLoadStatusView | null | undefined): string | null {
  return view?.mapError ?? null;
}

/** Optional fields keep shell-only releases compatible with earlier transports. */
export function studioMapLoadStatus(view: MapLoadStatusView | null | undefined, readiness: string): UiElement {
  const progress = view?.mapLoadProgress;
  return ui.flex({ id: 'studio-map-loading', width: 'grow', height: 'grow', align: 'center', justify: 'center', gap: 8 }, [
    ui.text(view?.mapError ? 'Map temporarily unavailable' : 'Loading published map', { role: 'header' }),
    ui.text(view?.mapError ?? readiness, { wrap: true, layout: { width: 'grow' } }),
    ...(progress ? [ui.text(`${progress.verifiedChunks} of ${progress.totalChunks} chunks verified · attempt ${progress.attempt}`, { wrap: true })] : []),
    ui.text('You can use the other Studio tools while the map loads.', { wrap: true, layout: { width: 'grow' } }),
  ]);
}
