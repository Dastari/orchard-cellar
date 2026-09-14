import { loadGeneratedAsset, type LoadedAsset } from '../../assets.js';
import { UI_SKIN_MANIFEST, type UiSkinEntry, type UiSkinFamily } from './manifest.js';

export type UiLoadedSkinFamily = Readonly<Record<string, { readonly entry: UiSkinEntry; readonly asset: LoadedAsset }>>;
export type UiLoadedSkin<F extends UiSkinFamily = UiSkinFamily> = Readonly<Record<F, UiLoadedSkinFamily>>;
export type UiSkinAssetLoader = (name: string) => Promise<LoadedAsset>;

/** Each loader owns its cache. Failed loads are evicted so a later request can retry. */
export function createUiSkinLoader(load: UiSkinAssetLoader = (name) => loadGeneratedAsset(name, 'summer')) {
  const assets = new Map<string, Promise<LoadedAsset>>();
  const families = new Map<UiSkinFamily, Promise<UiLoadedSkinFamily>>();
  function asset(name: string): Promise<LoadedAsset> {
    const existing = assets.get(name);
    if (existing) return existing;
    const request = Promise.resolve().then(() => load(name)).then((loaded) => {
      if (loaded.name !== name) throw new Error(`Missing kit art: ${name}`);
      return loaded;
    }).catch((error: unknown) => { assets.delete(name); throw error; });
    assets.set(name, request);
    return request;
  }
  function family(name: UiSkinFamily): Promise<UiLoadedSkinFamily> {
    const existing = families.get(name);
    if (existing) return existing;
    const request = Promise.all(Object.entries(UI_SKIN_MANIFEST[name]).map(async ([key, entry]) =>
      [key, Object.freeze({ entry, asset: await asset(entry.asset) })] as const))
      .then((entries) => Object.freeze(Object.fromEntries(entries)))
      .catch((error: unknown) => { families.delete(name); throw error; });
    families.set(name, request);
    return request;
  }
  return async function loadKitSkin<const F extends readonly UiSkinFamily[]>(subset: F): Promise<UiLoadedSkin<F[number]>> {
    const entries = await Promise.all([...new Set(subset)].map(async (name) => [name, await family(name)] as const));
    return Object.freeze(Object.fromEntries(entries)) as UiLoadedSkin<F[number]>;
  };
}
export const loadKitSkin = createUiSkinLoader();
