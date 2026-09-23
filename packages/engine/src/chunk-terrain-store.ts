import type { TerrainArray } from './terrain.js';
import type { CellPart, CollisionMap, CollisionObstacle, RuntimeTilesetResolver, MapSurfaceKind, TerrainOverride, TerrainTransition, TerrainSurfaceFamilyId } from '@orchard/sim';
import { WORLD_CHUNK_VOID, WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, decodeWorldChunk, type ChunkArray, type ChunkJson, type WorldChunk, type WorldChunkManifest, type WorldChunkRecord } from '@orchard/sim/world-chunk';

/** Compatibility adapter for today's contiguous TerrainArray contract.
 * No generator/compiler runs here. Unloaded cells stay blocked. */
export class ChunkTerrainStore implements TerrainArray {
  readonly spaceId: number;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly tilesets?: RuntimeTilesetResolver;
  readonly version: number;
  readonly generator?: NonNullable<TerrainArray['generator']>;
  readonly defaultCliffFamily?: string;
  readonly defaultSurfaceFamily?: TerrainSurfaceFamilyId;
  readonly cliffFamilyIds?: readonly string[];
  readonly projectionStyle?: NonNullable<TerrainArray['projectionStyle']>;
  readonly baseDatum?: number;
  readonly fixedTerrainPlane?: number | null;
  readonly raisedTerrainCollisionClassified?: true;
  readonly biomes: Uint8Array;
  readonly elevations: Int16Array;
  readonly blocked: boolean[];
  readonly horseJumpableTerrain: boolean[];
  readonly dirtCliffRoles: Uint8Array;
  readonly dirtTerraces: Uint8Array;
  readonly channels: Readonly<Record<string, ChunkArray>>;
  readonly #chunks = new Map<string, WorldChunk>();
  readonly #heads: ReadonlyMap<string, WorldChunkManifest['chunks'][number]>;
  readonly #manifest: WorldChunkManifest;
  readonly #terrainMetadata: Readonly<Record<string, ChunkJson>>;

  constructor(manifest: WorldChunkManifest, tilesets?: RuntimeTilesetResolver) {
    if (tilesets !== undefined) this.tilesets = tilesets;
    if (manifest.schema !== 1 || manifest.chunkSize !== WORLD_CHUNK_SIZE
      || !Number.isSafeInteger(manifest.width) || !Number.isSafeInteger(manifest.height)
      || manifest.width <= 0 || manifest.height <= 0 || manifest.width * manifest.height > 16_777_216) throw new TypeError('Invalid world chunk manifest dimensions');
    this.#manifest = manifest;
    this.spaceId = manifest.spaceId;
    this.width = manifest.width;
    this.height = manifest.height;
    this.#heads = new Map(manifest.chunks.map(head => [`${head.cx}:${head.cy}`, head]));
    if (this.#heads.size !== manifest.chunks.length || this.#heads.size !== Math.ceil(this.width / WORLD_CHUNK_SIZE) * Math.ceil(this.height / WORLD_CHUNK_SIZE)) throw new TypeError('Incomplete or duplicate chunk manifest');
    for (const head of manifest.chunks) if (!Number.isInteger(head.cx) || !Number.isInteger(head.cy) || head.cx < 0 || head.cy < 0
      || head.cx >= Math.ceil(this.width / WORLD_CHUNK_SIZE) || head.cy >= Math.ceil(this.height / WORLD_CHUNK_SIZE)
      || !/^[a-f0-9]{64}$/u.test(head.contentHash)) throw new TypeError('Invalid chunk head');
    const meta = manifest.metadata['terrain'] as unknown as TerrainArray;
    this.#terrainMetadata = manifest.metadata['terrain'] as Readonly<Record<string, ChunkJson>>;
    if (!meta || !Number.isSafeInteger(meta.seed) || !Number.isSafeInteger(meta.version)) throw new TypeError('Invalid terrain metadata');
    this.seed = meta.seed;
    this.version = meta.version;
    if (meta.generator !== undefined) this.generator = meta.generator;
    if (meta.defaultCliffFamily !== undefined) this.defaultCliffFamily = meta.defaultCliffFamily;
    if (meta.defaultSurfaceFamily !== undefined) this.defaultSurfaceFamily = meta.defaultSurfaceFamily;
    if (meta.cliffFamilyIds !== undefined) this.cliffFamilyIds = meta.cliffFamilyIds;
    if (meta.projectionStyle !== undefined) this.projectionStyle = meta.projectionStyle;
    if (meta.baseDatum !== undefined) this.baseDatum = meta.baseDatum;
    if (meta.fixedTerrainPlane !== undefined) this.fixedTerrainPlane = meta.fixedTerrainPlane;
    if (meta.raisedTerrainCollisionClassified !== undefined) this.raisedTerrainCollisionClassified = meta.raisedTerrainCollisionClassified;
    const channels: Record<string, ChunkArray> = Object.create(null) as Record<string, ChunkArray>;
    const specifications = manifest.metadata['channels'] as Readonly<Record<string, { readonly type: string; readonly planes: number }>>;
    if (!specifications || typeof specifications !== 'object') throw new TypeError('Missing channel specifications');
    if (Object.keys(specifications).length > 64) throw new TypeError('Too many chunk channels');
    let totalBytes = 0;
    for (const spec of Object.values(specifications)) {
      if (!spec || !Number.isInteger(spec.planes) || spec.planes < 1 || spec.planes > 256 || !['u8', 'i16'].includes(spec.type)) throw new TypeError('Invalid channel specification');
      totalBytes += this.width * this.height * spec.planes * (spec.type === 'i16' ? 2 : 1);
    }
    if (totalBytes > 512 * 1024 * 1024) throw new RangeError('Compatibility store exceeds 512 MiB channel budget');
    for (const [name, spec] of Object.entries(specifications)) {
      if (!Number.isInteger(spec.planes) || spec.planes < 1 || spec.planes > 256 || !['u8', 'i16'].includes(spec.type)) throw new TypeError('Invalid channel specification');
      channels[name] = spec.type === 'i16' ? new Int16Array(this.width * this.height * spec.planes) : new Uint8Array(this.width * this.height * spec.planes);
      if (name === 'medium') channels[name]!.fill(WORLD_CHUNK_VOID);
      if (/blocked|PlaneBlocked/iu.test(name)) channels[name]!.fill(1);
    }
    this.channels = channels;
    this.biomes = this.requiredU8('biomes');
    this.elevations = this.requiredI16('elevations');
    this.dirtCliffRoles = this.requiredU8('dirtCliffRoles');
    this.dirtTerraces = this.requiredU8('dirtTerraces');
    this.requiredU8('blocked'); this.requiredU8('horseJumpableTerrain');
    for (const name of ['cliffFamilies', 'surfaceFamilies', 'ledges', 'authoredFarmland', 'terrainPlaneBlocked']) {
      if (channels[name]) Object.defineProperty(this, name, { value: channels[name], enumerable: true });
    }
    if (this.#terrainMetadata['hasCellParts']) Object.defineProperty(this, 'cellParts', {
      get: () => {
        const parts = new Map<number, readonly CellPart[]>();
        for (const chunk of this.#chunks.values()) for (const [local, value] of Object.entries(chunk.cellParts ?? {})) {
          const index = Number(local);
          const x = chunk.cx * WORLD_CHUNK_SIZE + index % WORLD_CHUNK_SIZE;
          const y = chunk.cy * WORLD_CHUNK_SIZE + Math.floor(index / WORLD_CHUNK_SIZE);
          parts.set(y * this.width + x, value as unknown as readonly CellPart[]);
        }
        return parts;
      }, enumerable: true,
    });
    if (this.#terrainMetadata['hasTransitions']) Object.defineProperty(this, 'terrainTransitions', {
      get: () => this.records('transition').map(record => record.value as unknown as TerrainTransition), enumerable: true,
    });
    if (this.#terrainMetadata['hasOverrides']) Object.defineProperty(this, 'terrainOverrides', {
      get: () => {
        const result = Array<TerrainOverride | null>(this.width * this.height).fill(null);
        for (const record of this.records('terrainOverride')) result[record.ordinal] = record.value as unknown as TerrainOverride;
        return result;
      }, enumerable: true,
    });
    if (channels['authoredSurfaces']) Object.defineProperty(this, 'authoredSurfaces', {
      get: () => Array.from(channels['authoredSurfaces']!, index => (manifest.metadata['surfacePalette'] as readonly MapSurfaceKind[])[index]!), enumerable: true,
    });
    this.blocked = Array<boolean>(this.width * this.height).fill(true);
    this.horseJumpableTerrain = Array<boolean>(this.width * this.height).fill(false);
  }
  private requiredU8(name: string): Uint8Array {
    const value = this.channels[name];
    if (!(value instanceof Uint8Array)) throw new TypeError(`Missing u8 channel ${name}`);
    return value;
  }
  private requiredI16(name: string): Int16Array {
    const value = this.channels[name];
    if (!(value instanceof Int16Array)) throw new TypeError(`Missing i16 channel ${name}`);
    return value;
  }
  declare readonly cellParts?: ReadonlyMap<number, readonly CellPart[]>;
  declare readonly cliffFamilies?: Uint8Array;
  declare readonly surfaceFamilies?: Uint8Array;
  declare readonly ledges?: Uint8Array;
  declare readonly authoredFarmland?: Uint8Array;
  declare readonly terrainPlaneBlocked?: Uint8Array;
  declare readonly terrainTransitions?: readonly TerrainTransition[];
  declare readonly terrainOverrides?: readonly (TerrainOverride | null)[];
  declare readonly authoredSurfaces?: readonly MapSurfaceKind[];
  get complete(): boolean { return this.#chunks.size === this.#heads.size; }
  hasTile(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileY >= 0 && tileX < this.width && tileY < this.height && this.#chunks.has(`${Math.floor(tileX / WORLD_CHUNK_SIZE)}:${Math.floor(tileY / WORLD_CHUNK_SIZE)}`);
  }
  /** Returns the retained halo for future seam-local renderers. */
  chunkAt(cx: number, cy: number): WorldChunk | undefined { return this.#chunks.get(`${cx}:${cy}`); }
  install(bytes: Uint8Array): void {
    const chunk = decodeWorldChunk(bytes);
    const key = `${chunk.cx}:${chunk.cy}`;
    const head = this.#heads.get(key);
    if (!head || chunk.spaceId !== this.spaceId || chunk.assetRevision !== this.#manifest.assetRevision
      || chunk.contentHash !== head.contentHash || bytes.length !== head.byteLength) throw new TypeError('Chunk does not match manifest');
    for (const key of Object.keys(chunk.cellParts ?? {})) {
      const local = Number(key);
      if (chunk.cx * WORLD_CHUNK_SIZE + local % WORLD_CHUNK_SIZE >= this.width
        || chunk.cy * WORLD_CHUNK_SIZE + Math.floor(local / WORLD_CHUNK_SIZE) >= this.height) throw new TypeError('Chunk cell part outside map');
    }
    const entries = Object.entries(this.channels);
    if (Object.keys(chunk.arrays).length !== entries.length) throw new TypeError('Chunk channel set mismatch');
    // Validate the complete chunk before mutating any installed cells.
    for (const [name, target] of entries) {
      const source = chunk.arrays[name];
      if (!source || source.constructor !== target.constructor || source.length !== WORLD_CHUNK_STRIDE ** 2 * target.length / (this.width * this.height)) throw new TypeError(`Chunk channel mismatch: ${name}`);
    }
    for (const [name, target] of entries) {
      const source = chunk.arrays[name]!;
      const planes = target.length / (this.width * this.height);
      for (let p = 0; p < planes; p++) for (let y = 0; y < WORLD_CHUNK_SIZE; y++) for (let x = 0; x < WORLD_CHUNK_SIZE; x++) {
        const tx = chunk.cx * WORLD_CHUNK_SIZE + x, ty = chunk.cy * WORLD_CHUNK_SIZE + y;
        if (tx >= this.width || ty >= this.height) continue;
        const index = p * this.width * this.height + ty * this.width + tx;
        target[index] = source[p * WORLD_CHUNK_STRIDE ** 2 + (y + 1) * WORLD_CHUNK_STRIDE + x + 1]!;
        if (name === 'blocked') this.blocked[index] = target[index] !== 0;
        if (name === 'horseJumpableTerrain') this.horseJumpableTerrain[index] = target[index] !== 0;
      }
    }
    this.#chunks.set(key, chunk);
  }
  records(kind: string): readonly WorldChunkRecord[] {
    return [...this.#chunks.values()].flatMap(chunk => chunk.records.filter(record => record.kind === kind)).sort((a, b) => a.ordinal - b.ordinal);
  }
  collision(name: 'clientGround' | 'clientWater' | 'serverGround' | 'serverWater'): CollisionMap {
    if (!this.complete) throw new Error('Collision reconstruction requires every manifest chunk');
    const meta = (this.#manifest.metadata['collisions'] as Readonly<Record<string, ChunkJson>>)[name] as unknown as CollisionMap;
    const prefix = `${name}.`;
    const plane = this.channels[`${prefix}terrainPlaneBlocked`] as Uint8Array | undefined;
    const elevations = this.channels[`${prefix}elevations`] as Int16Array | undefined;
    const horse = this.channels[`${prefix}horseJumpableTerrain`];
    return { ...meta, width: this.width, height: this.height,
      blocked: Array.from(this.requiredU8(`${prefix}blocked`), Boolean),
      ...(plane === undefined ? {} : { terrainPlaneBlocked: plane }),
      ...(elevations === undefined ? {} : { elevations }),
      ...(horse === undefined ? {} : { horseJumpableTerrain: Array.from(horse, Boolean) }),
      ...(Object.hasOwn(meta, 'terrainTransitions') ? { terrainTransitions: this.records(`${prefix}transition`).map(record => record.value as unknown as TerrainTransition) } : {}),
      obstacles: this.records(`${prefix}obstacle`).map(record => record.value as unknown as CollisionObstacle),
    };
  }
}
