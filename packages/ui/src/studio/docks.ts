import type { UiFrameStyle } from '../design-system/frame.js';
import { studioBadges, type StudioBadgeKind, type StudioBadgeModel } from './badges.js';

export type StudioUiScale = 1 | 2 | 3;
export type StudioDockPlacement = 'left' | 'right' | 'bottom' | 'center' | 'overlay';
export type StudioDockId =
  | 'mode_rail' | 'world_outliner' | 'live_outliner' | 'inspector'
  | 'content_browser' | 'asset_library' | 'validation' | 'audit_tail'
  | 'live_sync_log' | 'animation_preview' | 'audio_mixer' | 'telemetry'
  | 'console' | 'behaviour' | 'prefab_instances' | 'history'
  | 'layouts' | 'studio_settings' | 'world_settings' | 'tool_registry'
  | 'search_everywhere' | 'preview' | 'observe';

export interface StudioDockContract {
  readonly id: StudioDockId;
  readonly title: string;
  readonly placement: StudioDockPlacement;
  readonly frame: UiFrameStyle;
  readonly description: string;
  readonly anonymous: boolean;
}

export interface StudioDockFrameModel extends StudioDockContract {
  readonly uiScale: StudioUiScale;
  readonly badges: readonly StudioBadgeModel[];
  readonly classes: readonly string[];
  readonly metrics: {
    readonly headerHeight: number;
    readonly padding: number;
    readonly gap: number;
    readonly minimumWidth: number;
    readonly minimumHeight: number;
  };
}

export const STUDIO_DOCK_CONTRACTS = [
  { id: 'mode_rail', title: 'Mode Rail', placement: 'left', frame: 'wood', description: 'Build, Author, Operate, and Observe switcher', anonymous: true },
  { id: 'world_outliner', title: 'World Outliner', placement: 'left', frame: 'wood_parchment', description: 'Draft spaces, layers, objects, prefabs, landmarks, NPC homes, and spawn rules', anonymous: true },
  { id: 'live_outliner', title: 'Live Outliner', placement: 'left', frame: 'wood_parchment', description: 'Subscribed live entities and players', anonymous: false },
  { id: 'inspector', title: 'Inspector', placement: 'right', frame: 'wood_parchment', description: 'Typed properties, reset, pin, and why help', anonymous: true },
  { id: 'content_browser', title: 'Content Browser', placement: 'left', frame: 'wood_parchment', description: 'Definitions and references to or from the selection', anonymous: true },
  { id: 'asset_library', title: 'Asset Library', placement: 'left', frame: 'wood_parchment', description: 'Reviewed asset registry and coverage states', anonymous: true },
  { id: 'validation', title: 'Validation', placement: 'bottom', frame: 'parchment', description: 'Draft and publish diagnostics', anonymous: true },
  { id: 'audit_tail', title: 'Audit Tail', placement: 'bottom', frame: 'parchment', description: 'Recent audited authority actions', anonymous: false },
  { id: 'live_sync_log', title: 'Live Sync Log', placement: 'bottom', frame: 'parchment', description: 'Publish queue and head reconciliation', anonymous: false },
  { id: 'animation_preview', title: 'Animation', placement: 'bottom', frame: 'parchment', description: 'Frame preview and scrubber', anonymous: true },
  { id: 'audio_mixer', title: 'Audio Mixer', placement: 'bottom', frame: 'parchment', description: 'Preview channels and authored levels', anonymous: true },
  { id: 'telemetry', title: 'Telemetry', placement: 'bottom', frame: 'parchment', description: 'Authority and client performance counters', anonymous: false },
  { id: 'console', title: 'Console', placement: 'bottom', frame: 'parchment', description: 'Client error reports and structured diagnostics', anonymous: true },
  { id: 'behaviour', title: 'Behaviour', placement: 'right', frame: 'wood_parchment', description: 'Lifecycle handlers for the selected definition', anonymous: true },
  { id: 'prefab_instances', title: 'Instance Overrides', placement: 'right', frame: 'wood_parchment', description: 'Definition inheritance and instance overrides', anonymous: true },
  { id: 'history', title: 'History', placement: 'right', frame: 'wood_parchment', description: 'Local commands and live audit undo', anonymous: true },
  { id: 'layouts', title: 'Layouts', placement: 'right', frame: 'wood_parchment', description: 'Named dock arrangements per mode', anonymous: true },
  { id: 'studio_settings', title: 'Studio Settings', placement: 'center', frame: 'wood_parchment', description: 'Theme, shortcuts, scale, and environment', anonymous: true },
  { id: 'world_settings', title: 'World Settings', placement: 'center', frame: 'wood_parchment', description: 'Balance groups and space flags', anonymous: false },
  { id: 'tool_registry', title: 'Tool Registry', placement: 'center', frame: 'wood_parchment', description: 'Discoverable built-in and registered tools', anonymous: true },
  { id: 'search_everywhere', title: 'Search Everywhere', placement: 'overlay', frame: 'wood_parchment', description: 'Commands, content, players, entities, spaces, and docs', anonymous: true },
  { id: 'preview', title: 'Preview', placement: 'center', frame: 'thin', description: 'Client rendering with the local draft overlay', anonymous: true },
  { id: 'observe', title: 'Observe', placement: 'center', frame: 'thin', description: 'Presence and telemetry workspace', anonymous: false },
] as const satisfies readonly StudioDockContract[];

export function studioDockFrame(
  id: StudioDockId,
  uiScale: StudioUiScale,
  badgeKinds: readonly StudioBadgeKind[] = [],
): StudioDockFrameModel {
  const contract = STUDIO_DOCK_CONTRACTS.find((dock) => dock.id === id);
  if (contract === undefined) throw new RangeError(`Unknown Studio dock: ${id}`);
  return Object.freeze({
    ...contract,
    uiScale,
    badges: studioBadges(badgeKinds),
    classes: Object.freeze([
      'orchard-studio-dock',
      `orchard-studio-dock--${contract.placement}`,
      `orchard-studio-frame--${contract.frame.replace('_', '-')}`,
      `orchard-studio-scale--${uiScale}`,
    ]),
    metrics: Object.freeze({
      headerHeight: 28 * uiScale,
      padding: 8 * uiScale,
      gap: 6 * uiScale,
      minimumWidth: (contract.placement === 'bottom' ? 320 : 180) * uiScale,
      minimumHeight: (contract.placement === 'bottom' ? 96 : 140) * uiScale,
    }),
  });
}

export interface StudioTabInput {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly tooltip?: string;
  readonly badge?: StudioBadgeKind;
}

export interface StudioTabModel extends StudioTabInput {
  readonly active: boolean;
  readonly ariaSelected: 'true' | 'false';
  readonly tabIndex: 0 | -1;
  readonly badgeModel?: StudioBadgeModel;
}

export function studioTabStrip(tabs: readonly StudioTabInput[], activeId: string): readonly StudioTabModel[] {
  if (tabs.length === 0) throw new RangeError('Studio tab strip requires at least one tab');
  if (new Set(tabs.map(({ id }) => id)).size !== tabs.length) throw new TypeError('Duplicate Studio tab id');
  const selected = tabs.find(({ id, disabled }) => id === activeId && disabled !== true)
    ?? tabs.find(({ disabled }) => disabled !== true);
  if (selected === undefined) throw new RangeError('Studio tab strip requires an enabled tab');
  return Object.freeze(tabs.map((tab): StudioTabModel => ({
    ...tab,
    active: tab.id === selected.id,
    ariaSelected: tab.id === selected.id ? 'true' : 'false',
    tabIndex: tab.id === selected.id ? 0 : -1,
    ...(tab.badge === undefined ? {} : { badgeModel: studioBadge(tab.badge) }),
    ...(tab.disabled !== true || tab.tooltip !== undefined
      ? {} : { tooltip: `${tab.label} is unavailable in this session` }),
  })));
}

function studioBadge(kind: StudioBadgeKind): StudioBadgeModel {
  return studioBadges([kind])[0]!;
}
