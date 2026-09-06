import type { StudioSelection } from './selection.js';
import type { AdminJsonObject } from '@orchard/sim';

export interface StudioOutlinerNode {
  readonly id: string;
  readonly label: string;
  readonly kind: 'space' | 'group' | 'entity';
  readonly selection?: StudioSelection;
  readonly children: readonly StudioOutlinerNode[];
}

export interface StudioDraftWorld {
  readonly spaces: readonly {
    readonly id: number;
    readonly label: string;
    readonly definitionGroups?: readonly {
      readonly id: string;
      readonly label: string;
      readonly definitions: readonly {
        readonly id: string;
        readonly label: string;
        readonly definitionKind: string;
      }[];
    }[];
    readonly layers: readonly {
      readonly id: string;
      readonly label: string;
      readonly objectIds: readonly string[];
      readonly entities?: readonly {
        readonly id: string;
        readonly label: string;
        readonly entityKind: string;
      }[];
    }[];
  }[];
}

export interface StudioLiveRows {
  readonly placeables: readonly { readonly id: bigint; readonly spaceId: number; readonly kind: string; readonly definitionId?: string; readonly state?: AdminJsonObject; readonly tileX?: number; readonly tileY?: number; readonly elevation?: number; readonly facing?: string; readonly open?: boolean; readonly lit?: boolean; readonly smeltStartTick?: bigint; readonly processStartTick?: bigint; readonly barrelSealedTick?: bigint; readonly cookStartTick?: bigint }[];
  readonly chests?: readonly { readonly id: bigint; readonly spaceId: number; readonly definitionId?: string; readonly state?: AdminJsonObject; readonly tileX: number; readonly tileY: number; readonly elevation?: number; readonly open?: boolean; readonly facing?: string }[];
  readonly combatTargets?: readonly { readonly id: bigint; readonly spaceId: number; readonly kind?: string; readonly tileX: number; readonly tileY: number; readonly elevation?: number; readonly healthCenti?: number; readonly maxHealthCenti?: number }[];
  readonly resources?: readonly { readonly id: bigint; readonly spaceId: number; readonly kind: string; readonly tileX: number; readonly tileY: number; readonly elevation?: number; readonly health?: number; readonly depleted?: boolean; readonly growthStage?: number; readonly miningClass?: string; readonly richness?: number; readonly maximumRichness?: number }[];
  readonly surfaces?: readonly { readonly id: bigint; readonly spaceId: number; readonly kind: string; readonly tileX: number; readonly tileY: number; readonly elevation?: number }[];
  readonly npcs: readonly { readonly id: bigint; readonly spaceId: number; readonly kind: string; readonly displayName?: string; readonly x?: number; readonly y?: number; readonly homeX?: number; readonly homeY?: number; readonly riderIdentity?: string; readonly facing?: string; readonly moving?: boolean; readonly wanderDirection?: string; readonly health?: number; readonly species?: string; readonly variant?: number }[];
  readonly homesteads: readonly { readonly spaceId: number; readonly owner: { toHexString(): string }; readonly ownerName?: string; readonly tileX?: number; readonly tileY?: number; readonly elevation?: number; readonly sizeTier?: number; readonly accessMode?: string }[];
  readonly players: readonly { readonly identity: { toHexString(): string }; readonly spaceId: number; readonly displayName?: string; readonly x?: number; readonly y?: number; readonly facing?: string; readonly moving?: boolean; readonly equippedKind?: string; readonly online?: boolean; readonly appearance?: { readonly hairKind: string; readonly shirtKind: string; readonly pantsKind: string; readonly shoesKind: string } }[];
}

function entityNode(id: string, label: string, entityKind: string, spaceId: number): StudioOutlinerNode {
  return Object.freeze({
    id, label, kind: 'entity',
    selection: Object.freeze({ kind: entityKind === 'player' ? 'player' : 'entity', ...(entityKind === 'player'
      ? { identity: id.replace('player:', ''), spaceId }
      : { entityKind, id: id.split(':').at(-1)!, spaceId }) }) as StudioSelection,
    children: Object.freeze([]),
  });
}

export function buildWorldOutliner(world: StudioDraftWorld): readonly StudioOutlinerNode[] {
  return Object.freeze([...world.spaces].sort((a, b) => a.id - b.id).map((space) => Object.freeze({
    id: `space:${space.id}`, label: space.label, kind: 'space' as const,
    children: Object.freeze([
      ...space.layers.map((layer) => Object.freeze({
        id: `space:${space.id}:layer:${layer.id}`, label: layer.label, kind: 'group' as const,
        children: Object.freeze(layer.entities?.map((entity) => entityNode(
          `${entity.entityKind}:${entity.id}`, entity.label, entity.entityKind, space.id,
        )) ?? layer.objectIds.map((id) => entityNode(`object:${id}`, id, 'object', space.id))),
      })),
      ...(space.definitionGroups ?? []).map((group) => Object.freeze({
        id: `space:${space.id}:definitions:${group.id}`,
        label: group.label,
        kind: 'group' as const,
        children: Object.freeze(group.definitions.map((definition) => Object.freeze({
          id: `definition:${definition.definitionKind}:${definition.id}`,
          label: definition.label,
          kind: 'entity' as const,
          selection: Object.freeze({
            kind: 'definition' as const,
            definitionKind: definition.definitionKind,
            id: definition.id,
          }),
          children: Object.freeze([]),
        }))),
      })),
    ]),
  })));
}

export function buildLiveOutliner(rows: StudioLiveRows): readonly StudioOutlinerNode[] {
  const spaces = new Map<number, StudioOutlinerNode[]>();
  const add = (spaceId: number, node: StudioOutlinerNode): void => {
    spaces.set(spaceId, [...(spaces.get(spaceId) ?? []), node]);
  };
  for (const row of rows.placeables) add(row.spaceId, entityNode(`placeable:${row.id}`, row.kind, 'placeable', row.spaceId));
  for (const row of rows.chests ?? []) add(row.spaceId, entityNode(`chest:${row.id}`, `Chest ${row.id}`, 'chest', row.spaceId));
  for (const row of rows.combatTargets ?? []) add(row.spaceId, entityNode(`target:${row.id}`, `Target ${row.id}`, 'combat-target', row.spaceId));
  for (const row of rows.resources ?? []) add(row.spaceId, entityNode(`resource:${row.id}`, row.kind, 'resource', row.spaceId));
  for (const row of rows.surfaces ?? []) add(row.spaceId, entityNode(`surface:${row.id}`, row.kind, 'surface', row.spaceId));
  for (const row of rows.npcs) add(row.spaceId, entityNode(
    `npc:${row.id}`, row.displayName?.trim() || row.kind, 'npc', row.spaceId,
  ));
  for (const row of rows.homesteads) add(row.spaceId, entityNode(`homestead:${row.spaceId}`, `Homestead ${row.spaceId}`, 'homestead', row.spaceId));
  for (const row of rows.players) add(row.spaceId, entityNode(`player:${row.identity.toHexString()}`, row.displayName ?? row.identity.toHexString().slice(0, 8), 'player', row.spaceId));
  return Object.freeze([...spaces].sort(([a], [b]) => a - b).map(([spaceId, children]) => Object.freeze({
    id: `live-space:${spaceId}`, label: `Space ${spaceId}`, kind: 'space' as const,
    children: Object.freeze(children.sort((a, b) => a.label.localeCompare(b.label, 'en'))),
  })));
}
