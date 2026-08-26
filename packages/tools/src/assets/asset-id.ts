export function stableAssetId(key: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  const value = hash >>> 0;
  return value === 0 ? 1 : value;
}
