/** The outer painter owns the native state pair. Sprite helpers restore only
 * their own transform inside it, retaining native isolation in other contexts. */
const owned = new WeakSet<CanvasRenderingContext2D>();
export function beginPainterItem(context: CanvasRenderingContext2D): boolean {
  const nested = owned.has(context);
  context.save(); owned.add(context);
  return nested;
}
export function endPainterItem(context: CanvasRenderingContext2D, nested: boolean): void {
  if (!nested) owned.delete(context);
  context.restore();
}
export function saveSpriteTransform(context: CanvasRenderingContext2D, changesTransform: boolean): DOMMatrix | null | undefined {
  if (!owned.has(context)) { context.save(); return null; }
  return changesTransform ? context.getTransform() : undefined;
}
export function restoreSpriteTransform(context: CanvasRenderingContext2D, saved: DOMMatrix | null | undefined): void {
  if (saved === null) context.restore();
  else if (saved !== undefined) context.setTransform(saved);
}
