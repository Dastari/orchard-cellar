/** A small repeatable walking square, using the same keyboard input path as
 * gameplay. It never teleports the actor or writes shared clock/content state. */
export function startRenderProtocolWalk(): () => void {
  const directions = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const;
  let current = 0;
  const dispatch = (type: 'keydown' | 'keyup', code: string) => {
    window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  };
  dispatch('keydown', directions[current]!);
  const timer = setInterval(() => {
    dispatch('keyup', directions[current]!);
    current = (current + 1) % directions.length;
    dispatch('keydown', directions[current]!);
  }, 500);
  return () => { clearInterval(timer); for (const direction of directions) dispatch('keyup', direction); };
}
