import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { itemStacksCompatible } from '@orchard/sim';

interface AuditSurface {
  readonly id: string;
  readonly custody: string;
  readonly classification: string;
  readonly clientFile: string;
  readonly clientAnchor: string;
  readonly serverFile: string;
  readonly serverAnchor: string;
  readonly rationale: string;
}

interface AuditManifest {
  readonly format: string;
  readonly classifications: readonly string[];
  readonly clientAuthorityMethods: readonly string[];
  readonly surfaces: readonly AuditSurface[];
}

const repository = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(repository, path), 'utf8');
const manifest = JSON.parse(read(
  'packages/lifecycle-authoring/audit/inventory-item-interaction-manifest.json',
)) as AuditManifest;
const game = read('packages/client/src/overworld-main.ts');
const simContainers = read('packages/sim/src/item-containers.ts');
const world = read('packages/world/src/index.ts');
const objects = JSON.parse(read('packages/assets/content/objects.json')) as {
  readonly id: string;
  readonly components: { readonly interactions?: readonly unknown[] };
}[];

describe('repository inventory-item interaction ownership audit', () => {
  it('classifies every reviewed custody surface with stable source anchors', () => {
    expect(manifest.format).toBe('orchard-inventory-item-interaction-audit-v1');
    expect(new Set(manifest.classifications)).toEqual(new Set([
      'item-owned-onUse', 'target-owned-non-item-lifecycle',
      'pure-presentation', 'engine-inventory-control',
    ]));
    expect(new Set(manifest.surfaces.map(({ id }) => id)).size).toBe(manifest.surfaces.length);
    expect(new Set(manifest.surfaces.map(({ classification }) => classification)))
      .toEqual(new Set(manifest.classifications));
    for (const surface of manifest.surfaces) {
      expect(surface.custody.length, surface.id).toBeGreaterThan(0);
      expect(surface.rationale.length, surface.id).toBeGreaterThan(24);
      expect(read(surface.clientFile), `${surface.id} client`).toContain(surface.clientAnchor);
      expect(read(surface.serverFile), `${surface.id} server`).toContain(surface.serverAnchor);
    }
  });

  it('fails when an item-affecting client authority method escapes the reviewed inventory', () => {
    const authorityNames = [...game.matchAll(/network\.([A-Za-z0-9_]+)\(/gu)]
      .map(([, name]) => name!)
      .filter((name) => name === 'interactEntity' || name === 'sortMenuContainer' || name === 'selectHotbar'
        || /(Item|Inventory|Cursor|Selected|Craft|Merchant|Trade|WorldItem|EmbeddedArrow)/u.test(name));
    expect([...new Set(authorityNames)].sort()).toEqual([...manifest.clientAuthorityMethods].sort());
  });

  it('requires ground light use to be metadata-owned and retires literal light authorities', () => {
    expect(game).toContain("selectedItemLifecycleAction(definition, 'worldItemUse')");
    expect(game).toContain("definition?.light !== undefined");
    expect(game).toContain("network.interactEntity('world_item', groundLightItem.id, 'use')");
    expect(objects.find(({ id }) => id === 'object:lantern')?.components.interactions).toEqual([]);
    expect(existsSync(resolve(repository, 'packages/world/src/behaviour/lights.ts'))).toBe(false);
    expect(simContainers).not.toContain('isSwitchableLightKind');
    expect(world).not.toContain('isSwitchableLightKind');
  });

  it('keeps lit custody, rendering, and profiles generic for authored portable lights', () => {
    const portable = { itemKind: 'authored_portable_light', quantity: 1, durability: 12 };
    expect(itemStacksCompatible(portable, { ...portable, lit: true })).toBe(true);
    expect(itemStacksCompatible(portable, { ...portable, lit: false })).toBe(false);
    expect(itemStacksCompatible({ ...portable, lit: false }, { ...portable, lit: false })).toBe(true);
    expect(itemStacksCompatible(portable, { ...portable, durability: 11 })).toBe(false);
    expect(world).toContain('lit: candidate.lit');
    expect(game).toContain('const equippedLight = equippedDefinition?.light;');
    expect(game).toContain("profile: equippedLight.profile === 'flicker' ? 'flame' : 'steady'");
    expect(game).not.toContain("equipped === 'torch'");
    expect(game).not.toContain("equipped === 'lantern'");
  });
});
