/** DOM Studio controls mirror the Map Editor and Item Studio palette. Canvas
 * skins remain the source of truth for production nine-slices; these colors
 * are the deterministic static/anonymous fallback and DOM table face. */
export const STUDIO_SKIN_TOKENS = Object.freeze({
  ink: '#442d25',
  mutedInk: '#76513f',
  woodDark: '#744732',
  wood: '#9d6349',
  parchment: '#f2c994',
  parchmentLight: '#fff0cc',
  parchmentHover: '#ffe7bd',
  green: '#4f8b54',
  greenDark: '#294c35',
  blue: '#36798c',
  amber: '#b97932',
  danger: '#ad3838',
  purple: '#8862a0',
  backdrop: '#202925',
});

export const STUDIO_SKIN_CSS = `
.orchard-studio {
  --studio-scale: 1;
  --studio-ink: ${STUDIO_SKIN_TOKENS.ink};
  --studio-muted-ink: ${STUDIO_SKIN_TOKENS.mutedInk};
  --studio-wood: ${STUDIO_SKIN_TOKENS.wood};
  --studio-wood-dark: ${STUDIO_SKIN_TOKENS.woodDark};
  --studio-paper: ${STUDIO_SKIN_TOKENS.parchment};
  --studio-paper-light: ${STUDIO_SKIN_TOKENS.parchmentLight};
  color: var(--studio-ink);
  font-family: "Tiny5", "Courier New", monospace;
  background: ${STUDIO_SKIN_TOKENS.backdrop};
  image-rendering: pixelated;
}
.orchard-studio [data-ui-scale="2"] { --studio-scale: 2; }
.orchard-studio [data-ui-scale="3"] { --studio-scale: 3; }
.orchard-studio-dock {
  min-width: calc(180px * var(--studio-scale));
  padding: calc(8px * var(--studio-scale));
  border: calc(2px * var(--studio-scale)) solid var(--studio-wood-dark);
  background: var(--studio-paper);
  box-shadow: inset 0 calc(-3px * var(--studio-scale)) #c4875d, 0 calc(5px * var(--studio-scale)) calc(14px * var(--studio-scale)) #17100e8a;
}
.orchard-studio-frame--wood { background: var(--studio-wood); }
.orchard-studio-frame--wood-parchment { outline: calc(5px * var(--studio-scale)) solid var(--studio-wood); outline-offset: calc(-7px * var(--studio-scale)); background: var(--studio-paper); }
.orchard-studio-frame--thin { border-width: calc(1px * var(--studio-scale)); box-shadow: none; }
.orchard-studio-tabs { display: flex; gap: calc(4px * var(--studio-scale)); border-bottom: calc(2px * var(--studio-scale)) solid #c08861; }
.orchard-studio-tab, .orchard-studio-button {
  min-height: calc(28px * var(--studio-scale));
  padding: calc(4px * var(--studio-scale)) calc(7px * var(--studio-scale));
  color: var(--studio-ink); font: inherit; border: calc(2px * var(--studio-scale)) solid #84513b;
  border-radius: calc(4px * var(--studio-scale)); background: #f7d5a5; box-shadow: inset 0 calc(-3px * var(--studio-scale)) #d89b68;
}
.orchard-studio-tab[aria-selected="true"], .orchard-studio-button.is-active { color: #fff6d7; border-color: ${STUDIO_SKIN_TOKENS.greenDark}; background: ${STUDIO_SKIN_TOKENS.green}; }
.orchard-studio-tab:disabled, .orchard-studio-button:disabled { cursor: help; opacity: .68; }
.orchard-studio :focus-visible { outline: calc(3px * var(--studio-scale)) solid ${STUDIO_SKIN_TOKENS.blue}; outline-offset: 1px; }
.orchard-studio-badge { display: inline-flex; padding: calc(2px * var(--studio-scale)) calc(4px * var(--studio-scale)); border: 1px solid currentColor; border-radius: calc(3px * var(--studio-scale)); font-size: calc(8px * var(--studio-scale)); }
.orchard-studio-badge--amber { color: #6f3e12; background: #efbb6f; }
.orchard-studio-badge--danger { color: #fff; background: ${STUDIO_SKIN_TOKENS.danger}; }
.orchard-studio-badge--blue { color: #fff; background: ${STUDIO_SKIN_TOKENS.blue}; }
.orchard-studio-badge--green { color: #fff; background: ${STUDIO_SKIN_TOKENS.green}; }
.orchard-studio-badge--muted { color: #6b4939; background: #e2bd8e; }
.orchard-studio-property { display: grid; grid-template-columns: minmax(calc(90px * var(--studio-scale)), .8fr) minmax(0, 1fr) auto; align-items: center; gap: calc(6px * var(--studio-scale)); min-height: calc(34px * var(--studio-scale)); border-bottom: 1px solid #c99066; }
.orchard-studio-property.is-invalid { border-left: calc(3px * var(--studio-scale)) solid ${STUDIO_SKIN_TOKENS.danger}; }
.orchard-studio-table { width: 100%; border-collapse: collapse; background: var(--studio-paper-light); }
.orchard-studio-table__header { position: sticky; top: 0; color: #fff6d7; background: var(--studio-wood-dark); }
.orchard-studio-table__cell { padding: calc(5px * var(--studio-scale)); border: 1px solid #b57a56; text-align: left; }
.orchard-studio-table__row:nth-child(even) { background: #f7d5a5; }
.orchard-studio-table__row.is-selected { color: #fff6d7; background: ${STUDIO_SKIN_TOKENS.green}; }
.orchard-studio-table__cell.is-invalid { box-shadow: inset 0 0 0 calc(2px * var(--studio-scale)) ${STUDIO_SKIN_TOKENS.danger}; }
`.trim();
