import { studioBadges, type StudioBadgeKind, type StudioBadgeModel } from './badges.js';

export type StudioMode = 'build' | 'author' | 'operate' | 'observe';

export interface StudioRailSession {
  readonly environment: 'anonymous' | 'local' | 'production';
  readonly identity: string | null;
  readonly role: string | null;
  readonly contentRevision: bigint | null;
  readonly mapRevision: number | null;
  readonly connected: boolean;
}

export interface StudioRailModeModel {
  readonly id: StudioMode;
  readonly label: string;
  readonly icon: string;
  readonly shortcut: string;
  readonly tooltip: string;
  readonly active: boolean;
  readonly badges: readonly StudioBadgeModel[];
}

export interface StudioRailModel {
  readonly expanded: boolean;
  readonly ariaLabel: 'Studio modes';
  readonly modes: readonly StudioRailModeModel[];
  readonly session: {
    readonly placement: 'bottom';
    readonly environment: string;
    readonly identity: string;
    readonly role: string;
    readonly contentHead: string;
    readonly mapHead: string;
    readonly action: 'connect' | 'disconnect';
  };
  readonly commands: readonly [
    { readonly id: 'palette'; readonly shortcut: 'Ctrl+K' },
    { readonly id: 'search'; readonly shortcut: 'Ctrl+Shift+F' },
  ];
}

const MODES = [
  { id: 'build', label: 'Build', icon: 'editor.mode.build', shortcut: 'Ctrl+1' },
  { id: 'author', label: 'Author', icon: 'editor.mode.author', shortcut: 'Ctrl+2' },
  { id: 'operate', label: 'Operate', icon: 'editor.mode.operate', shortcut: 'Ctrl+3' },
  { id: 'observe', label: 'Observe', icon: 'editor.mode.observe', shortcut: 'Ctrl+4' },
] as const;

export function buildStudioRailModel(input: {
  readonly expanded: boolean;
  readonly activeMode: StudioMode;
  readonly session: StudioRailSession;
  readonly modeBadges?: Readonly<Partial<Record<StudioMode, readonly StudioBadgeKind[]>>>;
}): StudioRailModel {
  const anonymous = input.session.environment === 'anonymous';
  const modes = MODES.filter(({ id }) => !anonymous || id === 'build' || id === 'author').map((mode) => ({
    ...mode,
    tooltip: `${mode.label} — ${mode.shortcut}`,
    active: mode.id === input.activeMode,
    badges: studioBadges(input.modeBadges?.[mode.id] ?? []),
  }));
  return Object.freeze({
    expanded: input.expanded,
    ariaLabel: 'Studio modes',
    modes: Object.freeze(modes),
    session: Object.freeze({
      placement: 'bottom',
      environment: input.session.environment === 'production'
        ? 'Production'
        : input.session.environment === 'local' ? 'Local' : 'Local sandbox',
      identity: input.session.identity ?? 'Anonymous',
      role: input.session.role ?? 'Sandbox',
      contentHead: input.session.contentRevision === null ? '—' : input.session.contentRevision.toString(),
      mapHead: input.session.mapRevision === null ? '—' : String(input.session.mapRevision),
      action: input.session.connected ? 'disconnect' : 'connect',
    }),
    commands: [
      { id: 'palette', shortcut: 'Ctrl+K' },
      { id: 'search', shortcut: 'Ctrl+Shift+F' },
    ] as const,
  });
}
