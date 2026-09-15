import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { npcBehaviourDefinitionId } from './npc-target.js';

const registry = sim.bootstrapContentRegistry();
const empty = { wildlife: null, outdoor: null, rogue: null };
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declarations = ['resolvedBehaviourTarget', 'behaviourNpcSnapshot'].map(name => {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (node === undefined) throw new Error(`missing production function ${name}`);
  return node.getText(source);
});

describe('profile-backed NPC action targets', () => {
  it('resolves a real sheep row through the production resolver used by sword/axe secondary actions', () => {
    const sheep = { id: 90001n, kind: 'sheep', spaceId: 0, x: 20 * sim.TILE_SIZE_FIXED,
      y: 20 * sim.TILE_SIZE_FIXED, moving: false, facing: 'down', health: 10,
      wanderDirection: 'idle', nextDecisionTick: 20n };
    const ctx = { db: {
      world_npc: { id: { find: (id: bigint) => id === sheep.id ? sheep : null } },
      world_wildlife_profile: { npcId: { find: () => ({ species: 'sheep' }) } },
      outdoor_enemy_profile: { npcId: { find: () => null } },
      rogue_enemy_profile: { npcId: { find: () => null } },
    } };
    const dependencies = { ...sim, contentRegistry: () => registry, npcBehaviourDefinitionId };
    const code = ts.transpileModule(declarations.join('\n') + '\nreturn resolvedBehaviourTarget;', {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const resolve = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
    expect(resolve(ctx, 'npc', sheep.id)).toMatchObject({
      kind: 'npc', ref: { entityType: 'npc', id: '90001', definitionId: 'creature:sheep' },
      snapshot: { state: { health: 10 } },
    });
    expect(resolve(ctx, 'npc', 99n)).toBeNull();
  });

  it('accepts active wildlife, authored NPCs, outdoor enemies and rogue aliases', () => {
    for (const creature of registry.creatures.values()) {
      expect(npcBehaviourDefinitionId(registry, { id: 90001n, kind: creature.species }, {
        ...empty, wildlife: { species: creature.species },
      })).toBe(creature.species === 'horse' ? 'npc:horse' : creature.id);
    }
    expect(npcBehaviourDefinitionId(registry, { id: 2n, kind: 'merchant' }, empty)).toBe('npc:marlow');
    expect(npcBehaviourDefinitionId(registry, { id: 90001n, kind: 'cowling' }, {
      ...empty, outdoor: { enemyKind: 'caldera_warden' },
    })).toBe('enemy:caldera_warden');
    expect(npcBehaviourDefinitionId(registry, { id: 90001n, kind: 'skeleton_swordman' }, {
      ...empty, rogue: {},
    })).toBe('enemy:rogue_skeleton');
  });

  it('rejects missing profiles, absent/retired definitions and explicit missing NPC references', () => {
    const sheep = { id: 90001n, kind: 'sheep' };
    const profiles = { ...empty, wildlife: { species: 'sheep' } };
    expect(npcBehaviourDefinitionId(registry, sheep, empty)).toBeNull();
    expect(npcBehaviourDefinitionId(registry, { ...sheep, definitionId: 'npc:missing' }, profiles)).toBeNull();
    expect(npcBehaviourDefinitionId({ ...registry, creatures: new Map() }, sheep, profiles)).toBeNull();
    const creatures = new Map(registry.creatures);
    creatures.set('creature:sheep', { ...creatures.get('creature:sheep')!, retired: true });
    expect(npcBehaviourDefinitionId({ ...registry, creatures }, sheep, profiles)).toBeNull();
    expect(npcBehaviourDefinitionId(registry, sheep, { ...empty, outdoor: { enemyKind: 'missing' } })).toBeNull();
    expect(npcBehaviourDefinitionId(registry, { id: 90001n, kind: 'cowling' }, { ...empty, rogue: {} })).toBeNull();
  });
});


it('uses the same two-tile mount reach on the server and never range-blocks the current rider', () => {
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'assertBehaviourTargetReach');
  if (declaration === undefined) throw new Error('missing production reach guard');
  const code = ts.transpileModule(declaration.getText(source) + '\nreturn assertBehaviourTargetReach;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies = { ...sim, contentRegistry: () => registry, SenderError: Error };
  const assertReach = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  const horse = { id: 90001n, kind: 'horse', spaceId: 0, x: 2 * sim.TILE_SIZE_FIXED, y: 0,
    rider: undefined as { isEqual: (sender: string) => boolean } | undefined };
  const position = { x: 0, y: 0, spaceId: 0 };
  const ctx = { sender: 'rider', db: {
    world_npc: { id: { find: () => horse } },
    player_position: { identity: { find: () => position } },
  } };
  const target = { kind: 'npc', snapshot: { entityType: 'npc', id: '90001', tags: [] } };
  expect(() => assertReach(ctx, target, 'use')).not.toThrow();
  horse.x += 1;
  expect(() => assertReach(ctx, target, 'use')).toThrow('behaviour_target_out_of_range');
  horse.rider = { isEqual: sender => sender === 'rider' };
  expect(() => assertReach(ctx, target, 'use')).not.toThrow();
  horse.spaceId = 1;
  expect(() => assertReach(ctx, target, 'use')).toThrow('behaviour_target_out_of_range');
});
