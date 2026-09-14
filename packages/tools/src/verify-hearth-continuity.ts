import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION, SURVIVAL_WORLD_SIZE, survivalBiomeAt, survivalTerrainHeightAt, survivalTerrainBlocksTraversalAt, survivalTerrainTransitions, generateSurvivalResources, survivalAuthoredLandmarkDecorations } from '@orchard/sim';
const start = performance.now();
const digest = createHash('sha256');
for (let y=256;y<=575;y++) for(let x=256;x<=575;x++) digest.update(`${x},${y}:${survivalBiomeAt(SURVIVAL_WORLD_SEED,x,y)}:${survivalTerrainHeightAt(SURVIVAL_WORLD_SEED,x,y)}:${survivalTerrainBlocksTraversalAt(SURVIVAL_WORLD_SEED,x,y,'ground')}\n`);
const hash=(value: unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const resources=generateSurvivalResources().filter(r=>r.tileX>=256&&r.tileX<=575&&r.tileY>=256&&r.tileY<=575);
const result={seed:SURVIVAL_WORLD_SEED,version:SURVIVAL_WORLD_VERSION,size:SURVIVAL_WORLD_SIZE,oldSquare:[256,575],terrainAndCollisionSha256:digest.digest('hex'),resourcesSha256:hash(resources),resourceCount:resources.length,landmarksSha256:hash(survivalAuthoredLandmarkDecorations()),transitionsSha256:hash(survivalTerrainTransitions(SURVIVAL_WORLD_SEED)),coldGenerationMs:Math.round(performance.now()-start)};
const baseline = JSON.parse(readFileSync(new URL('../../../output/doc60/legacy-island-baseline.json', import.meta.url), 'utf8')) as Record<string, unknown>;
for (const [key, value] of Object.entries(result)) {
  if (key !== 'coldGenerationMs' && JSON.stringify(baseline[key]) !== JSON.stringify(value)) {
    throw new Error(`Legacy island continuity failed: ${key}`);
  }
}
console.log(JSON.stringify({ verified: true, ...result }, null, 2));
