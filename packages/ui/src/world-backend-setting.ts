export const EXPERIMENTAL_WEBGL_KEY = 'orchard.video.experimental-webgl';
export const EXPERIMENTAL_WEBGL_EVENT = 'orchard:experimental-webgl';
interface StorageAccess { getItem(key: string): string | null; setItem(key: string, value: string): void }
let sessionChoice: boolean | undefined;
const status: { backend: 'canvas2d' | 'webgl2'; fallbackReason: string | null; preparing: boolean } = {
  backend: 'canvas2d', fallbackReason: null, preparing: false,
};
export function readExperimentalWebGL(storage?: StorageAccess): boolean {
  if (storage === undefined && sessionChoice !== undefined) return sessionChoice;
  try { return (storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage))?.getItem(EXPERIMENTAL_WEBGL_KEY) === 'true'; }
  catch { return false; }
}
export function changeExperimentalWebGL(value: boolean, storage?: StorageAccess): void {
  try { (storage ?? localStorage).setItem(EXPERIMENTAL_WEBGL_KEY, String(value)); sessionChoice = undefined; }
  catch { sessionChoice = value; }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EXPERIMENTAL_WEBGL_EVENT, { detail: value }));
}
export function worldBackendStatus(): Readonly<typeof status> { return status; }
export function updateWorldBackendStatus(backend: 'canvas2d' | 'webgl2', fallbackReason: string | null, preparing = false): void {
  status.backend = backend; status.fallbackReason = fallbackReason; status.preparing = preparing;
}
