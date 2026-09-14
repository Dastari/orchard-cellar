export type PresentationCapSetting = 'off' | '30hz';
export const PRESENTATION_CAP_KEY = 'orchard.video.presentation-cap';
export const PRESENTATION_CAP_EVENT = 'orchard:presentation-cap';
interface StorageAccess { getItem(key: string): string | null; setItem(key: string, value: string): void }
let sessionChoice: PresentationCapSetting | undefined;

/** iPad automatic opt-in awaits the physical P0 baseline; default stays off. */
export function readPresentationCap(storage?: StorageAccess): PresentationCapSetting {
  if (storage === undefined && sessionChoice !== undefined) return sessionChoice;
  try {
    const source = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    return source?.getItem(PRESENTATION_CAP_KEY) === '30hz' ? '30hz' : 'off';
  } catch { return 'off'; }
}
export function changePresentationCap(value: PresentationCapSetting, storage?: StorageAccess): void {
  try { (storage ?? localStorage).setItem(PRESENTATION_CAP_KEY, value); sessionChoice = undefined; }
  catch { sessionChoice = value; }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PRESENTATION_CAP_EVENT, { detail: value }));
}
