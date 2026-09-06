import { describe, expect, it } from 'vitest';
import { parseAdminReason, type AdminPlayerMutation } from './contracts.js';
import { DEFAULT_SUPPORT_CAPS, SupportCapError, requireSupportMutationWithinCaps, resolveSupportCaps } from './support-caps.js';

const parsedReason = parseAdminReason('Support ticket 1234');
if (!parsedReason.ok) throw new Error('fixture reason invalid');
const envelope = { targetIdentity: 'target', reason: parsedReason.value, clientMutationId: 'support-test', dryRun: true } as const;

function allowed(mutation: AdminPlayerMutation, mutationsInLastHour = 0): boolean {
  try {
    requireSupportMutationWithinCaps(mutation, DEFAULT_SUPPORT_CAPS, {
      mutationsInLastHour, fromTile: { spaceId: '1', tileX: 10, tileY: 10 },
    }); return true;
  } catch (error) {
    expect(error).toBeInstanceOf(SupportCapError); return false;
  }
}

describe('support administration caps', () => {
  it('resolves only safe integer authored overrides and keeps conservative defaults', () => {
    expect(resolveSupportCaps([
      { id: 'balance:admin_support_items_per_mutation', value: 7 },
      { id: 'balance:admin_support_mutations_per_hour', value: -1 },
    ])).toEqual({ ...DEFAULT_SUPPORT_CAPS, itemsPerMutation: 7 });
  });

  it('caps item, wallet, statistic and skill remedies', () => {
    expect(allowed({ ...envelope, operation: 'give_items', stacks: [{ itemKind: 'apple', quantity: 20 }] })).toBe(true);
    expect(allowed({ ...envelope, operation: 'give_items', stacks: [{ itemKind: 'apple', quantity: 21 }] })).toBe(false);
    expect(allowed({ ...envelope, operation: 'set_wallet', deltaBronze: '-500' })).toBe(true);
    expect(allowed({ ...envelope, operation: 'set_wallet', deltaBronze: '501' })).toBe(false);
    expect(allowed({ ...envelope, operation: 'set_stats', patch: { farming: -5 } })).toBe(true);
    expect(allowed({ ...envelope, operation: 'set_stats', patch: { farming: 6 } })).toBe(false);
    expect(allowed({ ...envelope, operation: 'grant_skill_points', track: 'farming', points: 4 })).toBe(false);
  });

  it('caps same-space Manhattan relocation and rejects cross-space support teleport', () => {
    expect(allowed({ ...envelope, operation: 'teleport_player', spaceId: '1', tileX: 138, tileY: 138 })).toBe(true);
    expect(allowed({ ...envelope, operation: 'teleport_player', spaceId: '1', tileX: 139, tileY: 138 })).toBe(false);
    expect(allowed({ ...envelope, operation: 'teleport_player', spaceId: '2', tileX: 10, tileY: 10 })).toBe(false);
  });

  it('applies the authored hourly limit before any operation-specific check', () => {
    expect(allowed({ ...envelope, operation: 'notify', body: 'Your issue is being investigated.' }, 29)).toBe(true);
    expect(allowed({ ...envelope, operation: 'notify', body: 'Your issue is being investigated.' }, 30)).toBe(false);
  });
});
