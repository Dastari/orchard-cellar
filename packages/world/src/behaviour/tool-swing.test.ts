import { describe, expect, it, vi } from 'vitest';
import { executeToolSwing, type SwingTarget } from './tool-swing.js';

describe('atomic swing accounting', () => {
  const contacts: SwingTarget[] = [{ kind: 'npc', id: 9n }, { kind: 'resource', id: 4n }, { kind: 'placeable', id: 3n }];
  it('hits every unique contact, charges stamina once, and applies contact wear after all hits', () => {
    const events: string[] = [];
    let durability = 1;
    executeToolSwing([...contacts, contacts[0]!], {
      validate: target => events.push(`validate:${target.kind}`), resisted: () => false,
      spend: empty => events.push(`spend:${empty}`),
      hit: target => { expect(durability).toBe(1); events.push(`hit:${target.kind}`); },
      finish: wear => { durability = Math.max(0, durability - wear); events.push(`wear:${wear}`); },
    });
    expect(events).toEqual(['validate:npc', 'validate:placeable', 'validate:resource', 'spend:false', 'hit:npc', 'hit:placeable', 'hit:resource', 'wear:3']);
    expect(durability).toBe(0);
  });
  it('lets a resisting contact go without wear or cancelling other targets', () => {
    const hit = vi.fn(), finish = vi.fn(), spend = vi.fn();
    executeToolSwing(contacts, {
      validate: target => { if (target.kind === 'resource') throw new Error('wrong_tool'); },
      resisted: error => error instanceof Error && error.message === 'wrong_tool', spend, hit, finish,
    });
    expect(hit.mock.calls.map(([target]) => target.kind)).toEqual(['npc', 'placeable']);
    expect(spend).toHaveBeenCalledExactlyOnceWith(false);
    expect(finish).toHaveBeenCalledExactlyOnceWith(2);
  });
  it('charges a swing that only meets resisting contacts like a miss (BUG-042)', () => {
    // A wooden pickaxe swung at a gold vein: the vein refuses, so the swing costs the
    // empty-swing vigour and no durability, exactly as a swing at empty air.
    const spend = vi.fn(), finish = vi.fn(), hit = vi.fn();
    executeToolSwing([{ kind: 'resource', id: 4n }], {
      validate: () => { throw new Error('pickaxe_tier_too_low'); },
      resisted: error => error instanceof Error && error.message === 'pickaxe_tier_too_low', spend, hit, finish,
    });
    expect(spend).toHaveBeenCalledExactlyOnceWith(true);
    expect(finish).toHaveBeenCalledExactlyOnceWith(0);
    expect(hit).not.toHaveBeenCalled();
  });
  it('uses the empty swing charge and no wear when nothing is in range', () => {
    const spend = vi.fn(), finish = vi.fn(), hit = vi.fn();
    executeToolSwing([], { validate: vi.fn(), resisted: () => false, spend, hit, finish });
    expect(spend).toHaveBeenCalledExactlyOnceWith(true);
    expect(finish).toHaveBeenCalledExactlyOnceWith(0);
    expect(hit).not.toHaveBeenCalled();
  });
  it('checks stamina against the classified charge, in preflight and before spending', () => {
    const resisting = { validate: () => { throw new Error('wrong_tool'); }, resisted: () => true };
    const preflight = vi.fn(), spend = vi.fn();
    executeToolSwing([{ kind: 'resource', id: 4n }], { ...resisting, preflight, spend, hit: vi.fn(), finish: vi.fn() }, false);
    expect(preflight).toHaveBeenCalledExactlyOnceWith(true);
    expect(spend).not.toHaveBeenCalled();
    executeToolSwing(contacts, { validate: vi.fn(), resisted: () => false, preflight, spend, hit: vi.fn(), finish: vi.fn() });
    expect(preflight).toHaveBeenLastCalledWith(false);
    const refused = vi.fn(() => { throw new Error('insufficient_vigour'); });
    expect(() => executeToolSwing(contacts, { validate: vi.fn(), resisted: () => false, preflight: refused, spend, hit: vi.fn(), finish: vi.fn() })).toThrow('insufficient_vigour');
    expect(spend).toHaveBeenCalledOnce();
  });
  it('preflight makes no mutations and unexpected failures are not treated as resistance', () => {
    const validate = vi.fn(), spend = vi.fn(), hit = vi.fn(), finish = vi.fn();
    const authority = { validate, resisted: () => false, spend, hit, finish };
    executeToolSwing(contacts, authority, false);
    expect(validate).toHaveBeenCalledTimes(3);
    expect(spend).not.toHaveBeenCalled(); expect(hit).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled();
    validate.mockImplementation(() => { throw new Error('unexpected'); });
    expect(() => executeToolSwing(contacts, authority)).toThrow('unexpected');
    expect(spend).not.toHaveBeenCalled();
  });
});
