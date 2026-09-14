const KEYS = new WeakMap<object, string>();
let sequence = 0;

/** Prevents a model retained in shell tool state from keeping a disconnected
 * transport after the operator reconnects with a new StudioConnection. */
export function studioAdminServiceKey(service: object): string {
  const existing = KEYS.get(service);
  if (existing !== undefined) return existing;
  const key = `admin-service-${++sequence}`;
  KEYS.set(service, key);
  return key;
}
