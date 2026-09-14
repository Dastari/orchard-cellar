import {
  DEFAULT_TOUCH_CONTROL_PREFERENCES,
  normalizeTouchControlPreferences,
  type TouchControlPreferences,
} from '@orchard/ui';

const KEY = 'orchard.ui.touch-controls';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Thumb placement is a preference for this browser/device. */
export function readTouchControlPreferences(storage: PreferenceStorage): TouchControlPreferences {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_TOUCH_CONTROL_PREFERENCES;
    const record = value as Record<string, unknown>;
    return normalizeTouchControlPreferences({
      swapped: record.swapped === true,
      bottomOffset: typeof record.bottomOffset === 'number' ? record.bottomOffset : 0,
    });
  } catch {
    return DEFAULT_TOUCH_CONTROL_PREFERENCES;
  }
}

export function writeTouchControlPreferences(storage: PreferenceStorage, value: TouchControlPreferences): void {
  try { storage.setItem(KEY, JSON.stringify(normalizeTouchControlPreferences(value))); } catch {
    // Controls remain usable if browser storage is unavailable.
  }
}
