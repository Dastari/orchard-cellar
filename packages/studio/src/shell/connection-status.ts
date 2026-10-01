import { ui, uiFixed, type UiElement } from '@orchard/ui/studio';
import type { StudioSessionSnapshot } from './session.js';

/** Ordinary kit ink needs its reviewed painted surface, including before the workspace opens. */
export function studioConnectionStatus(
  session: Pick<StudioSessionSnapshot, 'phase' | 'error'>,
  reconnect: () => void,
  mapReadiness: string | null = null,
): UiElement {
  const loadingMap = session.phase === 'connected' && mapReadiness !== null;
  const title = session.phase === 'error' ? 'Unable to open live Studio'
    : loadingMap ? 'Loading published map' : 'Connecting to live Studio';
  const detail = session.error ?? (loadingMap ? mapReadiness!
    : session.phase === 'connecting' ? 'Connecting to the live world…' : 'Sign in to load live Studio');
  return ui.flex({ width: 'grow', height: 'grow', align: 'center', justify: 'center', padding: 12 }, [
    ui.frame({ id: 'studio-connection-status', tone: 'neutral', padding: 16,
      layout: { width: 'grow', maxWidth: uiFixed(360) }, children: [
        ui.flex({ width: 'grow', gap: 12 }, [
          ui.text(title, { id: 'studio-connection-title', role: 'header', wrap: true, layout: { width: 'grow' } }),
          ui.text(detail, { id: 'studio-connection-detail', wrap: true, layout: { width: 'grow' } }),
          ...(session.phase === 'connecting' ? [] : [ui.button({ id: 'studio-retry',
            label: loadingMap ? 'Reconnect' : 'Retry sign in', onPress: reconnect })]),
        ]),
      ],
    }),
  ]);
}
