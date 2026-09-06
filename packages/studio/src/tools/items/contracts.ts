import type {
  ContentDefinitionRow,
  ContentValidationReport,
  SupportedContentDefinition,
  SupportedContentKind,
} from '@orchard/sim';

export const ITEMS_TOOL_CONTENT_KINDS = ['item', 'recipe', 'process', 'shop'] as const;
export type ItemsToolContentKind = typeof ITEMS_TOOL_CONTENT_KINDS[number];
export type ItemsToolAccess = 'anonymous' | 'read_only' | 'write';

export interface ItemsContentHeadSnapshot {
  readonly packId: 'live';
  readonly revision: bigint;
  readonly contentHash: string;
  readonly engineVersion: number;
  readonly definitions: readonly SupportedContentDefinition[];
  /** Original live payloads, retained separately from normalized editor definitions. */
  readonly sourceRows?: readonly ContentDefinitionRow[];
}

/** Exact structural request accepted by `publishContentChangeSet`. Keeping the
 * opaque arrays serialized here makes the model boundary match the generated
 * reducer and avoids coupling the draft model to SpaceTimeDB row types. */
export interface PublishContentChangeSetRequest {
  readonly packId: 'live';
  readonly expectedRevision: bigint;
  readonly clientMutationId: string;
  readonly upserts: string;
  readonly deletes: string;
  readonly note: string;
}

/** Exact structural request accepted by `restoreContentRevision`. */
export interface RestoreContentRevisionRequest {
  readonly revision: bigint;
  readonly expectedRevision: bigint;
  readonly clientMutationId: string;
  readonly note: string;
}

export interface ItemsPublishAdapter {
  publishContentChangeSet(request: PublishContentChangeSetRequest): Promise<void>;
  restoreContentRevision(request: RestoreContentRevisionRequest): Promise<void>;
}

export type ItemsPublishAdapterFactory = () => ItemsPublishAdapter;

/** Storage is injected so the model works in tests, SSR, and anonymous static
 * rendering without reaching for browser globals. */
export interface ItemsDraftPersistenceAdapter {
  load(key: string): string | null;
  save(key: string, value: string): void;
  remove(key: string): void;
}

export interface AssetPickerOption {
  readonly assetId: string;
  readonly label: string;
  readonly animations: readonly string[];
  readonly reviewed: boolean;
}

export interface ItemsAssetPickerAdapter {
  options(query: string): readonly AssetPickerOption[];
}

export interface DefinitionReferenceOption {
  readonly id: string;
  readonly kind: SupportedContentKind;
  readonly label: string;
  readonly retired: boolean;
}

export interface DefinitionDiff {
  readonly id: string;
  readonly kind: 'create' | 'update' | 'delete';
  readonly definitionKind: string;
  readonly changedPaths: readonly string[];
  readonly before?: SupportedContentDefinition;
  readonly after?: SupportedContentDefinition;
}

export interface ContentRevisionRecord {
  readonly revision: bigint;
  readonly parentRevision: bigint;
  readonly contentHash: string;
  readonly changeSetJson: string;
  readonly inverseChangeSetJson: string;
  readonly actor: string;
  readonly occurredAt: string;
  readonly note: string;
}

export interface ContentRevisionPreview {
  readonly revision: bigint;
  readonly mode: 'published_change' | 'restore_inverse';
  readonly diffs: readonly DefinitionDiff[];
}

export interface ItemsDraftConflict {
  readonly code: 'content_revision_conflict';
  readonly baseRevision: bigint;
  readonly headRevision: bigint;
  readonly localIds: readonly string[];
  readonly remoteIds: readonly string[];
  readonly overlappingIds: readonly string[];
  readonly canAutoRebase: boolean;
}

export interface ItemsToolSnapshot {
  readonly access: ItemsToolAccess;
  readonly baseRevision: bigint;
  readonly headRevision: bigint;
  readonly engineGate: 'compatible' | 'requires_update';
  readonly dirty: boolean;
  readonly canPublish: boolean;
  readonly definitions: readonly SupportedContentDefinition[];
  readonly diffs: readonly DefinitionDiff[];
  readonly validation: ContentValidationReport;
  readonly conflict: ItemsDraftConflict | null;
}

/** Plain-data shell handoff. S1 can pass this directly to registerStudioTool
 * without this subtree importing the shell while its contract is in flight. */
export const ITEMS_TOOL_REGISTRATION = Object.freeze({
  id: 'items',
  label: 'Items & Recipes',
  mode: 'author' as const,
  icon: 'editor.item',
  routes: Object.freeze(['/author/items'] as const),
  docks: Object.freeze([
    'content_browser', 'asset_library', 'inspector', 'preview', 'validation', 'history',
  ] as const),
  commands: Object.freeze([
    { id: 'item.new', label: 'New item definition' },
    { id: 'recipe.new', label: 'New recipe definition' },
    { id: 'content.publish', label: 'Publish content draft' },
    { id: 'content.rebase', label: 'Rebase draft onto live head' },
  ] as const),
});
