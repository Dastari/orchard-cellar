import {
  SURVIVAL_CHUNK_TILES,
  TILE_SIZE_FIXED,
  WILDLIFE_ACTIVE_RADIUS_CHUNKS,
  type CollisionMap,
  type CollisionObstacle,
} from '@orchard/sim';

export interface CollisionChunkPosition {
  readonly chunkX: number;
  readonly chunkY: number;
}

export const TICK_COLLISION_SCOPE_RADIUS_CHUNKS = WILDLIFE_ACTIVE_RADIUS_CHUNKS + 1;

export function tickCollisionChunkScope(
  players: readonly CollisionChunkPosition[],
  projectiles: readonly CollisionChunkPosition[],
): ReadonlyMap<string, readonly [chunkX: number, chunkY: number]> {
  const chunks = new Map<string, readonly [number, number]>();
  const include = (chunkX: number, chunkY: number, radius: number) => {
    for (let y = chunkY - radius; y <= chunkY + radius; y += 1) {
      for (let x = chunkX - radius; x <= chunkX + radius; x += 1) {
        chunks.set(`${x}:${y}`, [x, y]);
      }
    }
  };
  for (const player of players) {
    include(player.chunkX, player.chunkY, TICK_COLLISION_SCOPE_RADIUS_CHUNKS);
  }
  // A projectile advances at less than one tile per authority tick. One
  // neighbouring chunk on each side covers its swept segment and targets.
  for (const projectile of projectiles) include(projectile.chunkX, projectile.chunkY, 1);
  return chunks;
}

function collisionObstacleTouchesChunkScope(
  obstacle: CollisionObstacle,
  chunkScope: ReadonlySet<string>,
): boolean {
  const chunkSize = SURVIVAL_CHUNK_TILES * TILE_SIZE_FIXED;
  const left = Math.floor(obstacle.left / chunkSize);
  const right = Math.floor(obstacle.right / chunkSize);
  const top = Math.floor(obstacle.top / chunkSize);
  const bottom = Math.floor(obstacle.bottom / chunkSize);
  for (let chunkY = top; chunkY <= bottom; chunkY += 1) {
    for (let chunkX = left; chunkX <= right; chunkX += 1) {
      if (chunkScope.has(`${chunkX}:${chunkY}`)) return true;
    }
  }
  return false;
}

export function collisionWithinChunkScope(
  collision: CollisionMap,
  chunkScope: ReadonlySet<string> | undefined,
): CollisionMap {
  if (chunkScope === undefined) return collision;
  return {
    ...collision,
    obstacles: (collision.obstacles ?? []).filter((obstacle) => (
      collisionObstacleTouchesChunkScope(obstacle, chunkScope)
    )),
  };
}
