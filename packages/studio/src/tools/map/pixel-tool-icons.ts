import { ui, type UiElement } from '@orchard/ui/studio';

export type MapPixelTool = 'select'|'terrain'|'raise'|'lower'|'fill'|'eyedropper';
/** Reviewed PNG tool icons shared from `packages/ui/public/studio-icons`. */
const sources:Record<MapPixelTool,string>={
  select:new URL('../../../../ui/public/studio-icons/select.png',import.meta.url).href,
  terrain:new URL('../../../../ui/public/studio-icons/terrain.png',import.meta.url).href,
  raise:new URL('../../../../ui/public/studio-icons/raise.png',import.meta.url).href,
  lower:new URL('../../../../ui/public/studio-icons/lower.png',import.meta.url).href,
  fill:new URL('../../../../ui/public/studio-icons/fill.png',import.meta.url).href,
  eyedropper:new URL('../../../../ui/public/studio-icons/eyedropper.png',import.meta.url).href,
};
export function mapPixelToolIcon(name:MapPixelTool):UiElement {
  return ui.imageUrl(sources[name],{label:name,fallback:null,layout:{width:'grow',height:'grow'}});
}
