export interface ToolDurabilityDefinition {
  readonly maximum: number;
  readonly repairItemKind: string;
}

export interface ToolWearResult {
  readonly durability: number;
  readonly broken: boolean;
}

/** Missing durability means a newly-created tool. Explicit zero means broken. */
export function normalizeToolDurability(definition: ToolDurabilityDefinition, durability?: number): number {
  if (durability === undefined) return definition.maximum;
  if (!Number.isSafeInteger(durability)) throw new Error('tool durability must be a safe integer');
  return Math.max(0, Math.min(definition.maximum, durability));
}

export function wearTool(definition: ToolDurabilityDefinition,
  durability: number, wear = 1): ToolWearResult {
  if (!Number.isSafeInteger(wear) || wear <= 0) throw new Error('tool wear must be a positive safe integer');
  const next = Math.max(0, normalizeToolDurability(definition, durability) - wear);
  return { durability: next, broken: next === 0 };
}

export function repairTool(definition: ToolDurabilityDefinition): number {
  return definition.maximum;
}

export function durabilityFraction(definition: ToolDurabilityDefinition, durability?: number): number {
  return normalizeToolDurability(definition, durability) / definition.maximum;
}
