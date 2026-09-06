export type ContainerBinding = string | 'self:backpack' | 'self:hotbar';

export interface ContainerSlotRow {
  readonly containerId: string;
  readonly index: number;
  readonly itemKind: string;
  readonly quantity: number;
}

export interface BoundSlot {
  readonly containerId: string;
  readonly index: number;
  readonly itemKind: string | null;
  readonly quantity: number;
}

export function resolveContainerBinding(binding: ContainerBinding, aliases: Readonly<Record<string, string>>): string | null {
  return binding.startsWith('self:') ? aliases[binding] ?? null : binding;
}

export function bindContainerSlots(
  binding: ContainerBinding,
  capacity: number,
  rows: readonly ContainerSlotRow[],
  aliases: Readonly<Record<string, string>> = {},
): BoundSlot[] {
  const containerId = resolveContainerBinding(binding, aliases);
  if (!containerId) return [];
  const byIndex = new Map(rows.filter((row) => row.containerId === containerId).map((row) => [row.index, row]));
  return Array.from({ length: capacity }, (_, index) => {
    const row = byIndex.get(index);
    return { containerId, index, itemKind: row?.itemKind ?? null, quantity: row?.quantity ?? 0 };
  });
}
