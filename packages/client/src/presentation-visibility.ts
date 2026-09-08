/** Reset both sides of a tab visibility transition. Hidden rAF throttling is
 * not evidence of a foreground game stall. No extra animation loop or timer. */
export function observePresentationVisibility(target: EventTarget, reset: () => void): () => void {
  target.addEventListener('visibilitychange', reset);
  return () => { target.removeEventListener('visibilitychange', reset); };
}
