import { TOOL_DURABILITY_BALANCE, type DurableToolKind } from './balance.js';

export interface ToolDurabilityDefinition {
  readonly maximum: number;
  readonly repairItemKind: 'wood' | 'stone';
}

export interface ToolWearResult {
  readonly durability: number;
  readonly broken: boolean;
}

export function isDurableToolKind(itemKind: string): itemKind is DurableToolKind {
  return Object.prototype.hasOwnProperty.call(TOOL_DURABILITY_BALANCE, itemKind);
}

export function toolDurabilityDefinition(itemKind: string): ToolDurabilityDefinition | null {
  return isDurableToolKind(itemKind) ? TOOL_DURABILITY_BALANCE[itemKind] : null;
}

/** Missing durability means a newly-created tool. Explicit zero means broken. */
export function normalizeToolDurability(itemKind: string, durability?: number): number {
  const definition = toolDurabilityDefinition(itemKind);
  if (definition === null) return 0;
  if (durability === undefined) return definition.maximum;
  if (!Number.isSafeInteger(durability)) throw new Error('tool durability must be a safe integer');
  return Math.max(0, Math.min(definition.maximum, durability));
}

export function wearTool(itemKind: string, durability: number, wear = 1): ToolWearResult {
  const definition = toolDurabilityDefinition(itemKind);
  if (definition === null) throw new Error(`item is not a durable tool: ${itemKind}`);
  if (!Number.isSafeInteger(wear) || wear <= 0) throw new Error('tool wear must be a positive safe integer');
  const next = Math.max(0, normalizeToolDurability(itemKind, durability) - wear);
  return { durability: next, broken: next === 0 };
}

export function repairTool(itemKind: string): number {
  const definition = toolDurabilityDefinition(itemKind);
  if (definition === null) throw new Error(`item is not a durable tool: ${itemKind}`);
  return definition.maximum;
}

export function durabilityFraction(itemKind: string, durability?: number): number | null {
  const definition = toolDurabilityDefinition(itemKind);
  return definition === null ? null : normalizeToolDurability(itemKind, durability) / definition.maximum;
}
