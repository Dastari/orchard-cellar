export interface InspectionBounds { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
/** Shared world-space picking; callers provide visible authored bounds.
 * No action reach, authority tick, per-object interval or full-frame scan. */
export class TimingInspectionIndex<T> {
  private revision = '';
  private buckets = new Map<string, { readonly value: T; readonly bounds: InspectionBounds }[]>();
  pick(revision: string, entries: () => Iterable<{ readonly value: T; readonly bounds: InspectionBounds }>, x: number, y: number): T | null {
    if (this.revision !== revision) {
      this.revision = revision; this.buckets.clear();
      for (const entry of entries()) {
        for (let cy = Math.floor(entry.bounds.top / 16); cy <= Math.floor(entry.bounds.bottom / 16); cy++) {
          for (let cx = Math.floor(entry.bounds.left / 16); cx <= Math.floor(entry.bounds.right / 16); cx++) {
            const key = `${cx}:${cy}`, bucket = this.buckets.get(key) ?? [];
            bucket.push(entry); this.buckets.set(key, bucket);
          }
        }
      }
    }
    let result: { readonly value: T; readonly bounds: InspectionBounds } | undefined;
    for (const entry of this.buckets.get(`${Math.floor(x / 16)}:${Math.floor(y / 16)}`) ?? []) {
      const b = entry.bounds;
      if (x >= b.left && x < b.right && y >= b.top && y < b.bottom
        && (result === undefined || b.bottom >= result.bounds.bottom)) result = entry;
    }
    return result?.value ?? null;
  }
}
