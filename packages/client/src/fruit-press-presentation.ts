interface PressRow {
  readonly kind: string;
  readonly processStartTick?: bigint;
  readonly processInputKind?: string;
}

interface PressInput {
  readonly itemKind: string;
  readonly quantity: number;
}

/** Contents are a small transparent layer over the shared press body. Active
 * processing uses the public input snapshot so every observer sees the same
 * fruit; an open idle container can also preview its unprocessed input. */
export function fruitPressContentsAnimation(
  press: PressRow,
  input?: PressInput,
): string | undefined {
  if (press.kind !== 'fruit_press') return undefined;
  const item = press.processStartTick !== undefined
    ? press.processInputKind
    : input !== undefined && input.quantity > 0 ? input.itemKind : undefined;
  switch (item) {
    case 'apple': return 'contents_apple';
    case 'cherry': return 'contents_cherry';
    case 'grape': return 'contents_grape';
    case 'peach': return 'contents_peach';
    case 'pear': return 'contents_pear';
    default: return undefined;
  }
}
