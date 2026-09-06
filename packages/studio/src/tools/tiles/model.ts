import {
  TERRAIN_LAB_GOLDEN_SAMPLES,
  TILESET_CONTENT_ENGINE_VERSION,
  TILESET_REQUIRED_ROLES,
  TILESET_ROLE_GROUPS,
  TILESET_TRANSITION_KINDS,
  bootstrapContentDefinitions,
  compileMapDocument,
  contentDefinitionsHash,
  createTerrainLabDocument,
  parseTilesetDefinition,
  semanticTerrainTraceAt,
  validateContentDefinitions,
  type ContentValidationReport,
  type SupportedContentDefinition,
  type TilesetContentDefinition,
  type TilesetRoleGroup,
  type TilesetTransitionDefinition,
  type TilesetTransitionKind,
} from '@orchard/sim';

export type TileEditorAccess = 'anonymous' | 'read_only' | 'write';

export interface TileEditorPublishRequest {
  readonly packId: 'live';
  readonly expectedRevision: bigint;
  readonly clientMutationId: string;
  readonly upserts: string;
  readonly deletes: '[]';
  readonly note: string;
}

export interface TileEditorPublishAdapter {
  publishContentChangeSet(request: TileEditorPublishRequest): Promise<void>;
}

export interface TileFrameAudition {
  readonly key: string;
  readonly group: TilesetRoleGroup | 'face' | TilesetTransitionKind;
  readonly role: string;
  readonly assetId: string;
  readonly frames: readonly number[];
}

export interface TileFixtureLayer {
  readonly semanticRole: string;
  readonly assetId?: string;
  readonly frame?: number;
}

export interface TileFixturePreview {
  readonly id: keyof typeof TERRAIN_LAB_GOLDEN_SAMPLES;
  readonly tileX: number;
  readonly tileY: number;
  readonly layers: readonly TileFixtureLayer[];
}

export interface TileEditorSnapshot {
  readonly access: TileEditorAccess;
  readonly definition: TilesetContentDefinition;
  readonly validation: ContentValidationReport;
  readonly dirty: boolean;
  readonly canPublish: boolean;
  readonly assetChoices: readonly string[];
  readonly auditions: readonly TileFrameAudition[];
  readonly fixtures: readonly TileFixturePreview[];
}

export interface CreateTileEditorOptions {
  readonly definition?: string | unknown;
  readonly access: TileEditorAccess;
  readonly definitions?: readonly SupportedContentDefinition[];
  readonly baseRevision?: bigint;
  readonly createPublishAdapter?: () => TileEditorPublishAdapter;
}

const FIXTURE_DOCUMENT = createTerrainLabDocument();
const FIXTURE_COMPILED = compileMapDocument(FIXTURE_DOCUMENT);

function definitionsWith(
  definitions: readonly SupportedContentDefinition[],
  next: TilesetContentDefinition,
): readonly SupportedContentDefinition[] {
  return [...definitions.filter(({ id }) => id !== next.id), next];
}

function semanticFrame(
  definition: TilesetContentDefinition,
  semanticRole: string,
): Pick<TileFixtureLayer, 'assetId' | 'frame'> {
  const edge = /^contour\.edge\.(.+)$/u.exec(semanticRole);
  if (edge !== null) {
    const found = definition.roleFrames.find(({ group, role }) => group === 'edge' && role === edge[1]);
    return found === undefined ? {} : { assetId: found.assetId, frame: found.frame };
  }
  const inset = /^contour\.inset\.(.+)$/u.exec(semanticRole);
  if (inset !== null) {
    const found = definition.roleFrames.find(({ group, role }) => group === 'inset' && role === inset[1]);
    return found === undefined ? {} : { assetId: found.assetId, frame: found.frame };
  }
  const face = /^contour\.face\.(?:[^.]+\.)?(.+)$/u.exec(semanticRole);
  if (face !== null) {
    const profile = definition.faceProfiles.find(({ id }) => id === 'tall');
    const rows = profile === undefined ? [] : [...profile.rows, ...profile.repeatRows];
    const row = rows.find(({ id }) => semanticRole.includes(id)) ?? rows[0];
    const frameIndex = face[1] === 'left' ? 0 : face[1] === 'right' ? 2 : 1;
    return row === undefined ? {} : { assetId: row.assetId, frame: row.frames[frameIndex] };
  }
  return {};
}

function fixturePreviews(definition: TilesetContentDefinition): readonly TileFixturePreview[] {
  return Object.entries(TERRAIN_LAB_GOLDEN_SAMPLES).map(([id, point]) => {
    const trace = semanticTerrainTraceAt(
      FIXTURE_DOCUMENT,
      point.tileX,
      point.tileY,
      FIXTURE_COMPILED,
    );
    return Object.freeze({
      id: id as keyof typeof TERRAIN_LAB_GOLDEN_SAMPLES,
      tileX: point.tileX,
      tileY: point.tileY,
      layers: Object.freeze(trace.layers.map(({ role }) => Object.freeze({
        semanticRole: role,
        ...semanticFrame(definition, role),
      }))),
    });
  });
}

function auditions(definition: TilesetContentDefinition): readonly TileFrameAudition[] {
  const roles = definition.roleFrames.map(({ group, role, assetId, frame }) => Object.freeze({
    key: `${group}:${role}`, group, role, assetId, frames: Object.freeze([frame]),
  }));
  const faces = definition.faceProfiles.flatMap((profile) => [...profile.rows, ...profile.repeatRows]
    .map(({ id, assetId, frames }) => Object.freeze({
      key: `face:${profile.id}:${id}`, group: 'face' as const,
      role: `${profile.id}:${id}`, assetId, frames: Object.freeze([...frames]),
    })));
  const transitions = TILESET_TRANSITION_KINDS.flatMap((kind) => {
    const transition = definition.transitions[kind];
    return transition.available ? transition.variants.map(({ id, frames }) => Object.freeze({
      key: `${kind}:${id}`, group: kind, role: id,
      assetId: transition.assetId, frames: Object.freeze([...frames]),
    })) : [];
  });
  return Object.freeze([...roles, ...faces, ...transitions]);
}

export class TileEditorModel {
  readonly #access: TileEditorAccess;
  readonly #definitions: readonly SupportedContentDefinition[];
  readonly #baseRevision: bigint;
  readonly #adapter: TileEditorPublishAdapter | null;
  readonly #initialHash: string;
  #definition: TilesetContentDefinition;

  constructor(options: CreateTileEditorOptions) {
    const definitions = options.definitions ?? bootstrapContentDefinitions();
    const seed = options.definition ?? definitions.find(({ kind }) => kind === 'tileset');
    if (seed === undefined) throw new Error('tile_editor_no_tilesets');
    this.#definition = parseTilesetDefinition(seed);
    this.#definitions = definitions;
    this.#access = options.access;
    this.#baseRevision = options.baseRevision ?? 0n;
    this.#adapter = options.access === 'write' && options.createPublishAdapter !== undefined
      ? options.createPublishAdapter() : null;
    this.#initialHash = contentDefinitionsHash([this.#definition]);
  }

  #assertEditable(): void {
    if (this.#access === 'read_only') throw new Error('tile_editor_read_only');
  }

  #replace(value: unknown): TileEditorSnapshot {
    this.#definition = parseTilesetDefinition(value);
    return this.snapshot();
  }

  snapshot(): TileEditorSnapshot {
    const definitions = definitionsWith(this.#definitions, this.#definition);
    const validation = validateContentDefinitions(definitions);
    const dirty = contentDefinitionsHash([this.#definition]) !== this.#initialHash;
    const assetChoices = [...new Set(definitions
      .filter((entry): entry is TilesetContentDefinition => entry.kind === 'tileset')
      .flatMap(({ assetIds }) => assetIds))].sort((left, right) => left.localeCompare(right));
    return Object.freeze({
      access: this.#access,
      definition: this.#definition,
      validation,
      dirty,
      canPublish: this.#access === 'write' && this.#adapter !== null && dirty && validation.valid,
      assetChoices: Object.freeze(assetChoices),
      auditions: auditions(this.#definition),
      fixtures: fixturePreviews(this.#definition),
    });
  }

  replaceDefinition(value: string | unknown): TileEditorSnapshot {
    this.#assertEditable();
    const next = parseTilesetDefinition(value);
    if (next.id !== this.#definition.id) throw new Error('tileset_definition_identity_change');
    return this.#replace(next);
  }

  cloneAs(familyId: string): TileEditorSnapshot {
    this.#assertEditable();
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(familyId)) throw new Error('invalid_tileset_family_id');
    if (this.#definitions.some((entry) => entry.id === `tileset:${familyId}`)) {
      throw new Error(`duplicate_tileset_family:${familyId}`);
    }
    return this.#replace({
      ...structuredClone(this.#definition),
      id: `tileset:${familyId}`,
      familyId,
      engineVersion: TILESET_CONTENT_ENGINE_VERSION,
    });
  }

  setProjection(
    projectionStyle: TilesetContentDefinition['projectionStyle'],
    baseDatum: number,
    faceClearanceRows: number,
  ): TileEditorSnapshot {
    this.#assertEditable();
    return this.#replace({ ...this.#definition, projectionStyle, baseDatum, faceClearanceRows });
  }

  setRoleFrame(group: TilesetRoleGroup, role: string, assetId: string, frame: number): TileEditorSnapshot {
    this.#assertEditable();
    if (!(TILESET_ROLE_GROUPS as readonly string[]).includes(group)) throw new Error('invalid_tileset_role_group');
    const required = TILESET_REQUIRED_ROLES[group] as readonly string[];
    if (!required.includes(role)) throw new Error(`invalid_tileset_role:${group}:${role}`);
    const roleFrames = this.#definition.roleFrames
      .filter((entry) => entry.group !== group || entry.role !== role);
    roleFrames.push({ group, role, assetId, frame });
    const unavailableRoleGroups = group === 'edge' ? this.#definition.unavailableRoleGroups
      : this.#definition.unavailableRoleGroups.filter((entry) => entry.group !== group);
    const assetIds = [...new Set([...this.#definition.assetIds, assetId])].sort((left, right) => left.localeCompare(right));
    return this.#replace({ ...this.#definition, roleFrames, unavailableRoleGroups, assetIds });
  }

  markRoleGroupUnavailable(
    group: Exclude<TilesetRoleGroup, 'edge'>,
    reason: string,
  ): TileEditorSnapshot {
    this.#assertEditable();
    const trimmed = reason.trim();
    if (trimmed.length === 0) throw new Error('tileset_unavailable_reason_required');
    return this.#replace({
      ...this.#definition,
      roleFrames: this.#definition.roleFrames.filter((entry) => entry.group !== group),
      unavailableRoleGroups: [
        ...this.#definition.unavailableRoleGroups.filter((entry) => entry.group !== group),
        { group, reason: trimmed },
      ],
    });
  }

  setTransition(kind: TilesetTransitionKind, transition: TilesetTransitionDefinition): TileEditorSnapshot {
    this.#assertEditable();
    const assetIds = transition.available
      ? [...new Set([...this.#definition.assetIds, transition.assetId])].sort((left, right) => left.localeCompare(right))
      : this.#definition.assetIds;
    return this.#replace({
      ...this.#definition,
      transitions: { ...this.#definition.transitions, [kind]: transition },
      assetIds,
    });
  }

  buildPublishRequest(clientMutationId: string, note: string): TileEditorPublishRequest {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u.test(clientMutationId)) throw new Error('invalid_content_mutation_id');
    const trimmed = note.trim();
    if (trimmed.length > 500) throw new Error('invalid_content_note');
    const state = this.snapshot();
    if (!state.dirty) throw new Error('content_change_set_empty');
    if (!state.validation.valid) {
      throw new Error(`content_validation_failed:${state.validation.errors[0]?.code ?? 'unknown'}`);
    }
    return Object.freeze({
      packId: 'live',
      expectedRevision: this.#baseRevision,
      clientMutationId,
      upserts: JSON.stringify([{ id: this.#definition.id, kind: 'tileset', json: JSON.stringify(this.#definition) }]),
      deletes: '[]',
      note: trimmed,
    });
  }

  async publish(clientMutationId: string, note: string): Promise<TileEditorPublishRequest> {
    if (this.#access !== 'write' || this.#adapter === null) throw new Error('tile_editor_publish_unavailable');
    const request = this.buildPublishRequest(clientMutationId, note);
    await this.#adapter.publishContentChangeSet(request);
    return request;
  }
}

export function createTileEditorModel(options: CreateTileEditorOptions): TileEditorModel {
  return new TileEditorModel(options);
}
