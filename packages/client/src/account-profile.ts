export const LOCAL_PROFILES_KEY = 'orchard:local-profiles:v1';

export interface LocalProfiles {
  readonly names: readonly string[];
  readonly lastUsed: string | null;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function validLocalProfileName(value: string): boolean {
  return value.length >= 3
    && value.length <= 20
    && /^[A-Za-z0-9][A-Za-z0-9 '-]*[A-Za-z0-9]$/.test(value)
    && !value.includes('  ');
}

export function readLocalProfiles(storage: StorageLike): LocalProfiles {
  try {
    const parsed = JSON.parse(storage.getItem(LOCAL_PROFILES_KEY) ?? 'null') as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { names: [], lastUsed: null };
    }
    const candidate = parsed as { names?: unknown; lastUsed?: unknown };
    if (!Array.isArray(candidate.names)) return { names: [], lastUsed: null };
    const names = candidate.names
      .filter((name): name is string => typeof name === 'string' && validLocalProfileName(name))
      .filter((name, index, all) => all.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index)
      .slice(0, 12);
    const requestedLastUsed = typeof candidate.lastUsed === 'string' ? candidate.lastUsed : null;
    const lastUsed = requestedLastUsed === null
      ? null
      : names.find((name) => name.toLowerCase() === requestedLastUsed.toLowerCase()) ?? null;
    return { names, lastUsed };
  } catch {
    return { names: [], lastUsed: null };
  }
}

export function rememberLocalProfile(storage: StorageLike, rawName: string): LocalProfiles {
  const name = rawName.trim();
  if (!validLocalProfileName(name)) throw new Error('invalid_profile_name');
  const current = readLocalProfiles(storage);
  const existing = current.names.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  const chosen = existing ?? name;
  const next = {
    names: existing === undefined ? [...current.names, chosen].slice(-12) : [...current.names],
    lastUsed: chosen,
  } satisfies LocalProfiles;
  storage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(next));
  return next;
}

export function localProfileWorldUrl(name: string, base: string): string {
  if (!validLocalProfileName(name)) throw new Error('invalid_profile_name');
  const url = new URL('/overworld.html', base);
  url.searchParams.set('slot', name);
  return url.toString();
}
