import type { AdminJsonValue, SupportCapCapability } from '@orchard/sim';
import type { AdminPlayerMutation } from './contracts.js';

export interface SupportCapBalanceSource {
  readonly id?: string;
  readonly supportCap?: SupportCapCapability;
  readonly value?: number;
  readonly retired?: boolean;
}

export interface SupportCaps {
  readonly itemsPerMutation: number;
  readonly mutationsPerHour: number;
  readonly teleportDistanceTiles: number;
  readonly skillPointsPerMutation: number;
  readonly statDeltaPerMutation: number;
  readonly walletDeltaBronzePerMutation: number;
}

export const DEFAULT_SUPPORT_CAPS: SupportCaps = Object.freeze({
  itemsPerMutation: 20,
  mutationsPerHour: 30,
  teleportDistanceTiles: 256,
  skillPointsPerMutation: 3,
  statDeltaPerMutation: 5,
  walletDeltaBronzePerMutation: 500,
});

const CAPABILITIES = Object.freeze(Object.keys(DEFAULT_SUPPORT_CAPS) as SupportCapCapability[]);

/** Reads authored balance rows but fails closed to deliberately conservative
 * bootstrap caps until the live content head contains all six definitions. */
export function resolveSupportCaps(rows: Iterable<SupportCapBalanceSource>): SupportCaps {
  const authored = new Map<SupportCapCapability, SupportCapBalanceSource[]>();
  for (const row of rows) {
    if (row.retired === true || row.supportCap === undefined) continue;
    authored.set(row.supportCap, [...authored.get(row.supportCap) ?? [], row]);
  }
  const resolved = { ...DEFAULT_SUPPORT_CAPS };
  for (const key of CAPABILITIES) {
    const candidates = authored.get(key);
    if (candidates?.length !== 1) continue;
    const value = candidates[0]!.value;
    if (value !== undefined && Number.isSafeInteger(value) && value >= 0) resolved[key] = value;
  }
  return Object.freeze(resolved);
}

export interface SupportMutationContext {
  readonly mutationsInLastHour: number;
  readonly fromTile?: { readonly spaceId: string; readonly tileX: number; readonly tileY: number };
}

export class SupportCapError extends Error {
  constructor(readonly code: 'admin_support_cap_exceeded' | 'admin_rate_limited') {
    super(code); this.name = 'SupportCapError';
  }
}

function numericPatchMagnitude(value: AdminJsonValue): number {
  if (typeof value === 'number') return Math.abs(value);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Math.max(0, ...Object.values(value).map(numericPatchMagnitude));
}

/** Shared W2 preflight. Owner/admin callers bypass this function; a support
 * caller is accepted only when both the hourly and operation-specific caps hold. */
export function requireSupportMutationWithinCaps(
  mutation: AdminPlayerMutation,
  caps: SupportCaps,
  context: SupportMutationContext,
): void {
  if (!Number.isSafeInteger(context.mutationsInLastHour) || context.mutationsInLastHour < 0
    || context.mutationsInLastHour >= caps.mutationsPerHour) throw new SupportCapError('admin_rate_limited');
  let magnitude: number;
  let maximum: number;
  switch (mutation.operation) {
    case 'set_wallet': magnitude = Number(BigInt(mutation.deltaBronze) < 0n ? -BigInt(mutation.deltaBronze) : BigInt(mutation.deltaBronze)); maximum = caps.walletDeltaBronzePerMutation; break;
    case 'set_stats': magnitude = numericPatchMagnitude(mutation.patch); maximum = caps.statDeltaPerMutation; break;
    case 'grant_skill_points': magnitude = Math.abs(mutation.points); maximum = caps.skillPointsPerMutation; break;
    case 'give_items':
    case 'remove_items': magnitude = mutation.stacks.reduce((sum, stack) => sum + Math.max(0, stack.quantity), 0); maximum = caps.itemsPerMutation; break;
    case 'teleport_player': {
      const from = context.fromTile;
      magnitude = from === undefined || from.spaceId !== mutation.spaceId
        ? Number.POSITIVE_INFINITY
        : Math.abs(mutation.tileX - from.tileX) + Math.abs(mutation.tileY - from.tileY);
      maximum = caps.teleportDistanceTiles; break;
    }
    default: return;
  }
  if (!Number.isFinite(magnitude) || magnitude > maximum) throw new SupportCapError('admin_support_cap_exceeded');
}
