import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiSkinFamily } from '../skin/manifest.js';
import { UI_ICON_CATALOG } from '../skin/icon-catalog.js';
import { selectAtlasFrame } from '../../sprite.js';
import type { UiKitArt } from './art.js';
import { uiList } from './collections.js';
import { uiFlex, uiGrid } from './layout.js';
import { uiText } from './text.js';
import { uiInput } from './input.js';
export const UI_AUTHORED_FAMILIES = ['buttons','glyphs','icons','selectors','sliders','toggles','bars','frames'] as const;
export type UiAuthoredFamily = typeof UI_AUTHORED_FAMILIES[number];
export interface UiAuthoredCatalogOptions { readonly id?: string; readonly family: UiAuthoredFamily; readonly art?: UiKitArt; readonly onSelect?: (name: string) => void; readonly layout?: UiStyle }
interface Cell { readonly name: string; readonly asset: UiKitArt['skin']['frame'][string]['asset']; readonly group: string; readonly index: number; readonly row: number; readonly column: number }
export function uiAuthoredCatalog(options: UiAuthoredCatalogOptions): UiElement {
  const skinFamily: Record<UiAuthoredFamily, UiSkinFamily> = { buttons: 'button', glyphs: 'icon', icons: 'icon', selectors: 'selector', sliders: 'slider', toggles: 'toggle', bars: 'meter', frames: 'frame' };
  const artHeight = options.family === 'frames' ? 160 : 40, cellWidth = options.family === 'frames' ? 180 : 88;
  let all: readonly Cell[] = [], query = '', columns = 1, loaded: UiKitArt | undefined;
  const title = uiText(`${options.family} — loading authored cells`);
  const rows = () => { const filtered = all.filter(cell => cell.name.toLowerCase().includes(query.toLowerCase())); return Array.from({ length: Math.ceil(filtered.length / columns) }, (_, index) => filtered.slice(index * columns, (index + 1) * columns)); };
  const catalog = uiList<readonly Cell[]>({ label: `${options.family} audit`, items: [], key: row => row[0]?.name ?? '', rowHeight: uiFixed(artHeight + 24),
    onActivate: row => { if (row[0]) options.onSelect?.(row[0].name); },
    onArrange(element) {
      let root = element; while (root.parent) root = root.parent; const art = options.art ?? root.props['art'] as UiKitArt | undefined;
      if (art && loaded !== art) {
        loaded = art; const family = art.skin[skinFamily[options.family] as keyof UiKitArt['skin']], assets = new Map(Object.values(family).map(entry => [entry.asset.name, entry.asset]));
        const entries: Cell[] = [];
        for (const asset of assets.values()) {
          if (options.family === 'glyphs' && !asset.name.includes('button_glyphs') || options.family === 'icons' && !asset.name.includes('icon_catalog')) continue;
          for (const [group, frames] of Object.entries({ ...Object.fromEntries(Object.entries(asset.metadata.states ?? {}).map(([key, frame]) => [key, [frame]])), ...asset.metadata.variants, ...asset.metadata.animations })) for (let index = 0; index < frames.length; index++) {
            const width = options.family === 'icons' ? 39 : options.family === 'selectors' ? 4 : options.family === 'glyphs' ? 31 : frames.length;
            const row = Math.floor(index / width), column = index % width, name = options.family === 'icons' ? UI_ICON_CATALOG[index]?.name ?? `${group}/${index}` : `${asset.name}/${group}/${index}`;
            entries.push({ name, asset, group, index, row, column });
          }
        }
        all = entries; title.setProps({ text: `${options.family}: ${all.length} authored cells` }); element.setProps({ authoredCount: all.length, authoredNames: all.map(cell => cell.name) }, false); element.setProps({ items: rows(), active: 0 });
      }
      const count = Math.max(1, Math.floor(element.contentRect.width / cellWidth)); if (count !== columns) { columns = count; element.setProps({ items: rows(), active: 0 }); }
    },
    render: row => uiGrid({ columns, gap: 4, width: 'grow', height: 'grow' }, row.map(cell => new UiElement({ kind: 'authored-cell', label: `${cell.name} [${cell.column},${cell.row}]`, focusable: true, pointerMode: 'capture', props: { source: cell.name, row: cell.row, column: cell.column },
      style: { width: 'grow', height: 'grow', display: 'flex', direction: 'column' },
      children: [new UiElement({ kind: 'authored-art', style: { width: 'grow', height: uiFixed(artHeight) }, paint(element, { context, hovered }) {
        const source = selectAtlasFrame(cell.asset.metadata, cell.group, cell.index); if (!source) return; const r = element.rect;
        context.drawImage(cell.asset.image, source.x, source.y, source.width, source.height, r.x + Math.floor((r.width - source.width) / 2), r.y + Math.floor((r.height - source.height) / 2), source.width, source.height);
        if (hovered && options.family === 'buttons') { const outline = selectAtlasFrame(cell.asset.metadata, `hover_gold_${cell.group}`, 0); if (outline) context.drawImage(cell.asset.image, outline.x, outline.y, outline.width, outline.height, r.x + Math.floor((r.width - outline.width) / 2), r.y + Math.floor((r.height - outline.height) / 2), outline.width, outline.height); }
      } }), uiText(cell.name.replace(/^ui_cf_/u, ''), { overflow: 'ellipsis', maxLines: 1 })],
      onPointer(event) { if (event.type === 'up') { options.onSelect?.(cell.name); return true; } return event.type === 'down'; }, onKey(event) { if (event.key !== 'Enter' && event.key !== ' ') return false; options.onSelect?.(cell.name); return true; },
    }))),
  });
  return uiFlex({ id: options.id, width: 'grow', height: 'grow', gap: 4, ...options.layout }, [title, uiInput({ label: 'Find authored cell', placeholder: 'Search by name or source family', onChange: text => { query = text; catalog.setProps({ items: rows(), active: 0 }); } }), catalog]);
}
