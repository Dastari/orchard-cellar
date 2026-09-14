export type WorldScaleSetting = '1x' | '2x' | 'native';
export const WORLD_SCALE_KEY = 'orchard.video.world-scale';
export const WORLD_SCALE_EVENT = 'orchard:world-scale';
export interface WorldScaleStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function readWorldScale(storage: WorldScaleStorage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): WorldScaleSetting {
  const value = storage?.getItem(WORLD_SCALE_KEY);
  return value === '2x' || value === 'native' ? value : '1x';
}
export function worldScaleSettingLabel(policy: WorldScaleSetting): string {
  return policy === 'native' ? 'Native' : policy === '2x' ? '2×' : '1×';
}
export function changeWorldScale(policy: WorldScaleSetting, storage: WorldScaleStorage = localStorage): void {
  storage.setItem(WORLD_SCALE_KEY, policy);
  window.dispatchEvent(new CustomEvent(WORLD_SCALE_EVENT, { detail: policy }));
}
