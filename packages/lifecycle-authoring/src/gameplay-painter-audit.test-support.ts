import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

/** Source-policy audits follow the extracted producers and also prove that the
 * gameplay entrypoint still invokes each producer. No authority assertion is removed. */
export function gameplayPainterAuditSource(): string {
  const root = new URL('../../client/src/', import.meta.url);
  const main = readFileSync(new URL('overworld-main.ts', root), 'utf8');
  const sources = [main];
  for (const [name, entry] of [
    ['setup', 'prepareGameplayPainter'], ['decorations', 'enqueueGameplayDecorations'],
    ['resources', 'enqueueGameplayResources'], ['projectiles', 'enqueueGameplayProjectiles'],
    ['placeables', 'enqueueGameplayPlaceables'], ['npcs', 'enqueueGameplayNpcs'],
    ['players', 'enqueueGameplayPlayers'],
  ]) {
    assert(main.includes(`from './gameplay-painter-${name}.js'`), `Missing ${name} import`);
    assert(main.includes(`${entry}(`), `Missing ${name} call`);
    sources.push(readFileSync(new URL(`gameplay-painter-${name}.ts`, root), 'utf8'));
  }
  return sources.join('\n');
}
