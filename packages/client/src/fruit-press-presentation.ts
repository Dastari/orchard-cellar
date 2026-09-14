import {
  runtimeProcessorInputContentsAnimation,
  type ContentRegistry,
  type RuntimeObjectProcessor,
} from '@orchard/sim';

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
  registry: Pick<ContentRegistry, 'items'>,
  press: PressRow,
  input?: PressInput,
  runtime?: RuntimeObjectProcessor | null,
): string | undefined {
  const item = press.processStartTick !== undefined
    ? press.processInputKind
    : input !== undefined && input.quantity > 0 ? input.itemKind : undefined;
  return runtimeProcessorInputContentsAnimation(registry, runtime ?? null, item) ?? undefined;
}
