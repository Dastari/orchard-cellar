export type StudioBadgeKind = 'draft' | 'validation' | 'sync' | 'conflict' | 'live' | 'readonly';
export type StudioBadgeTone = 'amber' | 'danger' | 'blue' | 'green' | 'muted';

export interface StudioBadgeModel {
  readonly kind: StudioBadgeKind;
  readonly label: string;
  readonly shortLabel: string;
  readonly tone: StudioBadgeTone;
  readonly ariaLabel: string;
  readonly busy: boolean;
}

const BADGES: Readonly<Record<StudioBadgeKind, Omit<StudioBadgeModel, 'kind'>>> = {
  draft: { label: 'Unsaved draft', shortLabel: 'Draft', tone: 'amber', ariaLabel: 'Unsaved draft changes', busy: false },
  validation: { label: 'Validation errors', shortLabel: 'Errors', tone: 'danger', ariaLabel: 'Validation errors require attention', busy: false },
  sync: { label: 'Live sync', shortLabel: 'Sync', tone: 'blue', ariaLabel: 'Live synchronization in progress', busy: true },
  conflict: { label: 'Head conflict', shortLabel: 'Conflict', tone: 'danger', ariaLabel: 'Published head conflict', busy: false },
  live: { label: 'Live', shortLabel: 'Live', tone: 'green', ariaLabel: 'Connected to live authority', busy: false },
  readonly: { label: 'Read only', shortLabel: 'Read', tone: 'muted', ariaLabel: 'Read-only surface', busy: false },
};

export function studioBadge(kind: StudioBadgeKind): StudioBadgeModel {
  return Object.freeze({ kind, ...BADGES[kind] });
}

export function studioBadges(kinds: readonly StudioBadgeKind[]): readonly StudioBadgeModel[] {
  return Object.freeze([...new Set(kinds)].map(studioBadge));
}
