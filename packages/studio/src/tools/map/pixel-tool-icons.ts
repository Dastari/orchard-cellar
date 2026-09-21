import {UiElement} from '@orchard/ui/studio';

export type MapPixelTool = 'select'|'terrain'|'raise'|'lower'|'fill'|'eyedropper';
const sources:Record<MapPixelTool,string>={
  select:new URL('../../../../ui/public/studio-icons/select.png',import.meta.url).href,
  terrain:new URL('../../../../ui/public/studio-icons/terrain.png',import.meta.url).href,
  raise:new URL('../../../../ui/public/studio-icons/raise.png',import.meta.url).href,
  lower:new URL('../../../../ui/public/studio-icons/lower.png',import.meta.url).href,
  fill:new URL('../../../../ui/public/studio-icons/fill.png',import.meta.url).href,
  eyedropper:new URL('../../../../ui/public/studio-icons/eyedropper.png',import.meta.url).href,
};
const images=new Map<MapPixelTool,HTMLImageElement>();
export function mapPixelToolIcon(name:MapPixelTool,invalidate:()=>void):UiElement {
  if(!images.has(name)&&typeof Image!=='undefined'){
    const image=new Image();images.set(name,image);image.onload=invalidate;image.src=sources[name];
  }
  return new UiElement({kind:'map-pixel-tool-icon',label:name,props:{pixelTool:name},style:{width:'grow',height:'grow'},
    paint(element,{context}){const image=images.get(name);if(!image?.complete||!image.naturalWidth)return;
      const r=element.rect;context.imageSmoothingEnabled=false;context.drawImage(image,r.x,r.y,r.width,r.height);
    }});
}
