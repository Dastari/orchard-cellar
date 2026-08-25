export const CHARACTER_NAME_MIN_LENGTH = 3;
export const CHARACTER_NAME_MAX_LENGTH = 20;

export function normalizeCharacterName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9][A-Za-z0-9 '-]{1,18}[A-Za-z0-9]$/.test(name)) return null;
  return name;
}
