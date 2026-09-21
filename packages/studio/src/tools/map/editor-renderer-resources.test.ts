import {it,expect,vi} from 'vitest';
vi.mock('@orchard/engine',async original=>({...await original<typeof import('@orchard/engine')>(),drawAuthoredResourceVisual:vi.fn()}));
import {drawAuthoredResourceVisual,type OverworldArt,type WorldDepthItem} from '@orchard/engine';
import {bootstrapContentRegistry} from '@orchard/sim';
import {MapEditorRenderer} from './editor-renderer.js';
import type {MapEditorLiveMarker} from './editor-controller.js';

it('draws resource trees through the gameplay visual even though they are not placeable definitions',()=>{
 const renderer=new MapEditorRenderer(()=>{});renderer.setLiveContent('trees',bootstrapContentRegistry());
 const marker={id:'resource:1',entityKind:'resource',kind:'tree',spaceId:0,tileX:2,tileY:2,worldX:40,worldY:48,elevation:0,layer:'canopy',label:'Tree',color:'#fff',footprint:{width:1,height:1},growthStage:3} as MapEditorLiveMarker;
 const queue:WorldDepthItem[]=[];
 const internal=renderer as unknown as {enqueueLiveMarker(enqueue:(x:number,y:number,item:WorldDepthItem)=>void,context:CanvasRenderingContext2D,art:OverworldArt,marker:MapEditorLiveMarker,x:number,y:number,camera:{x:number;y:number;zoom:number},frame:number):void};
 internal.enqueueLiveMarker((_x,_y,item)=>queue.push(item),{} as CanvasRenderingContext2D,{} as OverworldArt,marker,40,48,{x:0,y:0,zoom:1},0);
 expect(queue).toHaveLength(1);queue[0]!.draw();expect(drawAuthoredResourceVisual).toHaveBeenCalled();renderer.dispose();
});
