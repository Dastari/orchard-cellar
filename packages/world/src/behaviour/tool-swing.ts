export interface ToolSwingContact {
  /** The outer swing owns stamina, animation, statistics and durability. */
  readonly prepaid: true;
}

export interface SwingTarget {
  readonly kind: 'resource' | 'npc' | 'combat_target' | 'placeable' | 'chest';
  readonly id: bigint;
}

/** A single transaction first validates every contact, then charges once and
 * applies mutations. Durability is deferred so a breaking tool finishes the
 * already-started swing. Unexpected failures are never swallowed. */
export function executeToolSwing<T extends SwingTarget>(
  contacts: readonly T[],
  authority: {
    validate(target: T): void;
    resisted(error: unknown): boolean;
    spend(empty: boolean): void;
    hit(target: T): void;
    finish(wear: number): void;
  },
  mutate = true,
): void {
  const unique = [...new Map(contacts.map(target => [`${target.kind}:${target.id}`, target])).values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const accepted = unique.filter(target => {
    try { authority.validate(target); return true; }
    catch (error) { if (!authority.resisted(error)) throw error; return false; }
  });
  if (!mutate) return;
  authority.spend(unique.length === 0);
  for (const target of accepted) authority.hit(target);
  authority.finish(unique.length);
}
