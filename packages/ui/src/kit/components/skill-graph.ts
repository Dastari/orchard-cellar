import { paintUiSelector } from './window.js';
import { paintUiSkin } from './art.js';
import type { SkillNodeDefinition } from '@orchard/sim';
import { skillNodeIsImplemented } from '@orchard/sim/skill-trees';
import type { LoadedAsset } from '../../assets.js';
import { containsPoint, type UiPoint } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, uiOffset, type UiStyle } from '../layout/box.js';
import { uiButton } from './button.js';
import { selectAtlasFrame } from '../../sprite.js';
import { uiText } from './text.js';
export interface UiSkillGraphOptions {
 readonly nodes:readonly SkillNodeDefinition[];readonly ranks:Readonly<Record<string,number>>;readonly selected?:string|null;
 readonly canLearn?:(id:string)=>boolean; readonly view?: UiSkillGraphView;
 readonly artwork?:Readonly<Record<string,LoadedAsset>>;readonly onSelect:(id:string)=>void;readonly layout?:UiStyle;
}
export interface UiSkillGraphView { readonly zoom: number; readonly pan: UiPoint; readonly fit: boolean }
export interface UiSkillGraphElement extends UiElement { readonly view: UiSkillGraphView; center():void; zoomBy(delta: number): void; updateRanks(ranks:Readonly<Record<string,number>>,selected:string|null):void }
/** Skills retain their authored graph coordinates. Arranged slot rectangles also
 * define the connector endpoints; hit testing never uses a second projection. */
/** Connector inks on parchment: learned paths green, open paths warm brown, unbuilt paths dotted and faint. */
export const SKILL_LINK_INKS = Object.freeze({ owned: '#3e8948', open: '#b86f50', planned: '#d9a47a' });
export function uiSkillGraph(options:UiSkillGraphOptions):UiSkillGraphElement {
 let ranks=options.ranks, selected=options.selected??null, zoom=options.view?.zoom??.65, pan:UiPoint=options.view?.pan??{x:0,y:0},fit=options.view?.fit??true;
 let drag:{start:UiPoint;pan:UiPoint;pointer: number}|null=null,layoutKey='';
 let nodeDrag: { start: UiPoint; pan: UiPoint } | null = null;
 const nodes=options.nodes,bounds=nodes.length?{minX:Math.min(...nodes.map(n=>n.position[0])),maxX:Math.max(...nodes.map(n=>n.position[0])),minY:Math.min(...nodes.map(n=>n.position[1])),maxY:Math.max(...nodes.map(n=>n.position[1]))}:{minX:0,maxX:0,minY:0,maxY:0};
 const cells=new Map<string,UiElement>();
 const graph=new UiElement({id:'skills.graph',kind:'skill-graph',label:'Skill graph',props:{singlePointer:true},focusable:true,pointerMode:'capture',style:{width:'grow',height:'grow',...options.layout},
  measure(element,available){const width=Number.isFinite(available.width)?available.width:320,height=Number.isFinite(available.height)?available.height:240;
   if(fit){zoom=Math.max(.35,Math.min(.65,(width-72)/Math.max(1,bounds.maxX-bounds.minX),(height-64)/Math.max(1,bounds.maxY-bounds.minY)));fit=false;}
   const key=`${width}:${height}:${zoom}:${pan.x}:${pan.y}`;
   if(layoutKey!==key){layoutKey=key;for(const node of nodes){const x=width/2+pan.x+(node.position[0]-(bounds.minX+bounds.maxX)/2)*zoom-14,y=height/2+pan.y+(node.position[1]-(bounds.minY+bounds.maxY)/2)*zoom-15;cells.get(node.id)?.setStyle({inset:{left:uiOffset(x),top:uiOffset(y)}});}element.setProps({zoom,pan},false);}
   return{min:{width:0,height:0},preferred:{width,height}};
  },
  onPointer(event){
   if(event.type==='down'&&event.button===0){drag={start:event.point,pan,pointer:event.pointerId};event.capture();return true;}
   if(drag?.pointer!==event.pointerId)return false;
   if(event.type==='move'){fit=false;pan={x:drag.pan.x+event.point.x-drag.start.x,y:drag.pan.y+event.point.y-drag.start.y};graph.invalidate();return true;}
   if(event.type==='up'||event.type==='cancel'){drag=null;event.release();return true;}return false;
  },
  onWheel(event){if(!event.deltaY)return false;zoomBy(event.deltaY<0?.1:-.1);return true;},
  onKey(event){
   if(event.key==='0'||event.key==='Home'){center();return true;}
   if(event.key==='+'||event.key==='='||event.key==='-'){zoomBy(event.key==='-'?-.1:.1);return true;}
   const delta=event.key==='ArrowLeft'?[-20,0]:event.key==='ArrowRight'?[20,0]:event.key==='ArrowUp'?[0,-20]:event.key==='ArrowDown'?[0,20]:null;
   if(!delta)return false;fit=false;pan={x:pan.x+delta[0]!,y:pan.y+delta[1]!};graph.invalidate();return true;
  },
  paint(_element,{context}){for(const node of nodes){const from=cells.get(node.id)!;for(const id of node.connects){if(node.id.localeCompare(id)>=0)continue;const to=cells.get(id),other=nodes.find(n=>n.id===id);if(!to||!other)continue;const live=skillNodeIsImplemented(node)&&skillNodeIsImplemented(other),owned=(node.root||(ranks[node.id]??0)>0)&&(other.root||(ranks[id]??0)>0);context.strokeStyle=live?(owned?SKILL_LINK_INKS.owned:SKILL_LINK_INKS.open):SKILL_LINK_INKS.planned;context.lineWidth=2;context.setLineDash(live?[]:[3,3]);context.beginPath();context.moveTo(Math.round(from.rect.x+from.rect.width/2),Math.round(from.rect.y+from.rect.height/2));context.lineTo(Math.round(to.rect.x+to.rect.width/2),Math.round(to.rect.y+to.rect.height/2));context.stroke();}}context.setLineDash([]);},
 });
 for (const node of nodes) {
  const icon = new UiElement({ kind: 'skill-icon', style: { position: 'absolute', width: 'grow', height: 'grow' },
   paint(element, { context }) {
    const state = element.parent?.props['skillState'];
    const asset = options.artwork?.[node.id];
    const source = asset && (selectAtlasFrame(asset.metadata, 'base', 0) ?? selectAtlasFrame(asset.metadata, 'idle', 0));
    const r = element.rect;
    if (asset && source) {
     const factor = Math.min(16 / source.width, 16 / source.height);
     const width = Math.max(1, Math.round(source.width * factor)), height = Math.max(1, Math.round(source.height * factor));
     context.save();
     context.globalAlpha *= state === 'placeholder' ? .42 : state === 'locked' ? .55 : state === 'available' ? .9 : 1;
     context.drawImage(asset.image, source.x, source.y, source.width, source.height,
      Math.round(r.x + (r.width - width) / 2), r.y + 4, width, height);
     context.restore();
    }
   },
  });
  const button = uiButton({ id: `skill:${node.id}`, label: '', ariaLabel: node.name,
   onPress: () => { selected = node.id; updateRanks(ranks, selected); options.onSelect(node.id); },
   drag: { threshold: 4, onMove(point, active) {
    if (!nodeDrag) nodeDrag = { start: point, pan };
    if (active) { fit = false; pan = { x: nodeDrag.pan.x + point.x - nodeDrag.start.x, y: nodeDrag.pan.y + point.y - nodeDrag.start.y }; graph.invalidate(); }
   }, onEnd() { nodeDrag = null; } },
   children: [icon], layout: { position: 'absolute', padding: 0, width: uiFixed(28), height: uiFixed(31) } });
  const slot = new UiElement({ ...button.hooks, children: [...button.children],
   onKey(event, element) { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) return true; return button.hooks.onKey?.(event, element) ?? false; },
   onFocus(focused, element, source) {
    if (!focused || source !== 'keyboard') return;
    const r = element.rect, clip = graph.contentRect;
    if (containsPoint(clip, { x: r.x, y: r.y }) && containsPoint(clip, { x: r.x + r.width - 1, y: r.y + r.height - 1 })) return;
    fit = false; pan = { x: pan.x + clip.x + clip.width / 2 - r.x - r.width / 2, y: pan.y + clip.y + clip.height / 2 - r.y - r.height / 2 }; graph.invalidate();
   },
   // Nodes are item slots: green once learned, gold when learnable, plain when locked, faded while unbuilt.
   paint(element, { context, art, hovered, focused }) {
    if (!art) return; const state = element.props['skillState'], r = element.rect;
    context.save(); if (state === 'placeholder') context.globalAlpha *= .45;
    paintUiSkin(context, art.skin.slot, state === 'owned' ? 'slot.uncommon.0' : state === 'available' ? 'slot.legendary.0' : 'slot.idle.0', r);
    context.restore();
    if (element.props['selected']) paintUiSelector(context, art.skin.selector, 'confirm', r);
    else if (hovered || focused) paintUiSelector(context, art.skin.selector, 'neutral', r);
   },
  });
  cells.set(node.id, slot);
  if (node.maxRank > 1) slot.append(uiText('', { id: `skill-rank:${node.id}`, align: 'center', outline: true,
   layout: { position: 'absolute', inset: { left: 0, right: 0, bottom: 0 }, height: uiFixed(10) } }));
  graph.append(slot);
 }

 const zoomBy=(delta:number)=>{fit=false;zoom=Math.max(.35,Math.min(1.4,zoom+delta));graph.invalidate();};
 const center=()=>{pan={x:0,y:0};fit=true;graph.invalidate();};
 const updateRanks = (next: Readonly<Record<string, number>>, selection: string | null) => {
  ranks = next; selected = selection;
  for (const node of nodes) {
   const rank = node.root ? 1 : ranks[node.id] ?? 0;
   const state = !skillNodeIsImplemented(node) ? 'placeholder' : rank > 0 ? 'owned' : options.canLearn?.(node.id) ? 'available' : 'locked';
   const tone = state === 'owned' ? 'success' : state === 'available' ? 'warning' : state === 'placeholder' ? 'muted' : 'neutral';
   const cell = cells.get(node.id)!;
   cell.setProps({ selected: node.id === selected, skillState: state, tone });
   cell.label = `${node.name}: ${state}, rank ${rank}/${node.maxRank}`;
   cell.children.find(child => child.id === `skill-rank:${node.id}`)?.setProps({ text: `${rank}/${node.maxRank}` });
  }
  graph.invalidate();
 };
 updateRanks(ranks,selected);return Object.defineProperty(Object.assign(graph,{center,zoomBy,updateRanks}),'view',{get:():UiSkillGraphView=>({zoom,pan:{...pan},fit})}) as UiSkillGraphElement;
}
