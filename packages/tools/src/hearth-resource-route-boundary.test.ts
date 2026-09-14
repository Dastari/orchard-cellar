import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('keeps Hearth resource route proof on neutral active map authority', () => {
  const sim = readFileSync(resolve(import.meta.dirname, '../../sim/src/hearth-resource-installation.ts'), 'utf8');
  expect(sim).not.toContain('HEARTH_ISLANDS');
  expect(sim).not.toContain('cinderwake');
  expect(sim).not.toContain('hearth-archipelago');
  expect(sim).toContain("region.policy === 'hostile'");
  expect(sim).toContain('candidates.length !== 1');

  const world = readFileSync(resolve(import.meta.dirname, '../../world/src/index.ts'), 'utf8');
  const start = world.indexOf('function installHearthResourceSites');
  const end = world.indexOf('export const installHearthGatheringSites', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const installation = world.slice(start, end);
  expect(installation).toContain('runtime?.document.combatRegions');
  expect(installation).toContain('regions,');
  expect(installation).not.toContain('HEARTH_ISLANDS');
  expect(installation).not.toContain('cinderwake');
});
