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
  it('charges contact wear for resistance without cancelling other targets', () => {
    const hit = vi.fn(), finish = vi.fn();
    executeToolSwing(contacts, {
      validate: target => { if (target.kind === 'resource') throw new Error('wrong_tool'); },
      resisted: error => error instanceof Error && error.message === 'wrong_tool', spend: vi.fn(), hit, finish,
    });
    expect(hit.mock.calls.map(([target]) => target.kind)).toEqual(['npc', 'placeable']);
    expect(finish).toHaveBeenCalledExactlyOnceWith(3);
  });
  it('uses the empty swing charge and no wear when nothing is in range', () => {
    const spend = vi.fn(), finish = vi.fn(), hit = vi.fn();
    executeToolSwing([], { validate: vi.fn(), resisted: () => false, spend, hit, finish });
    expect(spend).toHaveBeenCalledExactlyOnceWith(true);
    expect(finish).toHaveBeenCalledExactlyOnceWith(0);
    expect(hit).not.toHaveBeenCalled();
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
