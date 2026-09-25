import type { ContentRegistry } from '@orchard/sim';
import { hearthLegendaryRecipeOffer, hearthRecipeExchangeNpcForRuntimeId } from '@orchard/sim/hearth-seal-exchange';
export interface HearthSealOffer {
  readonly recipeId: string; readonly itemKind: string; readonly title: string;
  readonly expectedSeals: number; readonly expectedContentHash: string;
}
const same = (a: HearthSealOffer, b: HearthSealOffer) => a.recipeId === b.recipeId
  && a.itemKind === b.itemKind && a.expectedSeals === b.expectedSeals && a.expectedContentHash === b.expectedContentHash;
/** A reducer promise only acknowledges submission. The owner-only knowledge
 * subscription confirms completion, including completion on another connection. */
export class HearthSealFlow {
  private scope: string | null = null;
  private serial = 0;
  private current: readonly HearthSealOffer[] = [];
  private reviewed: HearthSealOffer | null = null;
  private inFlight = false;
  private message = '';
  get offers() { return this.current; }
  get review() { return this.reviewed; }
  get pending() { return this.inFlight; }
  get notice() { return this.message; }
  update(scope: string | null, npcId: bigint | null, nodeId: string | null, registry: ContentRegistry | undefined, known: ReadonlySet<string>): void {
    const npc = registry !== undefined && npcId !== null
      ? hearthRecipeExchangeNpcForRuntimeId(registry, npcId.toString()) : null;
    const admitted = scope !== null && npc !== null && nodeId === 'shop';
    const nextScope = admitted ? `${scope}:${npcId}` : null;
    if (nextScope !== this.scope) {
      this.serial++; this.reviewed = null; this.inFlight = false; this.message = ''; this.scope = nextScope;
    }
    this.current = admitted ? npc.commerce!.recipeExchange!.recipes.flatMap(reference => {
      const id=reference.slice('recipe:'.length),offer = hearthLegendaryRecipeOffer(registry!,npc.id,id);
      return !offer || known.has(id) ? [] : [{ recipeId: id, itemKind: offer.itemKind, title: offer.title,
        expectedSeals: offer.seals, expectedContentHash: registry!.contentHash }];
    }) : [];
    if (!this.reviewed) return;
    if (known.has(this.reviewed.recipeId)) {
      this.serial++; this.reviewed = null; this.inFlight = false;
      this.message = 'Recipe learned. Craft it at a workbench.';
      return;
    }
    const next = this.current.find(offer => offer.recipeId === this.reviewed!.recipeId);
    if (!next || !same(next, this.reviewed)) {
      this.serial++; this.reviewed = null; this.inFlight = false; this.message = 'Recipes changed. Review again.';
    }
  }
  select(recipeId: string): boolean {
    if (this.inFlight) return false;
    const offer = this.current.find(row => row.recipeId === recipeId);
    if (!offer) return false;
    this.reviewed = Object.freeze({ ...offer }); this.message = ''; return true;
  }
  cancel(): boolean {
    if (this.inFlight) return false;
    this.reviewed = null; this.message = ''; return true;
  }
  async unlock(send: (offer: HearthSealOffer) => Promise<void>): Promise<boolean> {
    if (this.inFlight || !this.reviewed || this.scope === null) return false;
    const offer = this.reviewed, next = this.current.find(row => row.recipeId === offer.recipeId);
    if (!next || !same(next, offer)) return false;
    const serial = ++this.serial; this.inFlight = true; this.message = 'Unlocking recipe...';
    try {
      await send(offer);
      if (serial === this.serial) this.message = 'Waiting for learned recipe...';
      return true;
    } catch (error) {
      if (serial === this.serial) {
        this.inFlight = false; this.reviewed = null;
        const code = error instanceof Error ? error.message : '';
        this.message = code.includes('guardian_seals_missing') ? `Need ${offer.expectedSeals} seals in your hotbar or backpack.`
          : code.includes('recipe_already_known') ? 'Already learned. Waiting for recipe list.'
          : code.includes('merchant') ? 'Reopen the exchange merchant\'s shop.'
          : 'Exchange failed. Review again.';
      }
      return false;
    }
  }
}
