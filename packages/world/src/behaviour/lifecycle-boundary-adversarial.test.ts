import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Effect } from '@orchard/sim';

import { applyBehaviourEffects, type BehaviourEffectWriter } from './applier.js';

const applierSource = readFileSync(new URL('./applier.ts', import.meta.url), 'utf8');
const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const clientCapabilitySource = readFileSync(
  new URL('../../../client/src/selected-item-use.ts', import.meta.url),
  'utf8',
);
const clientGameSource = readFileSync(
  new URL('../../../client/src/overworld-main.ts', import.meta.url),
  'utf8',
);
const metadata = JSON.parse(readFileSync(
  new URL('../../../lifecycle-authoring/generated/item-lifecycle-metadata.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly Record<string, unknown>[] };

describe('authored lifecycle trust-boundary adversarial checks', () => {
  it('never writes a valid prefix when a later effect fails validation', () => {
    const writes: string[] = [];
    const writer: BehaviourEffectWriter = {
      validate: (kind) => {
        if (kind === 'worldTool') throw new Error('forged_world_tool');
      },
      apply: (kind) => { writes.push(kind); },
    };
    expect(() => applyBehaviourEffects([
      { giveItem: { kind: 'gold_bar', count: 1 } },
      { worldTool: { action: 'target' } },
    ], writer)).toThrow('forged_world_tool');
    expect(writes).toEqual([]);
  });

  it('runs cross-effect completeness checks before the first adapter write', () => {
    const writes: string[] = [];
    const writer: BehaviourEffectWriter = {
      validate: () => undefined,
      completeValidation: () => { throw new Error('incomplete_repair_batch'); },
      apply: (kind) => { writes.push(kind); },
    };
    expect(() => applyBehaviourEffects([
      { consumeItem: { kind: 'wood', count: 1 } },
      { repairSelected: true },
    ], writer)).toThrow('incomplete_repair_batch');
    expect(writes).toEqual([]);
    expect(applierSource.indexOf('validateBatch(effects, writer, error);'))
      .toBeLessThan(applierSource.indexOf('for (let index = 0; index < effects.length; index += 1) {',
        applierSource.indexOf('export function applyBehaviourEffects')));
  });

  it('rejects duplicate authority-owned effect lanes during preflight', () => {
    const writer = worldSource.slice(
      worldSource.indexOf('function worldBehaviourEffectWriter('),
      worldSource.indexOf('\nfunction applyWorldBehaviourEffects('),
    );
    expect(writer).toContain("if (!('worldTool' in effect) || plannedWorldTool !== undefined)");
    expect(writer).toContain("if (!('farmTool' in effect) || plannedFarmTool !== undefined)");
    expect(writer).toContain("if (!('fishing' in effect) || plannedFishing !== undefined)");
    expect(writer).toContain('plannedMeleeAttack !== undefined');
  });

  it('ships capability metadata to the client without executable authored source', () => {
    expect(clientCapabilitySource).toContain("from '@orchard/lifecycle-authoring/metadata'");
    expect(clientCapabilitySource).not.toContain("from '@orchard/lifecycle-authoring/generated'");
    expect(clientGameSource).not.toContain('bootstrap-item-on-use.source.json');
    expect(clientGameSource).not.toContain('item-lifecycles.ts');
    for (const handler of metadata.handlers) {
      expect(Object.keys(handler).sort()).toEqual(['event', 'id', 'itemId', 'prompt', 'triggers']);
      expect(handler).not.toHaveProperty('source');
      expect(handler).not.toHaveProperty('run');
      expect(handler).not.toHaveProperty('effects');
    }
  });

  it('does not accept an ambiguous or multi-opcode effect object', () => {
    const writes: string[] = [];
    const ambiguous = {
      giveItem: { kind: 'gold_bar', count: 1 },
      grantBronze: 65_535,
    } as unknown as Effect;
    expect(() => applyBehaviourEffects([ambiguous], {
      validate: () => undefined,
      apply: (kind) => { writes.push(kind); },
    })).toThrow('behaviour_effect_invalid');
    expect(writes).toEqual([]);
  });
});
