import { nearestInteractionCandidate, type InteractionCandidate } from './interaction-targeting.js';

export interface WorldInteraction<Payload = unknown> extends InteractionCandidate {
  /** Fixed-point radius. Omit only when the provider has checked specialized
   * reach (for example a faced wall ladder rather than a circular radius). */
  readonly reachFixed?: number;
  /** An exclusive state action, such as dismount, owns E until it ends. */
  readonly exclusive?: boolean;
  readonly prompt: string | null;
  readonly activate: () => void;
  readonly payload?: Payload;
}

export type WorldInteractionProvider<Context, Payload = unknown> =
  (context: Context) => Iterable<WorldInteraction<Payload>>;

/** Providers only describe actions; proximity never executes their callbacks.
 * Resolve against fresh state for both the HUD and each input activation. */
export class WorldInteractionRegistry<Context, Payload = unknown> {
  private readonly providers = new Map<string, { provider: WorldInteractionProvider<Context, Payload> }>();

  register(id: string, provider: WorldInteractionProvider<Context, Payload>): () => void {
    if (this.providers.has(id)) throw new Error(`World interaction provider already registered: ${id}`);
    const registration = { provider };
    this.providers.set(id, registration);
    return () => {
      if (this.providers.get(id) === registration) this.providers.delete(id);
    };
  }

  resolve(context: Context, playerX: number, playerY: number): WorldInteraction<Payload> | null {
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) return null;
    const candidates: WorldInteraction<Payload>[] = [];
    for (const { provider } of this.providers.values()) {
      for (const candidate of provider(context)) {
        if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) continue;
        if (candidate.reachFixed !== undefined && (!Number.isFinite(candidate.reachFixed)
          || candidate.reachFixed < 0
          || Math.hypot(candidate.x - playerX, candidate.y - playerY) > candidate.reachFixed)) continue;
        candidates.push(candidate);
      }
    }
    const exclusive = candidates.filter(candidate => candidate.exclusive);
    return nearestInteractionCandidate(playerX, playerY, exclusive.length > 0 ? exclusive : candidates);
  }
}
