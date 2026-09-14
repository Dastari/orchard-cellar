import type {ObjectStateDefinition} from './content/object-definition.js';
import {
  hearthFurnitureShapeFromDefinition,
  type HearthFurniturePlacement,
  type HearthFurnitureShape,
} from './hearth-furniture-placement.js';
import { placeableObjectDefinition } from './crafting.js';
import type { ContentRegistry } from './content/registry.js';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {runtimeObjectDefinition} from './content/object-capabilities.js';

function activeFurnitureShapes(registry:ContentRegistry):Readonly<Record<string,HearthFurnitureShape>>{
  return Object.freeze(Object.fromEntries([...registry.objects.values()].flatMap(definition=>{
    const shape=hearthFurnitureShapeFromDefinition(definition);
    return shape===null?[]:[[shape.id,shape]];
  })));
}

/** Explicit bootstrap compatibility for deterministic tools and isolated tests.
 * Live consumers must resolve through their installed registry. */
let bootstrapFurnitureShapes:Readonly<Record<string,HearthFurnitureShape>>|null=null;
const readBootstrapFurnitureShapes=()=>bootstrapFurnitureShapes??=activeFurnitureShapes(bootstrapContentRegistry());
export const HEARTH_FURNITURE_SHAPES:Readonly<Record<string,HearthFurnitureShape>>=new Proxy(
  Object.create(null) as Record<string,HearthFurnitureShape>,
  {
    get:(_target,key)=>Reflect.get(readBootstrapFurnitureShapes(),key),
    has:(_target,key)=>Reflect.has(readBootstrapFurnitureShapes(),key),
    ownKeys:()=>Reflect.ownKeys(readBootstrapFurnitureShapes()),
    getOwnPropertyDescriptor:(_target,key)=>Reflect.has(readBootstrapFurnitureShapes(),key)
      ?{configurable:true,enumerable:true,value:Reflect.get(readBootstrapFurnitureShapes(),key),writable:false}
      :undefined,
  },
);

/** One eligibility contract for the authority, palette and placement preview. */
export function hearthFurnitureDefinition(registry: ContentRegistry, itemKind: string) {
  const definition = placeableObjectDefinition(registry, itemKind);
  const shape = definition && hearthFurnitureShapeForPlaceable(
    registry,
    { kind: itemKind, definitionId: definition.id },
  );
  const item = registry.items.get(`item:${itemKind}`);
  if (!shape || !definition?.components.placement?.spaces.includes('residence') || !item || item.retired === true
    || item.durability !== undefined || definition.components.collision?.when !== undefined
    || (definition.components.collision?.blocksMovement ?? false) !== (shape.base !== undefined)) return null;
  return { definition, shape, item };
}

/** Kept flat alongside authored primitive states so normal open/light updates
 * can preserve the attachment without introducing another placement table. */
export const HEARTH_FURNITURE_SUPPORT_STATE_KEY = 'hearthFurnitureSupportId';
export const HEARTH_FURNITURE_REVISION_STATE_KEY = 'hearthFurnitureRevision';
const SUPPORT_KEY = HEARTH_FURNITURE_SUPPORT_STATE_KEY;
const MAX_U64 = '18446744073709551615';

export function hearthFurniturePersistentId(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value)
    && (value.length < MAX_U64.length || value <= MAX_U64);
}

export interface HearthFurnitureRowReference {
  readonly kind: string;
  readonly definitionId?: string;
}

/** A stored definition wins over the legacy kind, including unknown definitions.
 * Resolve only reviewed server-owned shapes; never accept geometry in row state. */
export function hearthFurnitureShapeForPlaceable(row:HearthFurnitureRowReference):HearthFurnitureShape|null;
export function hearthFurnitureShapeForPlaceable(
  registry:ContentRegistry,row:HearthFurnitureRowReference,
):HearthFurnitureShape|null;
export function hearthFurnitureShapeForPlaceable(
  registryOrRow:ContentRegistry|HearthFurnitureRowReference,
  maybeRow?:HearthFurnitureRowReference,
):HearthFurnitureShape|null {
  const registry=maybeRow===undefined?bootstrapContentRegistry():registryOrRow as ContentRegistry;
  const row=maybeRow??registryOrRow as HearthFurnitureRowReference;
  const definition=runtimeObjectDefinition(registry,row);
  return definition===null?null:hearthFurnitureShapeFromDefinition(definition);
}

function stateObject(stateJson: string): Record<string, unknown> {
  const state: unknown = JSON.parse(stateJson);
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('furniture_state_invalid');
  }
  return state as Record<string, unknown>;
}

/** Geometry revisions protect an inverse move from overwriting later edits.
 * Old rows begin at zero; malformed or overflowing counters never wrap. */
export function hearthFurnitureRevision(stateJson: string): bigint {
  const value = stateObject(stateJson)[HEARTH_FURNITURE_REVISION_STATE_KEY];
  if (value === undefined) return 0n;
  if (!hearthFurniturePersistentId(value)) throw new Error('furniture_revision_invalid');
  return BigInt(value);
}

export function hearthFurnitureStateWithRevision(stateJson: string, revision: bigint): string {
  if (!hearthFurniturePersistentId(revision.toString())) throw new Error('furniture_revision_invalid');
  return JSON.stringify({ ...stateObject(stateJson), [HEARTH_FURNITURE_REVISION_STATE_KEY]: revision.toString() });
}

export function hearthFurniturePreservePlacementState(nextStateJson: string, previousStateJson: string): string {
  const withSupport = hearthFurnitureStateWithSupport(nextStateJson, hearthFurnitureSupportId(previousStateJson));
  const previous = stateObject(previousStateJson);
  return previous[HEARTH_FURNITURE_REVISION_STATE_KEY] === undefined ? withSupport
    : hearthFurnitureStateWithRevision(withSupport, hearthFurnitureRevision(previousStateJson));
}

/** Invalid state must never manufacture a support link. The placement remains
 * physically solid; presentation can withhold unsupported tabletop art. */
export function hearthFurnitureSupportId(stateJson: string): string | undefined {
  try {
    const value = stateObject(stateJson)[SUPPORT_KEY];
    return hearthFurniturePersistentId(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Mutations reject corrupt state instead of silently discarding unrelated
 * container/light data. Omitted support explicitly detaches the object. */
export function hearthFurnitureStateWithSupport(stateJson: string, supportId?: string): string {
  if (supportId !== undefined && !hearthFurniturePersistentId(supportId)) {
    throw new Error('furniture_support_invalid');
  }
  const state = stateObject(stateJson);
  if (supportId === undefined) delete state[SUPPORT_KEY];
  else state[SUPPORT_KEY] = supportId;
  return JSON.stringify(state);
}

type HearthFurniturePlacementRow=HearthFurnitureRowReference & {
  readonly id: bigint | string;
  readonly tileX: number;
  readonly tileY: number;
  readonly stateJson: string;
  readonly carriedBy?: unknown;
};
export function hearthFurniturePlacementFromRow(row:HearthFurniturePlacementRow):HearthFurniturePlacement|null;
export function hearthFurniturePlacementFromRow(
  registry:ContentRegistry,row:HearthFurniturePlacementRow,
):HearthFurniturePlacement|null;
export function hearthFurniturePlacementFromRow(
  registryOrRow:ContentRegistry|HearthFurniturePlacementRow,
  maybeRow?:HearthFurniturePlacementRow,
): HearthFurniturePlacement | null {
  const registry=maybeRow===undefined?bootstrapContentRegistry():registryOrRow as ContentRegistry;
  const row=maybeRow??registryOrRow as HearthFurniturePlacementRow;
  if (row.carriedBy !== undefined) return null;
  const shape = hearthFurnitureShapeForPlaceable(registry,row), id = row.id.toString();
  if (!shape || !hearthFurniturePersistentId(id) || !Number.isInteger(row.tileX) || !Number.isInteger(row.tileY)) return null;
  const supportId = hearthFurnitureSupportId(row.stateJson);
  return { id, shape, tileX: row.tileX, tileY: row.tileY, ...(supportId === undefined ? {} : { supportId }) };
}

/** Shared admission for saved furniture, including reserved attachment/revision
 * metadata that is deliberately outside authored object state declarations. */
export function hearthFurnitureStateIsValid(stateJson:string,definitions:Readonly<Record<string,ObjectStateDefinition>>):boolean{
  try{
    const state=stateObject(stateJson);
    return Object.entries(state).every(([key,value])=>{
      if(key===HEARTH_FURNITURE_SUPPORT_STATE_KEY||key===HEARTH_FURNITURE_REVISION_STATE_KEY)return hearthFurniturePersistentId(value);
      const definition=definitions[key];if(!definition)return false;
      if(definition.type==='bool')return typeof value==='boolean';
      if(definition.type==='enum')return typeof value==='string'&&definition.values.includes(value);
      return typeof value==='number'&&Number.isSafeInteger(value)
        &&(definition.min===undefined||value>=definition.min)&&(definition.max===undefined||value<=definition.max);
    });
  }catch{return false;}
}
