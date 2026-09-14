export const LEGACY_NAMEPLATES_KEY = 'orchard.ui.nameplates-visible';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function nameplatesKey(identity: string): string {
  return `orchard.ui.player.${identity}.nameplates-visible`;
}

/** Claim the old tab preference once, when the authenticated player is known. */
export function readPlayerNameplates(
  identity: string,
  storage: PreferenceStorage,
  legacyStorage: PreferenceStorage,
): boolean {
  let saved: string | null = null;
  let legacy: string | null = null;
  try {
    saved = storage.getItem(nameplatesKey(identity));
  } catch {
    // A readable tab preference can still provide the current session default.
  }
  try {
    legacy = legacyStorage.getItem(LEGACY_NAMEPLATES_KEY);
  } catch {
    // Persistent player settings work even when tab storage is unavailable.
  }
  try {
    if (saved === null && legacy !== null) storage.setItem(nameplatesKey(identity), legacy);
    if (legacy !== null) legacyStorage.removeItem(LEGACY_NAMEPLATES_KEY);
  } catch {
    // Do not discard the readable legacy preference if its migration is blocked.
  }
  return (saved ?? legacy) !== 'false';
}

export function writePlayerNameplates(identity: string, visible: boolean, storage: PreferenceStorage): void {
  try {
    storage.setItem(nameplatesKey(identity), String(visible));
  } catch {
    // The live toggle still works when browser persistence is unavailable.
  }
}
