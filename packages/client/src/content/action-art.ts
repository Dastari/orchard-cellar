import { loadGeneratedAsset, type LoadedAsset } from '@orchard/ui';

/** Resolve the equipped item's authored presentation without guessing a metal
 * from its runtime kind. Pending or missing artwork never becomes an iron tool. */
export class AuthoredActionArt {
  private readonly assets = new Map<string, LoadedAsset | null>();

  constructor(
    private readonly ready: () => void,
    private readonly load: (name: string, season?: string) => Promise<LoadedAsset> = loadGeneratedAsset,
  ) {}

  resolve(name: string | undefined): LoadedAsset | null | undefined {
    if (name === undefined) return undefined;
    if (!this.assets.has(name)) {
      this.assets.set(name, null);
      void this.load(name, 'summer').then((asset) => {
        this.assets.set(name, asset);
        this.ready();
      }).catch(() => { /* Keep unavailable authored art absent. */ });
    }
    return this.assets.get(name) ?? null;
  }
}
