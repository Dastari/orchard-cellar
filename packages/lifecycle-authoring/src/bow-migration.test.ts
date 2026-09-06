import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLifecycleSourceBundle } from './contract.js';

const source = parseLifecycleSourceBundle(JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as unknown);
const metadata = JSON.parse(readFileSync(
  new URL('../generated/item-lifecycle-metadata.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly {
  readonly itemId: string;
  readonly id: string;
  readonly prompt: string;
  readonly triggers: readonly string[];
}[] };
const client = readFileSync(new URL('../../client/src/overworld-main.ts', import.meta.url), 'utf8');
const connection = readFileSync(
  new URL('../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);
const world = readFileSync(new URL('../../world/src/index.ts', import.meta.url), 'utf8');

describe('authored bow lifecycle migration', () => {
  it('owns aimed begin, cancel, fire, and anvil repair in one bounded callback', () => {
    const handlers = source.handlers.filter(({ itemId }) => itemId === 'item:bow');
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toEqual(expect.objectContaining({
      id: 'item:bow.on_use',
      prompt: 'USE BOW',
      triggers: ['useWith', 'aimedUse'],
    }));
    const authored = handlers[0]?.source ?? '';
    expect(authored).toContain("context.event.type === 'aimedUse'");
    expect(authored).toContain("bowAction: { phase: 'begin' }");
    expect(authored).toContain("phase: 'cancel', chargeMs: context.event.chargeMs");
    expect(authored).toContain("phase: 'fire'");
    expect(authored).toContain("context.item.applyEffect('repair_selected')");
    expect(authored).not.toMatch(/ctx\.|\.db\./u);
    expect(metadata.handlers.filter(({ itemId }) => itemId === 'item:bow')).toEqual([{
      itemId: 'item:bow', event: 'onUse', id: 'item:bow.on_use', prompt: 'USE BOW',
      triggers: ['useWith', 'aimedUse'],
    }]);
  });

  it('routes phases generically while retaining prediction, animation, and audio', () => {
    expect(client).toContain("network.useSelected('aimed_use', { phase: 'begin' })");
    expect(client).toContain("network.useSelected('aimed_use', { phase: 'cancel', chargeMs })");
    expect(client).toContain("network.useSelected('aimed_use', {");
    expect(client).toContain("phase: 'fire', aimX, aimY, chargeMs");
    expect(client).toContain("function releaseBowShot()");
    expect(client).toContain("startPredictedAction('ranged_weapon', 450)");
    expect(client).toContain("audio.playSfx('tool_swing')");
    expect(client).toContain("'ARROW LOOSED'");
    expect(client).not.toContain("selectedItem(latestSnapshot) === 'bow'");
  });

  it('retires all specialized transport and reducer surfaces', () => {
    for (const name of ['beginBowCharge', 'cancelBowCharge', 'fireBow']) {
      expect(connection).not.toMatch(new RegExp(`\\n\\s{2}${name}\\(`, 'u'));
      expect(world).not.toContain(`export const ${name} =`);
    }
    for (const file of [
      'begin_bow_charge_reducer.ts', 'cancel_bow_charge_reducer.ts', 'fire_bow_reducer.ts',
    ]) expect(existsSync(new URL(`../../world-bindings/src/${file}`, import.meta.url))).toBe(false);
  });
});
