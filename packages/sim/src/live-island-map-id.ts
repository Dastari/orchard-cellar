/** Id of the live island map document. Generator-free leaf (static-world S6a):
 * `map-document-v3.ts` re-exports it, so chunk-era code can recognise the live
 * island without importing the document module or the generator. */
export const LIVE_ISLAND_MAP_ID = 'live-island' as const;
