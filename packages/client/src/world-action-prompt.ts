/** E interacts with the nearby entity; F uses the selected item/context. An F
 * hint must never hide the independently available E interaction. Any E hint
 * from farming/context must yield to the same target that the E handler uses. */
export function worldActionPrompt(nearby: string | null, contextual: string | null): string | null {
  if (nearby === null) return contextual;
  if (contextual === null || nearby === contextual) return nearby;
  const eAction = /\[E\][\s\S]*?(?=\s+\[[A-Z]+\]|$)/g;
  const primary = nearby.match(eAction)?.[0]?.trim() ?? nearby;
  const secondary = contextual.replace(eAction, '').trim();
  if (secondary.startsWith(`${primary}  `)) return secondary;
  return secondary === '' || secondary === primary ? primary : `${primary}  ${secondary}`;
}
